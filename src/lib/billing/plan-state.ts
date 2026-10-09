import { getPlan, TRIAL_PLAN_ID, type BillingPeriod, type SubscriptionPlan } from "@/config/plans";

// A workspace's billing columns (organizations table).
export type WorkspaceBilling = {
  id: string;
  name: string;
  created_at: string;
  plan_id: string;
  billing_period: BillingPeriod | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  // Messages left this month, and what this month's grants added up to
  // (src/lib/billing/credits.ts).
  message_credits: number;
  message_allowance: number;
  credits_plan_id: string | null;
  credits_period_start: string | null;
  credits_period_end: string | null;
  credits_renew_at: string | null;
  // A downgrade waiting for the next billing date.
  scheduled_plan_id: string | null;
  scheduled_billing_period: BillingPeriod | null;
  scheduled_change_at: string | null;
};

export const WORKSPACE_BILLING_COLUMNS =
  "id, name, created_at, plan_id, billing_period, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, message_credits, message_allowance, credits_plan_id, credits_period_start, credits_period_end, credits_renew_at, scheduled_plan_id, scheduled_billing_period, scheduled_change_at";

export type ScheduledChange = { plan: SubscriptionPlan; period: BillingPeriod; at: Date };

export type PlanState =
  | { kind: "trial"; plan: SubscriptionPlan; endsAt: Date; daysLeft: number }
  // Paid and current. `endsAt` is set when it's cancelled and won't renew;
  // `next` when it moves to another plan at the next billing date.
  | {
      kind: "active";
      plan: SubscriptionPlan;
      period: BillingPeriod;
      renewsAt: Date | null;
      endsAt: Date | null;
      next: ScheduledChange | null;
    }
  // Stripe couldn't charge the card and is retrying. Still works meanwhile.
  | { kind: "past-due"; plan: SubscriptionPlan; period: BillingPeriod; renewsAt: Date | null; endsAt: null }
  // No trial left and no subscription: the assistants stop answering.
  | { kind: "inactive"; plan: SubscriptionPlan; reason: "trial-ended" | "canceled" };

const trialPlan = () => getPlan(TRIAL_PLAN_ID)!;

export function planState(workspace: WorkspaceBilling, now = new Date()): PlanState {
  const plan = getPlan(workspace.plan_id);
  const status = workspace.subscription_status;
  const renewsAt = workspace.current_period_end ? new Date(workspace.current_period_end) : null;
  const period = workspace.billing_period ?? "monthly";

  if (plan && !plan.is_free_plan && (status === "active" || status === "trialing")) {
    const nextPlan = getPlan(workspace.scheduled_plan_id);
    const next =
      nextPlan && workspace.scheduled_change_at
        ? { plan: nextPlan, period: workspace.scheduled_billing_period ?? period, at: new Date(workspace.scheduled_change_at) }
        : null;
    return { kind: "active", plan, period, renewsAt, endsAt: workspace.cancel_at_period_end ? renewsAt : null, next };
  }
  if (plan && !plan.is_free_plan && status === "past_due") {
    return { kind: "past-due", plan, period, renewsAt, endsAt: null };
  }

  const trialEndsAt = workspace.trial_ends_at ? new Date(workspace.trial_ends_at) : null;
  if (!workspace.stripe_subscription_id && trialEndsAt && trialEndsAt > now) {
    const daysLeft = Math.max(1, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
    return { kind: "trial", plan: trialPlan(), endsAt: trialEndsAt, daysLeft };
  }
  return { kind: "inactive", plan: trialPlan(), reason: workspace.stripe_subscription_id ? "canceled" : "trial-ended" };
}

// Adds months the way Stripe bills them: a period that starts on the 31st
// renews on the last day of shorter months, then on the 31st again.
export function addMonthsUTC(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = new Date(date);
  result.setUTCFullYear(year, month, Math.min(date.getUTCDate(), lastDay));
  return result;
}

// The month of a paid billing period that `at` falls in. A monthly plan's
// period is one such month; a yearly plan's has twelve, each starting on the
// billing date. Used when messages are granted, never per message.
export function creditWindow(periodStart: Date, periodEnd: Date, at: Date) {
  const time = Math.min(Math.max(at.getTime(), periodStart.getTime()), periodEnd.getTime() - 1);
  const point = new Date(time);
  let months = Math.max(
    0,
    (point.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 + point.getUTCMonth() - periodStart.getUTCMonth(),
  );
  while (months > 0 && addMonthsUTC(periodStart, months).getTime() > time) months--;
  const start = addMonthsUTC(periodStart, months);
  const end = new Date(Math.min(addMonthsUTC(periodStart, months + 1).getTime(), periodEnd.getTime()));
  return { start, end };
}

export type MessageAllowance = {
  left: number;
  // This month's messages, including what an upgrade added.
  limit: number;
  // When the next month's messages come in, when that's known.
  renewsAt: Date | null;
};

// The workspace's stored balance. Grants set it (credits.ts), each visitor
// message takes one (a database trigger), and nothing is worked out here.
export function messageAllowance(workspace: WorkspaceBilling, state: PlanState): MessageAllowance {
  if (state.kind === "inactive") return { left: 0, limit: 0, renewsAt: null };
  return {
    left: workspace.message_credits,
    limit: workspace.message_allowance,
    renewsAt: state.kind === "trial" || !workspace.credits_renew_at ? null : new Date(workspace.credits_renew_at),
  };
}

export function isServing(state: PlanState) {
  return state.kind !== "inactive";
}
