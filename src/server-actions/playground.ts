"use server";
import { SignJWT } from "jose";
import { z } from "zod";
import { authorizeAgent } from "@/lib/auth/access";
import { resolveStripeCustomer, stripeClient } from "@/lib/actions/stripe";
import { loadStripeConnection, stripeApiKey } from "@/lib/integrations/stripe";
import { reportError } from "@/lib/notify";
import type { ActionResult } from "@/lib/types";

// "Test as a customer" in the Playground: the assistant treats the person in
// the Playground as someone signed in to the site. It's the same identity
// token a site's backend signs (src/lib/identity.ts), signed here with the
// assistant's identity secret, and only for members of its workspace. With
// Stripe connected, the customer is looked up there, so billing tools work
// whether or not the assistant matches customers by email.

export type TestCustomer = { id: string; email: string | null; name: string | null };

const uuid = z.string().uuid();

// Recent customers in the connected Stripe account, to pick from.
export async function actionPlaygroundCustomers(agentId: string): Promise<ActionResult<{ customers: TestCustomer[] }>> {
  const access = await authorizeAgent(uuid.parse(agentId));
  if (!access.ok) return access;
  const connection = await loadStripeConnection(agentId);
  if (!connection) return { ok: true, data: { customers: [] } };
  try {
    const stripe = stripeClient(await stripeApiKey(connection));
    const { data } = await stripe.customers.list({ limit: 8 });
    return { ok: true, data: { customers: data.map((customer) => ({ id: customer.id, email: customer.email, name: customer.name ?? null })) } };
  } catch (error) {
    await reportError("actionPlaygroundCustomers", error, { agent: agentId });
    return { ok: false, error: "Couldn't load customers from Stripe." };
  }
}

const identitySchema = z.object({
  email: z.string().trim().max(320).optional(),
  customerId: z.string().trim().max(100).optional(),
});

export type TestIdentity = z.input<typeof identitySchema>;

// A signed identity for the person to test as: their email, their Stripe
// customer ID, or both, as a site's backend would send them.
export async function actionPlaygroundIdentity(
  agentId: string,
  input: TestIdentity,
): Promise<ActionResult<{ token: string; label: string; stripe: boolean }>> {
  const access = await authorizeAgent(uuid.parse(agentId));
  if (!access.ok) return access;
  const parsed = identitySchema.safeParse(input);
  const email = parsed.success && parsed.data.email ? parsed.data.email.toLowerCase() : null;
  const customerId = parsed.success && parsed.data.customerId ? parsed.data.customerId : null;
  if (!email && !customerId) return { ok: false, error: "Enter an email, a Stripe customer ID, or both." };
  if (email && !z.string().email().safeParse(email).success) return { ok: false, error: "That email doesn't look right." };
  if (customerId && !/^cus_[A-Za-z0-9]+$/.test(customerId)) return { ok: false, error: "A Stripe customer ID starts with cus_." };

  let identity: { email: string | null; name: string | null; stripeCustomerId: string | null } = { email, name: null, stripeCustomerId: null };
  const connection = await loadStripeConnection(agentId);
  if (connection) {
    try {
      const stripe = stripeClient(await stripeApiKey(connection));
      const customer = await resolveStripeCustomer(stripe, { stripeCustomerId: customerId, email: customerId ? null : email });
      if (customer) identity = { email: email ?? customer.email ?? null, name: customer.name ?? null, stripeCustomerId: customer.id };
      else if (customerId) return { ok: false, error: "That customer isn't in the connected Stripe account." };
    } catch (error) {
      if (customerId) return { ok: false, error: "That customer isn't in the connected Stripe account." };
      await reportError("actionPlaygroundIdentity", error, { agent: agentId });
    }
  } else if (customerId) {
    return { ok: false, error: "Connect Stripe first to test as a Stripe customer." };
  }

  const token = await new SignJWT({
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.stripeCustomerId ? { stripe_customer_id: identity.stripeCustomerId } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`playground:${identity.stripeCustomerId ?? identity.email}`)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(access.agent.identity_secret));

  return {
    ok: true,
    data: { token, label: identity.name ?? identity.email ?? identity.stripeCustomerId ?? "", stripe: Boolean(identity.stripeCustomerId) },
  };
}
