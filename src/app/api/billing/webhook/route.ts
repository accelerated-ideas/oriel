import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { grantInvoiceCredits } from "@/lib/billing/credits";
import { billingConfigured, syncSubscription } from "@/lib/billing/stripe-billing";
import { reportError } from "@/lib/notify";
import { platformStripe } from "@/lib/stripe-platform";

export const dynamic = "force-dynamic";

// Stripe events for workspace subscriptions (cloud edition). Register
// <NEXT_PUBLIC_APP_URL>/api/billing/webhook in Stripe with the events below.
// Paid invoices grant messages (src/lib/billing/credits.ts); subscription
// events copy the plan and status.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!billingConfigured() || !secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = platformStripe().webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handle(event);
  } catch (error) {
    // Stripe retries a failed delivery, so the webhook tries again later.
    await reportError(`Stripe webhook ${event.type}`, error, { event: event.id });
    return NextResponse.json({ error: "Couldn't handle the event" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        await syncSubscription(await platformStripe().subscriptions.retrieve(session.subscription));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Read fresh: Stripe doesn't promise events arrive in order.
      await syncSubscription(await platformStripe().subscriptions.retrieve(event.data.object.id));
      break;
    case "invoice.paid":
      await grantInvoiceCredits(event.data.object);
      break;
  }
}
