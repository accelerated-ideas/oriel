"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { planChangeTiming, type BillingPeriod, type SubscriptionPlan } from "@/config/plans";
import type { PlanChangePreview } from "@/lib/billing/stripe-billing";
import { actionChoosePlan, actionOpenBillingPortal, actionPreviewPlanChange } from "@/server-actions/billing";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { segmentedItem, segmentedTrack } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function ManageBillingButton({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        const result = await runAction(() => actionOpenBillingPortal({ organizationId }));
        if (result) window.location.assign(result.data.url);
        else setLoading(false);
      }}
    >
      Invoices and payment <ExternalLink />
    </Button>
  );
}

type Selection = { planId: string; period: BillingPeriod };
type Confirming = { plan: SubscriptionPlan; period: BillingPeriod; label: string; preview: PlanChangePreview | null };
type Current = Selection & { next: (Selection & { at: string }) | null };

const day = (iso: string) => format(new Date(iso), "MMM d, yyyy");

function bill(plan: SubscriptionPlan, period: BillingPeriod) {
  return period === "annual"
    ? `$${plan.price_config.annual_total.toLocaleString("en-US")} a year`
    : `$${plan.price_config.price.toLocaleString("en-US")} a month`;
}

export function PlanPicker({
  organizationId,
  canManage,
  plans,
  current,
}: {
  organizationId: string;
  canManage: boolean;
  plans: SubscriptionPlan[];
  current: Current | null;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>(current?.period ?? "monthly");
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const currentIndex = plans.findIndex((plan) => plan.id === current?.planId);
  const currentPlan = plans[currentIndex];

  // No plan yet: off to Checkout. Keeping the current plan drops a scheduled
  // switch; anything else is confirmed first.
  const choose = async (plan: SubscriptionPlan, label: string) => {
    if (current && !(plan.id === current.planId && period === current.period)) {
      setConfirming({ plan, period, label, preview: null });
      const result = await runAction(() => actionPreviewPlanChange({ organizationId, planId: plan.id, period }));
      setConfirming((open) =>
        open?.plan.id === plan.id && open.period === period ? (result ? { ...open, preview: result.data.preview } : null) : open,
      );
      return;
    }
    setPending(plan.id);
    const result = await runAction(() => actionChoosePlan({ organizationId, planId: plan.id, period }), {
      success: current ? `You're staying on ${plan.name}` : undefined,
    });
    if (result?.data.url) {
      window.location.assign(result.data.url);
      return;
    }
    if (result) router.refresh();
    setPending(null);
  };

  return (
    <section className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[17px] font-semibold">{current ? "Change plan" : "Choose a plan"}</h2>
        <div className={segmentedTrack} role="radiogroup" aria-label="Billing period">
          {(["monthly", "annual"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={period === value}
              onClick={() => setPeriod(value)}
              className={segmentedItem(period === value)}
            >
              {value === "monthly" ? "Monthly" : "Yearly, 2 months free"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const isCurrent = plan.id === current?.planId && period === current.period;
          const isNext = plan.id === current?.next?.planId && period === current.next.period;
          const price = period === "annual" ? plan.price_config.annual_price : plan.price_config.price;
          const label = !current
            ? `Choose ${plan.name}`
            : isCurrent
              ? current.next
                ? `Keep ${plan.name}`
                : "Current plan"
              : isNext
                ? `Starts ${format(new Date(current.next!.at), "MMM d")}`
                : plan.id === current.planId
                  ? `Switch to ${period === "annual" ? "yearly" : "monthly"}`
                  : index > currentIndex
                    ? `Upgrade to ${plan.name}`
                    : `Switch to ${plan.name}`;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl p-6",
                isCurrent ? "bg-surface shadow-[0_0_0_1.5px_var(--color-accent),0_4px_14px_-6px_rgb(99_82_242/0.35)]" : "bg-surface shadow-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[16px] font-semibold">{plan.name}</h3>
                {plan.style.is_recommended && !isCurrent && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-semibold text-accent-ink">Most popular</span>
                )}
              </div>
              <p className="mt-1 text-[13.5px] text-pretty text-muted">{plan.description}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-[40px] leading-none tabular">${price}</span>
                <span className="text-[14px] text-muted">/month</span>
              </p>
              <p className="mt-1 h-5 text-[12.5px] text-faint">
                {period === "annual" ? `$${plan.price_config.annual_total.toLocaleString("en-US")} billed yearly` : ""}
              </p>
              <Button
                className="mt-5 w-full"
                variant={isCurrent ? "soft" : plan.style.is_recommended ? "primary" : "outline"}
                disabled={(isCurrent && !current?.next) || isNext || !canManage || pending !== null}
                loading={pending === plan.id}
                onClick={() => void choose(plan, label)}
              >
                {label}
              </Button>
              <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-5">
                {plan.style.feature_list.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-2.5 text-[13.5px] text-ink-2" title={feature.tooltip ?? undefined}>
                    <Check className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2.5} />
                    {feature.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {!canManage && <p className="mt-4 text-[13.5px] text-muted">Only owners and admins can change the plan.</p>}

      {current && currentPlan && (
        <ConfirmChange
          organizationId={organizationId}
          from={{ plan: currentPlan, period: current.period }}
          target={confirming}
          onClose={() => setConfirming(null)}
          onDone={() => {
            setConfirming(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

// What a switch costs and when it happens, before it does: upgrades are
// charged the prorated difference now, the rest switch at the next billing date.
function ConfirmChange({
  organizationId,
  from,
  target,
  onClose,
  onDone,
}: {
  organizationId: string;
  from: { plan: SubscriptionPlan; period: BillingPeriod };
  target: Confirming | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const preview = target?.preview ?? null;

  const confirm = async () => {
    if (!target) return;
    setSaving(true);
    const result = await runAction(() => actionChoosePlan({ organizationId, planId: target.plan.id, period: target.period }));
    setSaving(false);
    if (!result || result.data.url !== null) return;
    const change = result.data.change;
    toast.success(change.timing === "renewal" ? `${target.plan.name} starts ${day(change.at)}` : `You're on ${target.plan.name} now`);
    onDone();
  };

  const timing = target ? planChangeTiming(from, target) : null;
  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent size="sm">
        <DialogHeader title={target?.label ?? ""} />
        <DialogBody className="flex flex-col gap-3 text-[14.5px] leading-relaxed text-ink-2">
          {!preview || !target ? (
            <p className="flex items-center gap-2 text-muted">
              <Loader2 className="size-4 animate-spin" /> Checking with Stripe…
            </p>
          ) : preview.timing === "now" ? (
            <>
              <p>
                You pay <span className="font-semibold text-ink tabular">{money(preview.amountDue, preview.currency)}</span> now: the new
                price for the rest of this billing period, minus what&apos;s left of {from.plan.name}.
                {preview.extraMessages > 0 && (
                  <>
                    {" "}
                    You get <span className="font-semibold text-ink tabular">{preview.extraMessages.toLocaleString("en-US")}</span> more
                    messages this month right away.
                  </>
                )}
              </p>
              <p className="text-muted">
                Then {target.plan.name} is {bill(target.plan, target.period)}, with{" "}
                {target.plan.includes.messages_per_month.toLocaleString("en-US")} messages a month.
              </p>
            </>
          ) : preview.timing === "renewal" ? (
            <p>
              You keep {from.plan.name} until {day(preview.at)}. Then {target.plan.name} starts at {bill(target.plan, target.period)}, with{" "}
              {target.plan.includes.messages_per_month.toLocaleString("en-US")} messages a month.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!preview || preview.timing === "same"} onClick={() => void confirm()}>
            {preview?.timing === "now"
              ? `Pay ${money(preview.amountDue, preview.currency)}`
              : preview?.timing === "renewal"
                ? `Switch on ${format(new Date(preview.at), "MMM d")}`
                : timing === "renewal"
                  ? "Switch"
                  : "Upgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
