"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { actionListStripePrices, actionUpdateActionFlags } from "@/server-actions/actions";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SafeAction } from "./tool-row";

type Plan = { price_id: string; label: string; selected: boolean };

// Choose which Stripe prices the assistant may switch customers to.
export function PlansDialog({ agentId, action, onClose }: { agentId: string; action: SafeAction | null; onClose: () => void }) {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    setPlans(null);
    const current = action.config.allowed_prices ?? [];
    void actionListStripePrices(agentId).then((result) => {
      const fromStripe = result.ok ? result.data.prices : [];
      const merged = fromStripe.map((price) => {
        const chosen = current.find((plan) => plan.price_id === price.id);
        return { price_id: price.id, label: chosen?.label ?? price.label, selected: Boolean(chosen) };
      });
      for (const plan of current) {
        if (!merged.some((item) => item.price_id === plan.price_id)) merged.push({ ...plan, selected: true });
      }
      setPlans(merged);
    });
  }, [action, agentId]);

  async function save() {
    if (!action || !plans) return;
    setSaving(true);
    await runAction(
      () =>
        actionUpdateActionFlags(agentId, action.id, {
          allowed_prices: plans.filter((plan) => plan.selected).map(({ price_id, label }) => ({ price_id, label })),
        }),
      { success: "Plans saved", onSuccess: () => { onClose(); router.refresh(); } },
    );
    setSaving(false);
  }

  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader title="Plans it can switch to" description="The label is how the assistant refers to each plan." />
        <DialogBody>
          {plans === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted" />
            </div>
          ) : plans.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-muted">No recurring prices found in this Stripe account.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {plans.map((plan, index) => (
                <div key={plan.price_id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 shadow-border">
                  <input
                    type="checkbox"
                    checked={plan.selected}
                    onChange={(e) =>
                      setPlans((current) => current!.map((item, i) => (i === index ? { ...item, selected: e.target.checked } : item)))
                    }
                    className="size-4 accent-[var(--color-ink)]"
                    aria-label={`Allow ${plan.label}`}
                  />
                  <Input
                    value={plan.label}
                    onChange={(e) =>
                      setPlans((current) => current!.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))
                    }
                    className="h-9 flex-1"
                    aria-label="Plan label"
                  />
                  <span className="hidden font-mono text-[11.5px] text-muted sm:block">{plan.price_id}</span>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!plans}>
            Save plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
