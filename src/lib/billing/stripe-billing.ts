import "server-only";
import { after } from "next/server";
import type Stripe from "stripe";
import { appUrl } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";
import { getPlan, getPlanByStripePriceId, planChangeTiming, type BillingPeriod, type SubscriptionPlan } from "@/config/plans";
import { platformStripe } from "@/lib/stripe-platform";
import { notify, notifyEvent } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { grantInvoiceCredits, planChangeCredits, workspaceIdFor } from "./credits";
import { planState, type WorkspaceBilling } from "./plan-state";

// Subscriptions for the cloud edition, on our own Stripe account.
//   * Checkout starts a subscription.
//   * Upgrades change it right away and charge the prorated difference;
//     downgrades wait for the next billing date as a subscription schedule.
//   * Stripe's customer portal handles cards, invoices and cancelling.
// Every change comes back through syncSubscription, and every paid invoice
// through grantInvoiceCredits (credits.ts), from the webhook or right away.

export function billingConfigured() {
  return IS_CLOUD && Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePriceId(planId: string, period: BillingPeriod) {
  const plan = getPlan(planId);
  if (!plan || plan.is_free_plan) return null;
  return (period === "annual" ? plan.stripe_config.annual_price_id : plan.stripe_config.price_id) || null;
}

function planForPrice(priceId: string) {
  const plan = getPlanByStripePriceId(priceId);
  if (!plan) return null;
  return { plan, period: (plan.stripe_config.annual_price_id === priceId ? "annual" : "monthly") as BillingPeriod };
}

async function ensureCustomer(workspace: WorkspaceBilling, email: string) {
  if (workspace.stripe_customer_id) return workspace.stripe_customer_id;
  const customer = await platformStripe().customers.create(
    { name: workspace.name, email, metadata: { organization_id: workspace.id } },
    { idempotencyKey: `workspace-customer-${workspace.id}` },
  );
  await supabaseAdmin
    .from("organizations")
    .update({ stripe_customer_id: customer.id })
    .eq("id", workspace.id)
    .is("stripe_customer_id", null);
  return customer.id;
}

function billingUrl(workspaceId: string, query = "") {
  return appUrl(`/account/${workspaceId}/billing${query}`);
}

// A Stripe Checkout page for a workspace without a subscription.
export async function createCheckoutUrl(workspace: WorkspaceBilling, priceId: string, email: string) {
  const customer = await ensureCustomer(workspace, email);
  const session = await platformStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: workspace.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { organization_id: workspace.id } },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
    success_url: billingUrl(workspace.id, "?checkout={CHECKOUT_SESSION_ID}"),
    cancel_url: billingUrl(workspace.id),
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout URL");
  return session.url;
}

// The card was declined when an upgrade was charged; the plan didn't change.
export class PaymentFailedError extends Error {}

type Target = { planId: string; period: BillingPeriod };

export type PlanChangePreview =
  | { timing: "same" }
  // Charged now: `amountDue` in the currency's smallest unit, and the
  // messages added for the rest of this month.
  | { timing: "now"; amountDue: number; currency: string; extraMessages: number }
  | { timing: "renewal"; at: string };

async function loadChange(workspace: WorkspaceBilling, target: Target) {
  const subscription = await platformStripe().subscriptions.retrieve(workspace.stripe_subscription_id!);
  const item = subscription.items.data[0];
  const from = item ? planForPrice(item.price.id) : null;
  const plan = getPlan(target.planId);
  const priceId = stripePriceId(target.planId, target.period);
  if (!item || !from || !plan || !priceId) throw new Error("This plan isn't set up in Stripe yet.");
  const to = { plan, period: target.period };
  const scheduleId = typeof subscription.schedule === "string" ? subscription.schedule : (subscription.schedule?.id ?? null);
  return { subscription, item, from, to, priceId, scheduleId, timing: planChangeTiming(from, to) };
}

// What switching to `target` would do, for the confirmation before it.
export async function previewPlanChange(workspace: WorkspaceBilling, target: Target): Promise<PlanChangePreview> {
  const { subscription, item, to, priceId, timing } = await loadChange(workspace, target);
  if (timing === "same") return { timing };
  if (timing === "renewal") return { timing, at: new Date(item.current_period_end * 1000).toISOString() };

  const preview = await platformStripe().invoices.createPreview({
    customer: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    subscription: subscription.id,
    subscription_details: { items: [{ id: item.id, price: priceId, quantity: 1 }], proration_behavior: "always_invoice" },
  });
  // Stripe's time for the proration (a test clock's time in a sandbox).
  const at = preview.parent?.subscription_details?.subscription_proration_date ?? Math.floor(Date.now() / 1000);
  const grant = planChangeCredits({
    workspace,
    plan: to.plan,
    periodStart: new Date(item.current_period_start * 1000),
    periodEnd: new Date(item.current_period_end * 1000),
    at: new Date(at * 1000),
  });
  return { timing, amountDue: preview.amount_due, currency: preview.currency, extraMessages: Math.max(0, grant.change) };
}

// Switches a current subscription to `target`: right away when it costs more,
// at the next billing date otherwise. Choosing the current plan again drops
// a scheduled switch.
export type PlanChangeResult = { timing: "same" | "now" } | { timing: "renewal"; at: string };

export async function changePlan(workspace: WorkspaceBilling, target: Target): Promise<PlanChangeResult> {
  const stripe = platformStripe();
  const { subscription, item, to, priceId, scheduleId, timing } = await loadChange(workspace, target);

  if (timing === "same") {
    if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);
    await syncSubscription(await stripe.subscriptions.retrieve(subscription.id));
    return { timing };
  }

  if (timing === "renewal") {
    const schedule = scheduleId
      ? await stripe.subscriptionSchedules.retrieve(scheduleId)
      : await stripe.subscriptionSchedules.create({ from_subscription: subscription.id });
    const current =
      schedule.phases.find((phase) => phase.start_date === schedule.current_phase?.start_date) ?? schedule.phases[0];
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        { items: [{ price: item.price.id, quantity: 1 }], start_date: current.start_date, end_date: current.end_date },
        {
          items: [{ price: priceId, quantity: 1 }],
          duration: { interval: to.period === "annual" ? "year" : "month", interval_count: 1 },
        },
      ],
    });
    await syncSubscription(await stripe.subscriptions.retrieve(subscription.id));
    return { timing, at: new Date(current.end_date * 1000).toISOString() };
  }

  // An upgrade undoes a pending cancellation, and replaces a scheduled
  // downgrade once it's paid.
  let updated: Stripe.Subscription;
  try {
    updated = await stripe.subscriptions.update(subscription.id, {
      items: [{ id: item.id, price: priceId, quantity: 1 }],
      proration_behavior: "always_invoice",
      // A declined card leaves the subscription as it was.
      payment_behavior: "error_if_incomplete",
      ...(subscription.cancel_at ? { cancel_at: "" as const } : subscription.cancel_at_period_end ? { cancel_at_period_end: false } : {}),
      expand: ["latest_invoice"],
    });
  } catch (error) {
    const stripeError = error as { type?: string; statusCode?: number; message?: string };
    if (stripeError.type === "StripeCardError" || stripeError.statusCode === 402) {
      throw new PaymentFailedError(stripeError.message ?? "Your card was declined.");
    }
    throw error;
  }
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(scheduleId);
    updated = await stripe.subscriptions.retrieve(updated.id, { expand: ["latest_invoice"] });
  }
  await syncSubscription(updated);
  if (updated.latest_invoice && typeof updated.latest_invoice !== "string") {
    await grantInvoiceCredits(updated.latest_invoice, updated);
  }
  return { timing };
}

// Customer portal: card, invoices, billing details and cancelling. Plan
// changes stay in our own Billing page.
let portalConfigurationId: string | null = null;

export async function createPortalUrl(workspace: WorkspaceBilling, email: string) {
  const stripe = platformStripe();
  const customer = await ensureCustomer(workspace, email);
  portalConfigurationId ??= (
    await stripe.billingPortal.configurations.create({
      features: {
        customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: { enabled: false },
      },
    })
  ).id;
  const session = await stripe.billingPortal.sessions.create({
    customer,
    configuration: portalConfigurationId,
    return_url: billingUrl(workspace.id),
  });
  return session.url;
}

// The switch a subscription schedule makes at the next billing date. A
// schedule whose last phase is already running has nothing left to do, so it
// lets the subscription go on by itself (the portal can't cancel otherwise).
async function scheduledChange(subscription: Stripe.Subscription): Promise<{ plan: SubscriptionPlan; period: BillingPeriod; at: Date } | null> {
  const scheduleId = typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule?.id;
  if (!scheduleId) return null;
  const stripe = platformStripe();
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const current = schedule.current_phase;
  if (schedule.status !== "active" || !current) return null;
  const next = schedule.phases.find((phase) => phase.start_date >= current.end_date);
  if (!next) {
    // Best effort: the next sync tries again.
    if (schedule.end_behavior === "release") {
      await stripe.subscriptionSchedules.release(schedule.id).catch((error) => console.error("Releasing a finished schedule", error));
    }
    return null;
  }
  const price = next.items[0]?.price;
  const target = price ? planForPrice(typeof price === "string" ? price : price.id) : null;
  return target ? { ...target, at: new Date(next.start_date * 1000) } : null;
}

// Copies a subscription onto its workspace.
export async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = await workspaceIdFor(subscription);
  if (!organizationId) {
    console.error("Stripe subscription without a workspace", subscription.id);
    await notify(`⚠️ A Stripe subscription has no workspace (subscription ${subscription.id})`);
    return;
  }

  const { data: current } = await supabaseAdmin
    .from("organizations")
    .select("stripe_subscription_id, subscription_status, cancel_at_period_end, scheduled_plan_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!current) return;
  // An old subscription's late events must not overwrite a newer, live one.
  const live = ["active", "trialing", "past_due"];
  if (
    current.stripe_subscription_id &&
    current.stripe_subscription_id !== subscription.id &&
    live.includes(current.subscription_status ?? "") &&
    !live.includes(subscription.status)
  ) {
    return;
  }

  const item = subscription.items.data[0];
  const target = item ? planForPrice(item.price.id) : null;
  if (!target) {
    console.error("Stripe price isn't in subscription-plans.ts", item?.price.id);
    await notify(`⚠️ A subscription's price isn't in subscription-plans.ts (subscription ${subscription.id}, price ${item?.price.id})`);
  }
  const periodEnd = subscription.cancel_at ?? item?.current_period_end ?? null;
  const next = live.includes(subscription.status) ? await scheduledChange(subscription) : null;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await supabaseAdmin
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      ...(target ? { plan_id: target.plan.id, billing_period: target.period } : {}),
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
      scheduled_plan_id: next?.plan.id ?? null,
      scheduled_billing_period: next?.period ?? null,
      scheduled_change_at: next?.at.toISOString() ?? null,
    })
    .eq("id", organizationId);

  // Tell the team what changed: a cancellation, its end, a scheduled downgrade.
  if (current.stripe_subscription_id !== subscription.id) return;
  const cancelling = subscription.cancel_at_period_end || Boolean(subscription.cancel_at);
  const ids = { workspace: organizationId, plan: target ? `${target.plan.id} ${target.period}` : null };
  const day = (time: Date) => time.toISOString().slice(0, 10);
  if (live.includes(current.subscription_status ?? "") && !live.includes(subscription.status)) {
    after(() => notifyEvent("💔 Subscription ended", ids));
  } else if (live.includes(subscription.status) && cancelling !== current.cancel_at_period_end) {
    after(() =>
      notifyEvent(cancelling ? `🥀 Subscription cancelled, ends ${periodEnd ? day(new Date(periodEnd * 1000)) : "at period end"}` : "↩️ Cancellation undone", ids),
    );
  }
  if (next && next.plan.id !== current.scheduled_plan_id) {
    after(() => notifyEvent(`⬇️ Switches to ${next.plan.id} ${next.period} on ${day(next.at)}`, ids));
  }
}

// Right after Checkout, so the plan and its messages show without waiting for
// the webhooks.
export async function syncCheckoutSession(workspaceId: string, sessionId: string) {
  const session = await platformStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription", "invoice"] });
  if (session.client_reference_id !== workspaceId) return;
  if (!session.subscription || typeof session.subscription === "string") return;
  await syncSubscription(session.subscription);
  if (session.invoice && typeof session.invoice !== "string") await grantInvoiceCredits(session.invoice, session.subscription);
}

export function hasLiveSubscription(workspace: WorkspaceBilling) {
  const state = planState(workspace);
  return Boolean(workspace.stripe_subscription_id) && (state.kind === "active" || state.kind === "past-due");
}
