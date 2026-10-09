import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { IS_CLOUD } from "@/config/edition";
import { paidPlans } from "@/config/plans";
import { requireOrgPage } from "@/lib/auth/access";
import { countAssistants, countMembers, countMessages, getWorkspaceBilling } from "@/lib/billing/limits";
import { messagePeriodStart, planState, type PlanState } from "@/lib/billing/plan-state";
import { syncCheckoutSession } from "@/lib/billing/stripe-billing";
import { PageBody } from "@/components/dashboard/app-shell";
import { WorkspaceShell } from "@/components/dashboard/workspace-shell";
import { Card, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { ManageBillingButton, PlanPicker } from "./plan-picker";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const day = (date: Date) => format(date, "MMM d, yyyy");

function statusLine(state: PlanState) {
  switch (state.kind) {
    case "trial":
      return `Trial ends ${day(state.endsAt)}, ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"} left.`;
    case "active": {
      const price = state.period === "annual" ? state.plan.price_config.annual_total : state.plan.price_config.price;
      const cadence = state.period === "annual" ? "a year" : "a month";
      if (state.endsAt) return `Ends ${day(state.endsAt)}. It won't renew.`;
      return state.renewsAt ? `$${price.toLocaleString("en-US")} ${cadence}, renews ${day(state.renewsAt)}.` : `$${price} ${cadence}.`;
    }
    case "past-due":
      return "Your last payment failed. Update your card to keep your assistants answering.";
    case "inactive":
      return state.reason === "trial-ended"
        ? "Your trial has ended. Choose a plan to switch your assistants back on."
        : "Your subscription has ended. Choose a plan to switch your assistants back on.";
  }
}

// Messages run out, so they warn as they near the limit. Assistants and
// members are counts: being at the limit is normal, only going over is flagged.
function Meter({ label, used, limit, runsOut }: { label: string; used: number; limit: number; runsOut?: boolean }) {
  const share = limit > 0 ? Math.min(1, used / limit) : 1;
  const tone = used > limit || (runsOut && share >= 1) ? "bg-danger" : runsOut && share >= 0.8 ? "bg-warning" : "bg-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="text-muted tabular">
          <span className="font-medium text-ink">{used.toLocaleString("en-US")}</span> of {limit.toLocaleString("en-US")}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  if (!IS_CLOUD) notFound();
  const { orgId } = await params;
  const { checkout } = await searchParams;
  const context = await requireOrgPage(orgId);

  // Back from Stripe Checkout: pick up the subscription now rather than waiting for the webhook.
  if (checkout?.startsWith("cs_")) {
    await syncCheckoutSession(orgId, checkout).catch((error) => console.error("syncCheckoutSession", error));
  }

  const workspace = await getWorkspaceBilling(orgId);
  if (!workspace) notFound();
  const state = planState(workspace);
  const [messages, assistants, people] = await Promise.all([
    countMessages(orgId, messagePeriodStart(state)),
    countAssistants(orgId),
    countMembers(orgId),
  ]);
  const limits = state.plan.includes;
  const canManage = context.membership.role !== "member";
  const warning = state.kind === "past-due" || state.kind === "inactive";

  return (
    <WorkspaceShell context={context}>
      <PageBody>
        <PageHeader
          title="Billing"
          actions={workspace.stripe_customer_id && canManage ? <ManageBillingButton organizationId={orgId} /> : undefined}
        />

        {checkout && state.kind === "active" && (
          <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-success-soft px-4 py-3 text-[14px] text-success-ink">
            <CircleCheck className="size-4 shrink-0" /> You&apos;re on {state.plan.name}. Thanks for subscribing.
          </div>
        )}

        <Card className="mt-8 overflow-hidden">
          <div className="flex flex-col gap-1 p-6 sm:p-7">
            <h2 className="font-display text-[34px] leading-tight">
              {state.kind === "trial" ? "Free trial" : state.kind === "inactive" ? "No plan" : state.plan.name}
            </h2>
            <p className={cn("flex items-center gap-2 text-[14.5px]", warning ? "text-danger" : "text-ink-2")}>
              {warning && <TriangleAlert className="size-4 shrink-0" />}
              {statusLine(state)}
            </p>
          </div>
          {state.kind !== "inactive" && (
            <div className="grid gap-6 border-t border-line bg-zinc-50/70 p-6 sm:grid-cols-3 sm:p-7">
              <Meter
                label={state.kind === "trial" ? "Messages in trial" : "Messages this month"}
                used={messages}
                limit={limits.messages_per_month}
                runsOut
              />
              <Meter label="Assistants" used={assistants} limit={limits.assistants} />
              <Meter label="Members" used={people.members + people.invitations} limit={limits.seats} />
            </div>
          )}
        </Card>

        <PlanPicker
          organizationId={orgId}
          canManage={canManage}
          plans={paidPlans}
          current={state.kind === "active" || state.kind === "past-due" ? { planId: state.plan.id, period: state.period } : null}
        />
      </PageBody>
    </WorkspaceShell>
  );
}
