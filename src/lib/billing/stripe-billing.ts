import "server-only";
import type Stripe from "stripe";
import { appUrl } from "@/config/brand";
import { IS_CLOUD } from "@/config/edition";
import { getPlan, getPlanByStripePriceId, type BillingPeriod } from "@/config/plans";
import { platformStripe } from "@/lib/stripe-platform";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { planState, type WorkspaceBilling } from "./plan-state";

// Subscriptions for the cloud edition, on our own Stripe account.
// Checkout starts a subscription; plan switches update it in place; Stripe's
// customer portal handles cards, invoices and cancelling. Every change comes
// back through syncSubscription, from the webhook or right after checkout.

export function billingConfigured() {
  return IS_CLOUD && Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePriceId(planId: string, period: BillingPeriod) {
  const plan = getPlan(planId);
  if (!plan || plan.is_free_plan) return null;
  return (period === "annual" ? plan.stripe_config.annual_price_id : plan.stripe_config.price_id) || null;
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

// Moves a current subscription to another plan or period. The difference is
// prorated onto the next invoice.
export async function switchSubscription(workspace: WorkspaceBilling, priceId: string) {
  const stripe = platformStripe();
  const subscription = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id!);
  const item = subscription.items.data[0];
  if (!item) throw new Error("Subscription has no items");
  const updated = await stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: priceId, quantity: 1 }],
    proration_behavior: "create_prorations",
    // Switching plans also undoes a pending cancellation.
    cancel_at_period_end: false,
  });
  await syncSubscription(updated);
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

// Copies a subscription onto its workspace.
export async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let organizationId = subscription.metadata?.organization_id ?? null;
  if (!organizationId) {
    const { data } = await supabaseAdmin.from("organizations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    organizationId = data?.id ?? null;
  }
  if (!organizationId) {
    console.error("Stripe subscription without a workspace", subscription.id);
    return;
  }

  const { data: current } = await supabaseAdmin
    .from("organizations")
    .select("stripe_subscription_id, subscription_status")
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
  const plan = item ? getPlanByStripePriceId(item.price.id) : null;
  if (!plan) console.error("Stripe price isn't in subscription-plans.ts", item?.price.id);
  const periodEnd = subscription.cancel_at ?? item?.current_period_end ?? null;

  await supabaseAdmin
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      ...(plan ? { plan_id: plan.id } : {}),
      billing_period: item?.price.recurring?.interval === "year" ? "annual" : "monthly",
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
    })
    .eq("id", organizationId);
}

// Right after Checkout, so the plan shows without waiting for the webhook.
export async function syncCheckoutSession(workspaceId: string, sessionId: string) {
  const session = await platformStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.client_reference_id !== workspaceId) return;
  if (session.subscription && typeof session.subscription !== "string") await syncSubscription(session.subscription);
}

export function hasLiveSubscription(workspace: WorkspaceBilling) {
  const state = planState(workspace);
  return Boolean(workspace.stripe_subscription_id) && (state.kind === "active" || state.kind === "past-due");
}
