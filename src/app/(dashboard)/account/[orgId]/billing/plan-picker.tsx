"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import type { BillingPeriod, SubscriptionPlan } from "@/config/plans";
import { actionChoosePlan, actionOpenBillingPortal } from "@/server-actions/billing";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
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

export function PlanPicker({
  organizationId,
  canManage,
  plans,
  current,
}: {
  organizationId: string;
  canManage: boolean;
  plans: SubscriptionPlan[];
  current: { planId: string; period: BillingPeriod } | null;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>(current?.period ?? "monthly");
  const [pending, setPending] = useState<string | null>(null);
  const currentIndex = plans.findIndex((plan) => plan.id === current?.planId);

  const choose = async (plan: SubscriptionPlan) => {
    setPending(plan.id);
    const result = await runAction(() => actionChoosePlan({ organizationId, planId: plan.id, period }), {
      success: current ? `You're on ${plan.name} now` : undefined,
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
          const price = period === "annual" ? plan.price_config.annual_price : plan.price_config.price;
          const label = isCurrent
            ? "Current plan"
            : !current
              ? `Choose ${plan.name}`
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
                disabled={isCurrent || !canManage || pending !== null}
                loading={pending === plan.id}
                onClick={() => void choose(plan)}
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
    </section>
  );
}
