import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { billingConfigured, syncSubscription } from "@/lib/billing/stripe-billing";
import { platformStripe } from "@/lib/stripe-platform";

export const dynamic = "force-dynamic";

// Stripe events for workspace subscriptions (cloud edition). Register
// <NEXT_PUBLIC_APP_URL>/api/billing/webhook in Stripe with the events below.
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
      await syncSubscription(event.data.object);
      break;
  }
  return NextResponse.json({ received: true });
}
