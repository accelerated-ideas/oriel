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
};

export const WORKSPACE_BILLING_COLUMNS =
  "id, name, created_at, plan_id, billing_period, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end";

export type PlanState =
  | { kind: "trial"; plan: SubscriptionPlan; endsAt: Date; daysLeft: number }
  // Paid and current. `endsAt` is set when it's cancelled and won't renew.
  | { kind: "active"; plan: SubscriptionPlan; period: BillingPeriod; renewsAt: Date | null; endsAt: Date | null }
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
    return { kind: "active", plan, period, renewsAt, endsAt: workspace.cancel_at_period_end ? renewsAt : null };
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

// When the message allowance last reset: the start of the trial, or the
// start of the calendar month (UTC) on a paid plan.
export function messagePeriodStart(state: PlanState, now = new Date()) {
  if (state.kind === "trial") {
    const days = state.plan.includes.trial_days ?? 14;
    return new Date(state.endsAt.getTime() - days * 86_400_000);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function isServing(state: PlanState) {
  return state.kind !== "inactive";
}
