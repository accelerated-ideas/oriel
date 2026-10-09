import "server-only";
import { BRAND } from "@/config/brand";
import { callProvider, type Connection } from "../store";
import { accessToken, pkce, secretFrom, type TokenResponse } from "./tokens";
import type { ProviderAdapter } from "./types";

// Zendesk: the customer creates an OAuth client in their own Zendesk (Admin
// Center > Apps and integrations > APIs > OAuth clients) and gives us its
// identifier and secret, kept encrypted as a pending connection until they
// approve access, then with the tokens (refreshing needs them). Nothing to set
// up on this server.
//
// Tickets are created with the Tickets API (the visitor as requester; Zendesk
// creates the user if the email is new). The visitor's description is the
// public comment; where it came from goes in a private note for agents.

const SCOPES = "tickets:read tickets:write users:read users:write";
// Longest-lived tokens Zendesk allows: 2 days, refresh tokens 90 days.
const TOKEN_LIFETIME = { expires_in: 172_800, refresh_token_expires_in: 7_776_000 };

export function normalizeSubdomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.zendesk\.com.*$/, "")
    .replace(/\/.*$/, "");
}

const validSubdomain = (value: string) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(value);
const base = (connection: Connection | string) =>
  `https://${typeof connection === "string" ? connection : String(connection.metadata.subdomain)}.zendesk.com`;

// The pending connection holding the customer's OAuth client.
function ownClient(existing: Connection | null) {
  if (!existing?.secret.client_id || !existing.secret.client_secret || !existing.metadata.subdomain) {
    throw new Error("Add your Zendesk OAuth client on the Integrations page first.");
  }
  return existing;
}

async function tokens(connection: Connection, body: Record<string, unknown>) {
  return callProvider<TokenResponse>(`${base(connection)}/oauth/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: connection.secret.client_id, client_secret: connection.secret.client_secret, ...body }),
  });
}

async function zendesk<T>(connection: Connection, path: string, init: RequestInit = {}) {
  const token = await accessToken(connection, (refreshToken) =>
    tokens(connection, { grant_type: "refresh_token", refresh_token: refreshToken, ...TOKEN_LIFETIME }),
  );
  return callProvider<T>(`${base(connection)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
}

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

export const zendeskAdapter: ProviderAdapter = {
  id: "zendesk",

  prepareOwnApp(values) {
    const subdomain = normalizeSubdomain(values.subdomain ?? "");
    if (!validSubdomain(subdomain)) throw new Error("Enter your Zendesk subdomain, like yourcompany from yourcompany.zendesk.com.");
    return { subdomain };
  },

  authorizeUrl(state, redirectUri, _extra, existing) {
    const client = ownClient(existing);
    const url = new URL(`${base(client)}/oauth/authorizations/new`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", String(client.secret.client_id));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    // Optional for confidential clients, but Zendesk checks it when it's sent.
    url.searchParams.set("code_challenge", pkce(state).challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async exchangeCode(code, redirectUri, _extra, state, existing) {
    const client = ownClient(existing);
    const subdomain = String(client.metadata.subdomain);
    const token = await tokens(client, {
      grant_type: "authorization_code",
      code,
      code_verifier: pkce(state).verifier,
      redirect_uri: redirectUri,
      scope: SCOPES,
      ...TOKEN_LIFETIME,
    });
    const me = await callProvider<{ user: { id: number | null; name: string; email: string; role: string } }>(
      `${base(subdomain)}/api/v2/users/me`,
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    if (!me.user.id || !["agent", "admin"].includes(me.user.role)) {
      throw new Error("Connect with a Zendesk agent or admin account.");
    }
    return {
      secret: { ...secretFrom(token), client_id: client.secret.client_id, client_secret: client.secret.client_secret },
      metadata: { subdomain, account_name: `${subdomain}.zendesk.com`, connected_as: me.user.email },
    };
  },

  async run(capability, context) {
    if (capability !== "create_ticket") throw new Error(`Zendesk can't ${capability}.`);
    const { input, user, conversation } = context;
    if (!user.email) return { error: "Ask for their email first, so support can reply." };
    const priority = PRIORITIES.has(String(input.priority)) ? String(input.priority) : "normal";
    const created = await zendesk<{ ticket: { id: number } }>(context.connection, "/api/v2/tickets", {
      method: "POST",
      body: JSON.stringify({
        ticket: {
          subject: String(input.subject ?? "").slice(0, 250),
          comment: { body: String(input.description ?? ""), public: true },
          priority,
          requester: { name: user.name || user.email, email: user.email },
          tags: ["ai_assistant"],
          external_id: conversation.id,
        },
      }),
    });
    const id = created.ticket.id;
    // Context for agents only.
    await zendesk(context.connection, `/api/v2/tickets/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        ticket: {
          comment: {
            public: false,
            body: [
              `Opened by ${conversation.assistantName}, the AI assistant, during a conversation with this person.`,
              conversation.pageUrl ? `Page: ${conversation.pageUrl}` : null,
              `Conversation: ${conversation.transcriptUrl}`,
              user.verified ? "Their email was verified by the site." : "Their email wasn't verified.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      }),
    }).catch((error) => console.error("Zendesk note failed", error));
    return { created: true, ticket_id: id, note: `Ticket #${id} is open. Support will reply to ${user.email}.` };
  },

  // A ticket from the admin who connected, with an internal first comment so
  // nobody gets an email about it.
  async test(connection, { assistantName }) {
    const email = connection.metadata.connected_as as string | undefined;
    const created = await zendesk<{ ticket: { id: number } }>(connection, "/api/v2/tickets", {
      method: "POST",
      body: JSON.stringify({
        ticket: {
          subject: `Test ticket from ${BRAND.name}`,
          comment: { body: `${assistantName} can open tickets in this Zendesk. This one is only a test; you can close it.`, public: false },
          ...(email && { requester: { email, name: email } }),
          tags: ["ai_assistant"],
        },
      }),
    });
    return { note: `Test ticket #${created.ticket.id} created`, url: `${base(connection)}/agent/tickets/${created.ticket.id}` };
  },

  // A cheap call that refreshes the tokens first (the 90-day refresh token
  // only lasts while it's used).
  async keepAlive(connection) {
    connection.secret = { ...connection.secret, expires_at: 1 };
    await zendesk(connection, "/api/v2/users/me");
  },

  async revoke(connection) {
    try {
      const current = await zendesk<{ token: { id: number } }>(connection, "/api/v2/oauth/tokens/current");
      await zendesk(connection, `/api/v2/oauth/tokens/${current.token.id}`, { method: "DELETE" });
    } catch (error) {
      console.error("Zendesk revoke failed", error);
    }
  },
};
