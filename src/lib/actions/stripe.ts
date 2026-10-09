import "server-only";
import Stripe from "stripe";
import type { StripeActionConfig, StripeOperation } from "@/lib/types";

export function stripeClient(secretKey: string) {
  return new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 15_000 });
}

function money(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency ?? "usd").toUpperCase() }).format(
      amount / 100,
    );
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function date(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null;
}

export async function resolveStripeCustomer(
  stripe: Stripe,
  identity: { stripeCustomerId: string | null; email: string | null },
) {
  if (identity.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(identity.stripeCustomerId);
    if (!customer.deleted) return customer;
  }
  if (identity.email) {
    const { data } = await stripe.customers.list({ email: identity.email, limit: 1 });
    if (data[0]) return data[0];
  }
  return null;
}

function describeSubscription(subscription: Stripe.Subscription, productNames: Map<string, string>) {
  const item = subscription.items.data[0];
  const price = item?.price;
  const product = typeof price?.product === "string" ? price.product : price?.product?.id;
  return {
    id: subscription.id,
    status: subscription.status,
    plan: (product && productNames.get(product)) ?? price?.nickname ?? price?.id,
    price: money(price?.unit_amount, price?.currency),
    interval: price?.recurring?.interval ?? null,
    renews_on: subscription.cancel_at_period_end ? null : date(item?.current_period_end),
    cancels_on: subscription.cancel_at_period_end ? date(item?.current_period_end ?? subscription.cancel_at) : null,
    trial_ends_on: date(subscription.trial_end),
  };
}

// Subscriptions with their plan names. Stripe expands at most four levels deep,
// which stops short of a subscription's products, so those are fetched apart.
async function describeSubscriptions(stripe: Stripe, subscriptions: Stripe.Subscription[]) {
  const ids = [
    ...new Set(subscriptions.flatMap((subscription) => subscription.items.data.map((item) => item.price.product))),
  ].filter((product): product is string => typeof product === "string");
  const products = ids.length > 0 ? await stripe.products.list({ ids, limit: 100 }).catch(() => null) : null;
  const names = new Map((products?.data ?? []).map((product) => [product.id, product.name]));
  return subscriptions.map((subscription) => describeSubscription(subscription, names));
}

async function pickSubscription(stripe: Stripe, customerId: string, subscriptionId?: string) {
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.customer !== customerId) throw new Error("That subscription doesn't belong to this user.");
    return subscription;
  }
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const live = data.filter((sub) => ["active", "trialing", "past_due", "unpaid"].includes(sub.status));
  if (live.length === 0) throw new Error("The user has no active subscription.");
  if (live.length > 1) {
    throw new Error(
      `The user has ${live.length} active subscriptions (${live.map((sub) => sub.id).join(", ")}). Ask which one and pass subscription_id.`,
    );
  }
  return live[0];
}

export async function runStripeOperation({
  secretKey,
  operation,
  config,
  input,
  identity,
  returnUrl,
}: {
  secretKey: string;
  operation: StripeOperation;
  config: StripeActionConfig;
  input: Record<string, unknown>;
  identity: { stripeCustomerId: string | null; email: string | null };
  returnUrl: string | null;
}) {
  const stripe = stripeClient(secretKey);
  if (!identity.stripeCustomerId && !identity.email) {
    return {
      error:
        "Their account isn't linked to Stripe here, so you can't see their billing. Tell them where to manage billing in the product, or offer to pass it to the team.",
    };
  }
  const customer = await resolveStripeCustomer(stripe, identity);
  if (!customer) {
    return { error: "No Stripe customer was found for this user. They may be on a free plan or using a different email." };
  }

  switch (operation) {
    case "billing_overview": {
      const [subscriptions, invoices] = await Promise.all([
        stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 5 }),
        stripe.invoices.list({ customer: customer.id, limit: 3 }),
      ]);
      let paymentMethod: string | null = null;
      const defaultPm = customer.invoice_settings?.default_payment_method;
      if (defaultPm) {
        // Older restricted keys may lack PaymentMethods access; the rest still helps.
        const pm = typeof defaultPm === "string" ? await stripe.paymentMethods.retrieve(defaultPm).catch(() => null) : defaultPm;
        if (pm?.card) paymentMethod = `${pm.card.brand} ending ${pm.card.last4}, expires ${pm.card.exp_month}/${pm.card.exp_year}`;
      }
      return {
        customer: { email: customer.email, name: customer.name, balance: money(customer.balance, customer.currency) },
        subscriptions: await describeSubscriptions(stripe, subscriptions.data),
        payment_method: paymentMethod,
        recent_invoices: invoices.data.map((invoice) => ({
          number: invoice.number,
          status: invoice.status,
          amount: money(invoice.amount_due, invoice.currency),
          date: date(invoice.created),
        })),
      };
    }

    case "list_invoices": {
      const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 12);
      const invoices = await stripe.invoices.list({ customer: customer.id, limit });
      return {
        invoices: invoices.data.map((invoice) => ({
          number: invoice.number,
          status: invoice.status,
          amount_due: money(invoice.amount_due, invoice.currency),
          amount_paid: money(invoice.amount_paid, invoice.currency),
          date: date(invoice.created),
          url: invoice.hosted_invoice_url,
        })),
      };
    }

    case "billing_portal_link": {
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: customer.id,
          ...(returnUrl ? { return_url: returnUrl } : {}),
        });
        return { url: session.url, note: "Open this URL for the user with the navigate tool. Don't read it aloud." };
      } catch (error) {
        // Stripe needs the portal's settings saved once before it can make links.
        if (/configuration/i.test((error as Error).message)) {
          return {
            error: "The billing portal isn't set up in this Stripe account yet. Help them another way, or offer to pass it to the team.",
          };
        }
        throw error;
      }
    }

    case "cancel_subscription": {
      const subscription = await pickSubscription(stripe, customer.id, input.subscription_id as string | undefined);
      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        ...(input.reason ? { cancellation_details: { comment: String(input.reason).slice(0, 500) } } : {}),
      });
      return { cancelled: true, ...(await describeSubscriptions(stripe, [updated]))[0] };
    }

    case "resume_subscription": {
      const subscription = await pickSubscription(stripe, customer.id, input.subscription_id as string | undefined);
      const updated = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false });
      return { resumed: true, ...(await describeSubscriptions(stripe, [updated]))[0] };
    }

    case "change_plan": {
      const allowed = config.allowed_prices ?? [];
      const target = allowed.find((price) => price.price_id === input.price_id);
      if (!target) return { error: "That plan isn't available. Offer one of the listed plans." };
      const subscription = await pickSubscription(stripe, customer.id, input.subscription_id as string | undefined);
      // With several items (a plan plus add-ons), swapping one could change the wrong thing.
      if (subscription.items.data.length !== 1) {
        return { error: "This subscription has more than one item, so it can't be switched here. Offer the billing portal instead." };
      }
      const item = subscription.items.data[0];
      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: target.price_id }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
      });
      return { changed_to: target.label, ...(await describeSubscriptions(stripe, [updated]))[0] };
    }
  }
}
