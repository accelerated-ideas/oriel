import "server-only";
import { jwtVerify } from "jose";

export type VerifiedIdentity = {
  externalId: string | null;
  email: string | null;
  name: string | null;
  stripeCustomerId: string | null;
  attributes: Record<string, unknown>;
};

const REGISTERED_CLAIMS = new Set(["iss", "sub", "aud", "exp", "nbf", "iat", "jti", "user_id", "email", "name", "stripe_customer_id"]);

// The customer's backend signs a JWT (HS256) with the assistant's identity secret.
// Only verified identities unlock account-specific actions such as Stripe.
export async function verifyIdentityToken(token: string, secret: string): Promise<VerifiedIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!REGISTERED_CLAIMS.has(key)) attributes[key] = value;
    }
    const externalId = (payload.user_id ?? payload.sub) as string | undefined;
    return {
      externalId: externalId ? String(externalId) : null,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      stripeCustomerId: typeof payload.stripe_customer_id === "string" ? payload.stripe_customer_id : null,
      attributes,
    };
  } catch {
    return null;
  }
}
