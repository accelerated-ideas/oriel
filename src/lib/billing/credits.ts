import "server-only";
import { after } from "next/server";
import type Stripe from "stripe";
import { getPlan, getPlanByStripePriceId, type SubscriptionPlan } from "@/config/plans";
import { sendSubscribedEmail } from "@/lib/emails/subscribed";
import { notify, notifyEvent, reportError } from "@/lib/notify";
import { platformStripe } from "@/lib/stripe-platform";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getWorkspaceBilling } from "./limits";
import { addMonthsUTC, creditWindow, type WorkspaceBilling } from "./plan-state";

// Each workspace has a stored balance of messages (organizations.message_credits).
// Each visitor message takes one (a database trigger); these grants fill it:
//   * First payment and renewals (subscription_create, subscription_cycle):
//     a new month with the plan's monthly messages.
//   * Upgrades (subscription_update): Stripe charges the prorated difference
//     right away, and the workspace gets the same share of the new plan's
//     extra messages for the rest of the month.
//   * Yearly plans, and plans set without Stripe: the refill cron
//     (/api/billing/refill) starts each new month on the billing date.
// Downgrades wait for the next billing date (a subscription schedule), so
// they arrive as a renewal. Each grant has a key and applies once, however
// often its webhook or the cron runs; the first payment also sends the
// thank-you email. Trials get theirs when the workspace is created.

const GRANTING_REASONS = new Set<Stripe.Invoice.BillingReason>(["subscription_create", "subscription_cycle", "subscription_update"]);
const LIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

// The workspace a subscription belongs to: set on it at checkout, or found
// through its customer.
export async function workspaceIdFor(subscription: Stripe.Subscription) {
  if (subscription.metadata?.organization_id) return subscription.metadata.organization_id;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { data } = await supabaseAdmin.from("organizations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id ?? null;
}

// What a plan change at `at` adds for the rest of its month: the difference
// between the plans' monthly messages, for the share of the month that's left
// (negative for a smaller plan). `renewAt` is when the month ends.
export function planChangeCredits({
  workspace,
  plan,
  periodStart,
  periodEnd,
  at,
}: {
  workspace: WorkspaceBilling;
  plan: SubscriptionPlan;
  periodStart: Date;
  periodEnd: Date;
  at: Date;
}) {
  const month = creditWindow(periodStart, periodEnd, at);
  const before = getPlan(workspace.credits_plan_id) ?? plan;
  const length = month.end.getTime() - month.start.getTime();
  const share = length > 0 ? Math.min(1, Math.max(0, (month.end.getTime() - at.getTime()) / length)) : 0;
  return {
    change: Math.round((plan.includes.messages_per_month - before.includes.messages_per_month) * share),
    renewAt: month.end,
  };
}

export async function grantInvoiceCredits(invoice: Stripe.Invoice, subscription?: Stripe.Subscription) {
  if (invoice.status !== "paid" || !invoice.billing_reason || !GRANTING_REASONS.has(invoice.billing_reason)) return;
  const reference = invoice.parent?.subscription_details?.subscription;
  if (!reference) return;
  const subscriptionId = typeof reference === "string" ? reference : reference.id;
  // Fresh from Stripe: its period is the one this invoice paid for.
  const current = subscription?.id === subscriptionId ? subscription : await platformStripe().subscriptions.retrieve(subscriptionId);
  if (!LIVE_STATUSES.has(current.status)) return;

  const organizationId = await workspaceIdFor(current);
  const item = current.items.data[0];
  const plan = item ? getPlanByStripePriceId(item.price.id) : null;
  if (!organizationId || !item || !plan) {
    console.error("Paid invoice without a workspace or a known plan", invoice.id, item?.price.id);
    await notify(`⚠️ A paid invoice has no workspace or a price that isn't a plan (invoice ${invoice.id}, price ${item?.price.id})`);
    return;
  }
  const workspace = await getWorkspaceBilling(organizationId);
  if (!workspace) return;

  const periodStart = new Date(item.current_period_start * 1000);
  const periodEnd = new Date(item.current_period_end * 1000);
  const at = new Date(invoice.created * 1000);
  let grant: { credits: number; reset: boolean; renewAt: Date };
  if (invoice.billing_reason === "subscription_update") {
    const { change, renewAt } = planChangeCredits({ workspace, plan, periodStart, periodEnd, at });
    grant = { credits: change, reset: false, renewAt };
  } else {
    grant = { credits: plan.includes.messages_per_month, reset: true, renewAt: creditWindow(periodStart, periodEnd, at).end };
  }

  const { data: granted, error } = await supabaseAdmin.rpc("grant_message_credits", {
    p_organization_id: organizationId,
    p_key: invoice.id,
    p_reason: invoice.billing_reason,
    p_credits: grant.credits,
    p_reset: grant.reset,
    p_plan_id: plan.id,
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEnd.toISOString(),
    p_renew_at: grant.renewAt.toISOString(),
  });
  if (error) throw error;

  if (granted !== true) return;
  const period = plan.stripe_config.annual_price_id === item.price.id ? "annual" : "monthly";
  const ids = { workspace: workspace.id, plan: `${plan.id} ${period}` };
  if (invoice.billing_reason === "subscription_create") {
    after(() => notifyEvent("❤️ Good news! New subscription", ids));
    const to = invoice.customer_email;
    if (to) after(() => sendSubscribedEmail(to, { plan, period, workspace: { id: workspace.id, name: workspace.name } }));
  } else if (invoice.billing_reason === "subscription_cycle") {
    after(() => notifyEvent("❤️ Good news! Subscription renewed", ids));
  } else {
    after(() => notifyEvent("⬆️ Plan changed, charged now", ids));
  }
}

// The refill cron: starts a new month for every workspace whose monthly billing
// date has come and whose paid period goes on past it, which means yearly
// plans and plans set without Stripe. A monthly plan's next month comes with
// its renewal invoice instead, so an unpaid renewal doesn't refill it.
export async function refillMonthlyCredits(now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, plan_id, credits_period_start, credits_period_end, credits_renew_at")
    .lte("credits_renew_at", now.toISOString())
    .in("subscription_status", ["active", "trialing", "past_due"])
    .order("credits_renew_at")
    .limit(1000);
  if (error) throw error;

  let refilled = 0;
  for (const workspace of data ?? []) {
    const due = new Date(workspace.credits_renew_at!);
    const periodEnd = workspace.credits_period_end ? new Date(workspace.credits_period_end) : null;
    if (periodEnd && due >= periodEnd) continue;
    const plan = getPlan(workspace.plan_id);
    if (!plan || plan.is_free_plan) continue;

    // Without Stripe, months count from the first refill and never end.
    const periodStart = workspace.credits_period_start ? new Date(workspace.credits_period_start) : due;
    const month = creditWindow(periodStart, periodEnd ?? addMonthsUTC(periodStart, 1200), now);
    const { data: granted, error: grantError } = await supabaseAdmin.rpc("grant_message_credits", {
      p_organization_id: workspace.id,
      p_key: `refill:${workspace.id}:${month.start.toISOString()}`,
      p_reason: "monthly_refill",
      p_credits: plan.includes.messages_per_month,
      p_reset: true,
      p_plan_id: plan.id,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd?.toISOString() ?? null,
      p_renew_at: month.end.toISOString(),
    });
    if (grantError) {
      await reportError("Monthly message refill", grantError, { workspace: workspace.id });
    } else if (granted === true) {
      refilled++;
    } else {
      // This month was already refilled: move on to the next refill date.
      await supabaseAdmin
        .from("organizations")
        .update({ credits_renew_at: month.end.toISOString() })
        .eq("id", workspace.id)
        .lt("credits_renew_at", month.end.toISOString());
    }
  }
  return refilled;
}
