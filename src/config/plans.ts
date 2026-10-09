// Plans for the hosted (cloud) edition: their shape, and helpers to look them
// up. Import plans from here wherever they matter (pricing, checkout, limits).
// Self-hosted installs have no plans, limits or billing (see src/config/edition.ts).
//
// The plans themselves (prices, limits, Stripe IDs) are in
// src/config/subscription-plans.ts, which isn't in the public repository.
// `npm install` creates it from subscription-plans.example.ts when it's
// missing (scripts/setup-plans.mjs).
//
// Messages are what visitors send, by voice or text; replies don't count, and
// neither does a goodbye the assistant answers by closing the conversation
// (end_call / end_chat, see run-turn.ts).

import { subscriptionPlans } from "./subscription-plans";

export { subscriptionPlans };

export type BillingPeriod = "monthly" | "annual";

export const TRIAL_PLAN_ID = "trial";
export const STARTER_PLAN_ID = "starter";
export const PRO_PLAN_ID = "pro";
export const PREMIUM_PLAN_ID = "premium";

export type PlanId = typeof TRIAL_PLAN_ID | typeof STARTER_PLAN_ID | typeof PRO_PLAN_ID | typeof PREMIUM_PLAN_ID;

export type SubscriptionPlan = {
  id: PlanId;
  name: string;
  description: string;
  is_free_plan: boolean;
  price_config: {
    /** Per month, billed monthly (USD) */
    price: number;
    /** Per month when billed annually (two months free) */
    annual_price: number;
    /** Billed once a year */
    annual_total: number;
  };
  stripe_config: {
    product_id: string;
    /** Monthly Stripe price */
    price_id: string;
    /** Annual Stripe price */
    annual_price_id: string;
  };
  includes: {
    messages_per_month: number;
    assistants: number;
    /** People in the workspace, counting pending invitations */
    seats: number;
    /** Total knowledge across all sources, in characters (~2,500 per page) */
    knowledge_characters: number;
    /** Pages in each assistant's site map (places in the product it can take people to) */
    site_map_pages: number;
    /** A website page can be re-read at most this often when the owner refreshes it */
    refresh_every_hours: number;
    /** Website pages are re-read automatically this often, or never (null) */
    auto_refresh_days: number | null;
    voice_calls: boolean;
    /** Your API endpoints and functions registered in your app */
    custom_actions: boolean;
    stripe_integration: boolean;
    /** Signed-in users verified by your server */
    identity_verification: boolean;
    priority_support: boolean;
    /** Hide "Powered by Oriel" in the widget */
    remove_branding: boolean;
    /** Free plans only */
    trial_days: number | null;
  };
  style: {
    is_recommended: boolean;
    is_publicly_visible: boolean;
    feature_list: { label: string; tooltip: string | null }[];
  };
};

export const publicPlans = subscriptionPlans.filter((plan) => plan.style.is_publicly_visible);
export const freePlanIds = subscriptionPlans.filter((plan) => plan.is_free_plan).map((plan) => plan.id);

export const paidPlans = subscriptionPlans.filter((plan) => !plan.is_free_plan);

export function getPlan(id: string | null | undefined) {
  return subscriptionPlans.find((plan) => plan.id === id) ?? null;
}

// The plan a Stripe price belongs to (monthly or annual), e.g. from a webhook.
export function getPlanByStripePriceId(priceId: string) {
  if (!priceId) return null;
  return (
    subscriptionPlans.find(
      (plan) => plan.stripe_config.price_id === priceId || plan.stripe_config.annual_price_id === priceId,
    ) ?? null
  );
}
