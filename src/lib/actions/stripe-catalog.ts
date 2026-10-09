import type { ActionParameter, StripeOperation } from "@/lib/types";

// Stripe operations the assistant can run for the signed-in end user.
// Every operation is scoped to that user's own Stripe customer.
export const STRIPE_OPERATIONS: Record<
  StripeOperation,
  {
    name: string;
    title: string;
    // One line for owners on the Integrations page; the model gets `description`.
    summary: string;
    description: string;
    mutating: boolean;
    defaultEnabled: boolean;
    parameters: ActionParameter[];
  }
> = {
  billing_overview: {
    name: "get_billing_overview",
    title: "Look up billing",
    summary: "Their plan, renewal date, card and recent invoices.",
    description:
      "Look up the signed-in user's subscriptions, plan, renewal date, payment method and last few invoices in Stripe. Use it before answering any question about their billing.",
    mutating: false,
    defaultEnabled: true,
    parameters: [],
  },
  list_invoices: {
    name: "list_invoices",
    title: "List invoices",
    summary: "Recent invoices, with a link to each.",
    description: "List the signed-in user's recent invoices with amount, status, date and a link to each one.",
    mutating: false,
    defaultEnabled: true,
    parameters: [
      { name: "limit", type: "number", description: "How many invoices to return (1-12). Defaults to 5.", required: false },
    ],
  },
  billing_portal_link: {
    name: "open_billing_portal",
    title: "Open billing portal",
    summary: "A link to update their card or download invoices. Needs the customer portal set up in Stripe.",
    description:
      "Create a secure Stripe billing portal link where the user can update their card, download invoices or manage their plan. The result includes a URL you can open for them with the navigate tool.",
    mutating: false,
    defaultEnabled: true,
    parameters: [],
  },
  cancel_subscription: {
    name: "cancel_subscription",
    title: "Cancel subscription",
    summary: "At the end of the billing period.",
    description:
      "Cancel the user's subscription at the end of the current billing period. Before cancelling, ask why they want to leave and whether something could be fixed.",
    mutating: true,
    defaultEnabled: false,
    parameters: [
      {
        name: "subscription_id",
        type: "string",
        description: "Only needed when the user has more than one active subscription.",
        required: false,
      },
      { name: "reason", type: "string", description: "Why the user is cancelling, in their words.", required: false },
    ],
  },
  resume_subscription: {
    name: "resume_subscription",
    title: "Undo a cancellation",
    summary: "Keeps the plan renewing.",
    description: "Undo a scheduled cancellation so the subscription keeps renewing.",
    mutating: true,
    defaultEnabled: false,
    parameters: [
      {
        name: "subscription_id",
        type: "string",
        description: "Only needed when the user has more than one subscription.",
        required: false,
      },
    ],
  },
  change_plan: {
    name: "change_plan",
    title: "Change plan",
    summary: "Switches to one of the plans you allow.",
    description:
      "Switch the user's subscription to a different plan. Prorations apply automatically. Only use the plans listed in the price_id options.",
    mutating: true,
    defaultEnabled: false,
    parameters: [
      { name: "price_id", type: "string", description: "The plan to switch to.", required: true },
      {
        name: "subscription_id",
        type: "string",
        description: "Only needed when the user has more than one subscription.",
        required: false,
      },
    ],
  },
};

export const STRIPE_OPERATION_ORDER: StripeOperation[] = [
  "billing_overview",
  "list_invoices",
  "billing_portal_link",
  "cancel_subscription",
  "resume_subscription",
  "change_plan",
];
