import "server-only";
import Stripe from "stripe";

// Our own Stripe account (STRIPE_SECRET_KEY): billing for the cloud edition,
// and the platform side of "Connect with Stripe".
let client: Stripe | null = null;

export function platformStripe() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 1, timeout: 15_000 });
  return client;
}
