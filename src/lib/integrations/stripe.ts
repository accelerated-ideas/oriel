import "server-only";
import Stripe from "stripe";
import { appUrl } from "@/config/brand";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { STRIPE_OPERATION_ORDER, STRIPE_OPERATIONS } from "@/lib/actions/stripe-catalog";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { accessToken, secretFrom, type TokenResponse } from "./providers/tokens";
import { callProvider, type Connection } from "./store";

// Two ways to connect a customer's Stripe account:
// - Our Stripe App ("Connect with Stripe", integrations/stripe-app): they
//   install it on Stripe's own screen, approving only the permissions in its
//   manifest. We get an access token that lasts an hour and a refresh token
//   that changes on every refresh. The app lives in our live Stripe account;
//   installs into a sandbox exchange codes with the app's managed sandbox key:
//     live     STRIPE_APP_INSTALL_URL, STRIPE_APP_SECRET_KEY (or STRIPE_SECRET_KEY)
//     sandbox  STRIPE_APP_SANDBOX_INSTALL_URL, STRIPE_APP_SANDBOX_SECRET_KEY
//   The install URLs are the OAuth links on the app's page in Stripe.
// - A restricted API key they create with exactly the permissions below.
// Either way the secret is stored encrypted as JSON, and the runtime gets a
// usable key from stripeApiKey().

export type StripeAppMode = "live" | "sandbox";

// What a restricted key needs, as Stripe's dashboard names them.
export const STRIPE_KEY_PERMISSIONS = [
  { resource: "Customers", access: "Read" },
  { resource: "Invoices", access: "Read" },
  { resource: "PaymentMethods", access: "Read" },
  { resource: "Prices", access: "Read" },
  { resource: "Products", access: "Read" },
  { resource: "Subscriptions", access: "Write" },
  { resource: "Customer portal", access: "Write" },
] as const;

const APP = {
  live: () => ({
    installUrl: process.env.STRIPE_APP_INSTALL_URL,
    secretKey: process.env.STRIPE_APP_SECRET_KEY || process.env.STRIPE_SECRET_KEY,
  }),
  sandbox: () => ({ installUrl: process.env.STRIPE_APP_SANDBOX_INSTALL_URL, secretKey: process.env.STRIPE_APP_SANDBOX_SECRET_KEY }),
};

// Stripe doesn't say how long an access token lasts; it's an hour.
const ACCESS_TOKEN_SECONDS = 60 * 60;

// The kinds of Stripe accounts customers can install the app into on this server.
export function stripeAppModes(): StripeAppMode[] {
  return (["live", "sandbox"] as const).filter((mode) => Boolean(APP[mode]().installUrl && APP[mode]().secretKey));
}

export function isStripeAppMode(value: unknown): value is StripeAppMode {
  return value === "live" || value === "sandbox";
}

export const STRIPE_CALLBACK_PATH = "/api/integrations/stripe/callback";

// The app's OAuth link, back to our callback with our signed state.
export function stripeInstallUrl(mode: StripeAppMode, state: string) {
  const url = new URL(APP[mode]().installUrl!);
  url.searchParams.set("redirect_uri", appUrl(STRIPE_CALLBACK_PATH));
  url.searchParams.set("state", state);
  return url.toString();
}

async function oauthToken(mode: StripeAppMode, params: Record<string, string>) {
  const secretKey = APP[mode]().secretKey;
  if (!secretKey) throw new Error(`Stripe (${mode}) isn't set up on this server.`);
  const token = await callProvider<TokenResponse & { stripe_user_id: string; livemode: boolean }>("https://api.stripe.com/v1/oauth/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  return { ...token, expires_in: token.expires_in ?? ACCESS_TOKEN_SECONDS };
}

// After the install: the code for tokens.
export async function installStripeApp(mode: StripeAppMode, code: string) {
  const token = await oauthToken(mode, { grant_type: "authorization_code", code });
  if (!token.access_token || !token.stripe_user_id) throw new Error("Stripe didn't return an account.");
  return {
    secret: { via: "app", mode, ...secretFrom(token) },
    accessToken: token.access_token,
    accountId: token.stripe_user_id,
    livemode: Boolean(token.livemode),
  };
}

export type StripeConnection = Connection<"stripe">;

export async function loadStripeConnection(agentId: string): Promise<StripeConnection | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("id, agent_id, organization_id, secret_encrypted, metadata, config")
    .eq("agent_id", agentId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (!data) return null;
  try {
    const raw = decryptSecret(data.secret_encrypted);
    return {
      id: data.id,
      agentId: data.agent_id,
      organizationId: data.organization_id,
      provider: "stripe",
      // Keys stored before secrets were JSON are the bare key.
      secret: raw.startsWith("{") ? JSON.parse(raw) : { via: "key", key: raw },
      metadata: data.metadata ?? {},
      config: data.config ?? {},
    };
  } catch (error) {
    // ENCRYPTION_KEY changed: treated as not connected.
    console.error("Couldn't read the Stripe connection", error);
    return null;
  }
}

// A key for the connected account: the restricted key, or a fresh access token.
export async function stripeApiKey(connection: StripeConnection) {
  if (connection.secret.via !== "app") return String(connection.secret.key);
  const mode = connection.secret.mode === "sandbox" ? "sandbox" : "live";
  return accessToken(connection, (refreshToken) => oauthToken(mode, { grant_type: "refresh_token", refresh_token: refreshToken }));
}

export async function stripeAccountName(stripe: Stripe) {
  try {
    const account = await stripe.accounts.retrieveCurrent();
    return account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? undefined;
  } catch {
    // Restricted keys often can't read the account; that's fine.
    return undefined;
  }
}

// Stores the connection and makes sure every Stripe operation exists as an action.
export async function saveStripeConnection({
  agentId,
  organizationId,
  secret,
  metadata,
}: {
  agentId: string;
  organizationId: string;
  secret: StripeConnection["secret"];
  metadata: {
    account_name?: string;
    livemode: boolean;
    key_hint?: string;
    account_id?: string;
    connected_via: "app" | "key";
    mode?: StripeAppMode;
  };
}) {
  await supabaseAdmin
    .from("integrations")
    .upsert(
      {
        agent_id: agentId,
        organization_id: organizationId,
        provider: "stripe",
        secret_encrypted: encryptSecret(JSON.stringify(secret)),
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,provider" },
    )
    .throwOnError();

  const { data: existing } = await supabaseAdmin.from("actions").select("config").eq("agent_id", agentId).eq("kind", "stripe");
  const present = new Set((existing ?? []).map((row) => (row.config as { operation?: string }).operation));
  const rows = STRIPE_OPERATION_ORDER.filter((operation) => !present.has(operation)).map((operation) => {
    const spec = STRIPE_OPERATIONS[operation];
    return {
      agent_id: agentId,
      organization_id: organizationId,
      kind: "stripe",
      name: spec.name,
      title: spec.title,
      description: spec.description,
      enabled: spec.defaultEnabled,
      requires_confirmation: spec.mutating,
      requires_identity: true,
      parameters: spec.parameters,
      config: { operation },
    };
  });
  if (rows.length > 0) await supabaseAdmin.from("actions").insert(rows).throwOnError();
}
