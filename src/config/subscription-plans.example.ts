// Example plans for the hosted (cloud) edition. `npm install` copies this to
// src/config/subscription-plans.ts when that file is missing; edit the copy to
// set your own prices, limits and Stripe IDs. The numbers here are only
// illustrations. Self-hosted installs don't use plans at all.

import { BRAND } from "./brand";
import type { SubscriptionPlan } from "./plans";

function getEnvStripeId({ dev, prod }: { dev: string; prod: string }) {
  return process.env.NODE_ENV === "production" ? prod : dev;
}

const MESSAGES_TOOLTIP = "Messages visitors send, by voice or text. Replies, and the goodbye that ends a conversation, don't count.";

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "trial",
    name: "Trial",
    description: "Everything, for 14 days.",
    is_free_plan: true,
    price_config: { price: 0, annual_price: 0, annual_total: 0 },
    stripe_config: {
      product_id: getEnvStripeId({ dev: "", prod: "" }),
      price_id: getEnvStripeId({ dev: "", prod: "" }),
      annual_price_id: getEnvStripeId({ dev: "", prod: "" }),
    },
    includes: {
      messages_per_month: 100,
      assistants: 1,
      seats: 2,
      knowledge_characters: 500_000,
      site_map_pages: 100,
      refresh_every_hours: 24 * 7,
      auto_refresh_days: null,
      voice_calls: true,
      custom_actions: true,
      stripe_integration: true,
      identity_verification: true,
      priority_support: false,
      remove_branding: false,
      trial_days: 14,
    },
    style: {
      is_recommended: false,
      is_publicly_visible: false,
      feature_list: [{ label: "100 messages over 14 days", tooltip: null }],
    },
  },
  {
    id: "starter",
    name: "Starter",
    description: "For one product getting started.",
    is_free_plan: false,
    price_config: { price: 29, annual_price: 24, annual_total: 288 },
    stripe_config: {
      product_id: getEnvStripeId({ dev: "", prod: "" }),
      price_id: getEnvStripeId({ dev: "", prod: "" }),
      annual_price_id: getEnvStripeId({ dev: "", prod: "" }),
    },
    includes: {
      messages_per_month: 500,
      assistants: 1,
      seats: 2,
      knowledge_characters: 500_000,
      site_map_pages: 100,
      refresh_every_hours: 24 * 7,
      auto_refresh_days: null,
      voice_calls: true,
      custom_actions: false,
      stripe_integration: false,
      identity_verification: false,
      priority_support: false,
      remove_branding: false,
      trial_days: null,
    },
    style: {
      is_recommended: false,
      is_publicly_visible: true,
      feature_list: [
        { label: "500 messages a month", tooltip: MESSAGES_TOOLTIP },
        { label: "1 assistant", tooltip: null },
        { label: "2 team members", tooltip: null },
        { label: "Voice calls and text chat", tooltip: null },
        { label: "Knowledge from your site, docs and files", tooltip: "Up to about 200 pages." },
        { label: "Refresh pages weekly", tooltip: "Re-read any page from your site once a week." },
      ],
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "For products that want it to take action.",
    is_free_plan: false,
    price_config: { price: 79, annual_price: 66, annual_total: 792 },
    stripe_config: {
      product_id: getEnvStripeId({ dev: "", prod: "" }),
      price_id: getEnvStripeId({ dev: "", prod: "" }),
      annual_price_id: getEnvStripeId({ dev: "", prod: "" }),
    },
    includes: {
      messages_per_month: 2_000,
      assistants: 3,
      seats: 5,
      knowledge_characters: 2_500_000,
      site_map_pages: 500,
      refresh_every_hours: 24,
      auto_refresh_days: 7,
      voice_calls: true,
      custom_actions: true,
      stripe_integration: true,
      identity_verification: true,
      priority_support: false,
      remove_branding: false,
      trial_days: null,
    },
    style: {
      is_recommended: true,
      is_publicly_visible: true,
      feature_list: [
        { label: "2,000 messages a month", tooltip: MESSAGES_TOOLTIP },
        { label: "3 assistants", tooltip: null },
        { label: "5 team members", tooltip: null },
        { label: "Everything in Starter", tooltip: null },
        { label: "Actions with your API and in your app", tooltip: null },
        { label: "Verified signed-in users", tooltip: null },
      ],
    },
  },
  {
    id: "premium",
    name: "Premium",
    description: "For high-traffic products.",
    is_free_plan: false,
    price_config: { price: 199, annual_price: 166, annual_total: 1_992 },
    stripe_config: {
      product_id: getEnvStripeId({ dev: "", prod: "" }),
      price_id: getEnvStripeId({ dev: "", prod: "" }),
      annual_price_id: getEnvStripeId({ dev: "", prod: "" }),
    },
    includes: {
      messages_per_month: 5_000,
      assistants: 10,
      seats: 10,
      knowledge_characters: 10_000_000,
      site_map_pages: 2_000,
      refresh_every_hours: 1,
      auto_refresh_days: 1,
      voice_calls: true,
      custom_actions: true,
      stripe_integration: true,
      identity_verification: true,
      priority_support: true,
      remove_branding: true,
      trial_days: null,
    },
    style: {
      is_recommended: false,
      is_publicly_visible: true,
      feature_list: [
        { label: "5,000 messages a month", tooltip: MESSAGES_TOOLTIP },
        { label: "10 assistants", tooltip: null },
        { label: "10 team members", tooltip: null },
        { label: "Everything in Pro", tooltip: null },
        { label: `Remove "Powered by ${BRAND.name}"`, tooltip: "From the assistant on your site." },
        { label: "Priority support", tooltip: null },
      ],
    },
  },
];
