import "server-only";
import { BRAND } from "@/config/brand";
import { callProvider, ProviderError, updateSecret, type Connection } from "../store";
import { accessToken, pkce, secretFrom, type TokenResponse } from "./tokens";
import type { ProviderAdapter, RunContext } from "./types";

// Salesforce. Since Spring '26 new integrations use External Client Apps,
// which work only in the org that created them unless shipped in a managed
// package. Two ways to connect, the same code either way:
// - The customer's own app: their admin creates an External Client App with
//   our callback URL and gives us its consumer key and secret, kept encrypted
//   as a pending connection until OAuth finishes.
// - Ours: SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET (a packaged app).
// OAuth uses PKCE (mandatory for partner apps). Access tokens last as long as
// the org's session settings and don't say when they expire, so they're
// refreshed after 90 minutes or when Salesforce rejects one.

const VERSION = "v67.0";
const SCOPES = "api refresh_token";
const DEFAULT_LOGIN = "https://login.salesforce.com";
const ASSUMED_LIFETIME_S = 90 * 60;
// Values from Salesforce's standard picklists; orgs can change them.
const PRIORITIES: Record<string, string> = { low: "Low", normal: "Medium", high: "High", urgent: "High" };

// A My Domain address (https://acme.my.salesforce.com) or the default login.
// People often paste a page's address from their browser; Lightning pages
// (acme.lightning.force.com) sign in at the matching my.salesforce.com.
export function loginUrl(value: string | undefined) {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_LOGIN;
  const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  if (url.protocol !== "https:" || !/\.(salesforce|force)\.com$/.test(url.hostname)) {
    throw new Error("Use your Salesforce address, like https://yourcompany.my.salesforce.com.");
  }
  url.hostname = url.hostname.replace(/\.lightning\.force\.com$/, ".my.salesforce.com");
  return url.origin;
}

// Where to sign in: what the owner entered, else where they connected before.
function loginFor(extra: Record<string, string>, existing: Connection | null) {
  return extra.login_url ? loginUrl(extra.login_url) : String(existing?.metadata.login_url ?? DEFAULT_LOGIN);
}

// The app doing OAuth: the customer's own (from a pending or saved connection) or ours.
function appFor(existing: Connection | null) {
  if (existing?.secret.client_id && existing.secret.client_secret) {
    return { id: String(existing.secret.client_id), secret: String(existing.secret.client_secret), own: true };
  }
  return { id: process.env.SALESFORCE_CLIENT_ID ?? "", secret: process.env.SALESFORCE_CLIENT_SECRET ?? "", own: false };
}

async function tokenRequest(login: string, params: Record<string, string>) {
  return callProvider<TokenResponse & { instance_url: string; id: string }>(`${login}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

function withLifetime<T extends TokenResponse>(token: T): T {
  return { ...token, expires_in: token.expires_in ?? ASSUMED_LIFETIME_S };
}

async function salesforce<T>(connection: Connection, path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const app = appFor(connection);
  const token = await accessToken(connection, async (refreshToken) =>
    withLifetime(
      await tokenRequest(String(connection.metadata.login_url ?? DEFAULT_LOGIN), {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: app.id,
        client_secret: app.secret,
      }),
    ),
  );
  try {
    return await callProvider<T>(`${connection.metadata.instance_url}/services/data/${VERSION}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    });
  } catch (error) {
    // The session ended before we expected: refresh once and try again.
    if (error instanceof ProviderError && error.status === 401 && !retried) {
      await updateSecret(connection, { ...connection.secret, expires_at: 1 });
      return salesforce<T>(connection, path, init, true);
    }
    throw error;
  }
}

// Salesforce reports errors as a list; picklist errors mean an org changed its values.
const picklistError = (error: unknown) =>
  error instanceof ProviderError && /RESTRICTED_PICKLIST|bad value for restricted picklist/i.test(error.message);

async function create(connection: Connection, object: string, fields: Record<string, unknown>, optional: string[]) {
  try {
    return await salesforce<{ id: string }>(connection, `/sobjects/${object}`, { method: "POST", body: JSON.stringify(fields) });
  } catch (error) {
    if (!picklistError(error)) throw error;
    // Try again without the fields whose values the org may not have.
    const rest = Object.fromEntries(Object.entries(fields).filter(([key]) => !optional.includes(key)));
    return salesforce<{ id: string }>(connection, `/sobjects/${object}`, { method: "POST", body: JSON.stringify(rest) });
  }
}

async function contactId(connection: Connection, email: string) {
  const query = `SELECT Id FROM Contact WHERE Email = '${email.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' LIMIT 1`;
  const result = await salesforce<{ records: { Id: string }[] }>(connection, `/query?q=${encodeURIComponent(query)}`);
  return result.records[0]?.Id;
}

function footer(context: RunContext) {
  const lines = [
    `Opened by ${context.conversation.assistantName}, the AI assistant.`,
    context.conversation.pageUrl ? `Page: ${context.conversation.pageUrl}` : null,
    `Conversation: ${context.conversation.transcriptUrl}`,
  ];
  return `\n\n${lines.filter(Boolean).join("\n")}`;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? { FirstName: parts.slice(0, -1).join(" "), LastName: parts[parts.length - 1] } : { LastName: parts[0] };
}

export const salesforceAdapter: ProviderAdapter = {
  id: "salesforce",
  oauthConfigured: () => Boolean(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET),

  checkExtra(extra) {
    try {
      loginUrl(extra.login_url);
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  },

  prepareOwnApp(values) {
    return { login_url: loginUrl(values.login_url) };
  },

  authorizeUrl(state, redirectUri, extra, existing) {
    const login = loginFor(extra, existing);
    const url = new URL(`${login}/services/oauth2/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", appFor(existing).id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", pkce(state).challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async exchangeCode(code, redirectUri, extra, state, existing) {
    const login = loginFor(extra, existing);
    const app = appFor(existing);
    const token = withLifetime(
      await tokenRequest(login, {
        grant_type: "authorization_code",
        code,
        client_id: app.id,
        client_secret: app.secret,
        redirect_uri: redirectUri,
        code_verifier: pkce(state).verifier,
      }),
    );
    const identity = await callProvider<{ username: string; display_name?: string }>(token.id, {
      headers: { authorization: `Bearer ${token.access_token}` },
    }).catch(() => null);
    return {
      // The customer's own app credentials stay with the tokens: refreshing needs them.
      secret: { ...secretFrom(token), ...(app.own && { client_id: app.id, client_secret: app.secret }) },
      metadata: {
        account_name: new URL(token.instance_url).hostname,
        connected_as: identity?.username,
        instance_url: token.instance_url,
        login_url: login,
        own_app: app.own,
      },
    };
  },

  async run(capability, context) {
    const { connection, input, user } = context;

    if (capability === "create_ticket") {
      if (!user.email) return { error: "Ask for their email first, so support can reply." };
      const contact = await contactId(connection, user.email).catch(() => undefined);
      const created = await create(
        connection,
        "Case",
        {
          Subject: String(input.subject ?? "").slice(0, 255),
          Description: `${String(input.description ?? "")}${footer(context)}`.slice(0, 32_000),
          SuppliedName: user.name ?? undefined,
          SuppliedEmail: user.email,
          Origin: "Web",
          Priority: PRIORITIES[String(input.priority)] ?? "Medium",
          ...(contact && { ContactId: contact }),
        },
        ["Origin", "Priority"],
      );
      return { created: true, case_id: created.id, note: `The case is open. Support will reply to ${user.email}.` };
    }

    if (capability === "save_lead") {
      if (!user.email) return { error: "Ask for their email first." };
      const name = user.name ?? user.email.split("@")[0];
      try {
        const created = await create(
          connection,
          "Lead",
          {
            ...splitName(name),
            Email: user.email,
            Company: (typeof input.company === "string" && input.company.trim()) || "Not provided",
            ...(typeof input.phone === "string" && input.phone.trim() && { Phone: input.phone.trim() }),
            Description: `${String(input.notes ?? "")}${footer(context)}`.slice(0, 32_000),
            LeadSource: "Web",
          },
          ["LeadSource"],
        );
        return { saved: true, lead_id: created.id, note: "They're saved in Salesforce. The sales team will be in touch." };
      } catch (error) {
        if (error instanceof ProviderError && /DUPLICATES_DETECTED/i.test(error.message)) {
          return { saved: false, note: "They're already in Salesforce, so nothing new was added. The sales team can find them by email." };
        }
        throw error;
      }
    }

    throw new Error(`Salesforce can't ${capability}.`);
  },

  // A case from the admin who connected, to check it all works.
  async test(connection, { assistantName }) {
    const created = await create(
      connection,
      "Case",
      {
        Subject: `Test case from ${BRAND.name}`,
        Description: `${assistantName} can open cases in this Salesforce org. This one is only a test; you can close it.`,
        Origin: "Web",
      },
      ["Origin"],
    );
    return { note: "Test case created", url: `${connection.metadata.instance_url}/lightning/r/Case/${created.id}/view` };
  },

  async revoke(connection) {
    if (!connection.secret.refresh_token) return;
    await callProvider(`${connection.metadata.login_url ?? DEFAULT_LOGIN}/services/oauth2/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: String(connection.secret.refresh_token) }),
    }).catch((error) => console.error("Salesforce revoke failed", error));
  },
};
