import "server-only";
import { BRAND } from "@/config/brand";
import { callProvider, ProviderError, type Connection } from "../store";
import { accessToken, secretFrom, type TokenResponse } from "./tokens";
import type { Connected, ProviderAdapter, RunContext } from "./types";

// HubSpot. A customer gives us a service key (Settings > Integrations > Service
// Keys; legacy private app tokens work too), or, with HUBSPOT_CLIENT_ID and
// HUBSPOT_CLIENT_SECRET, connects with OAuth (an app is limited to 25 accounts
// until it's listed on HubSpot's marketplace). APIs are date-versioned: 2026-09.
//
// Tickets go to the pipeline and stage the owner picks, linked to the
// visitor's contact (created or updated by email). Leads become contacts,
// with what they're interested in as a note.

const API = "https://api.hubapi.com";
const VERSION = "2026-09";
const SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.tickets.read",
  "crm.objects.tickets.write",
  "crm.schemas.tickets.read",
];
// HubSpot-defined association types.
const TICKET_TO_CONTACT = 16;
const NOTE_TO_CONTACT = 202;
const PRIORITIES: Record<string, string> = { low: "LOW", normal: "MEDIUM", high: "HIGH", urgent: "HIGH" };

async function tokenRequest(params: Record<string, string>) {
  // The OAuth endpoints are documented on api.hubspot.com.
  return callProvider<TokenResponse & { hub_id?: number }>(`https://api.hubspot.com/oauth/${VERSION}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.HUBSPOT_CLIENT_ID ?? "",
      client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
}

async function hubspot<T>(connection: Connection | string, path: string, init: RequestInit = {}) {
  const bearer =
    typeof connection === "string"
      ? connection
      : connection.secret.via === "oauth"
        ? await accessToken(connection, (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }))
        : String(connection.secret.access_token);
  return callProvider<T>(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", ...init.headers },
  });
}

type Pipeline = { id: string; label: string; displayOrder: number; stages: { id: string; label: string; displayOrder: number }[] };

async function pipelines(connection: Connection | string) {
  const result = await hubspot<{ results: Pipeline[] }>(connection, `/crm/pipelines/${VERSION}/tickets`);
  return result.results.sort((a, b) => a.displayOrder - b.displayOrder);
}

// "pipeline:stage" for the first stage of the first pipeline, as a default.
function defaultDestination(list: Pipeline[]) {
  const pipeline = list[0];
  const stage = pipeline?.stages.sort((a, b) => a.displayOrder - b.displayOrder)[0];
  return pipeline && stage ? { value: `${pipeline.id}:${stage.id}`, label: `${pipeline.label} › ${stage.label}` } : undefined;
}

async function connected(bearer: string, secret: Connection["secret"], hubId?: number): Promise<Connected> {
  const list = await pipelines(bearer).catch((error) => {
    if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
      throw new Error("HubSpot didn't accept that key, or it's missing the CRM ticket and contact scopes.");
    }
    throw error;
  });
  const destination = defaultDestination(list);
  // Which account, and where its app lives (app.hubspot.com, app-eu1.hubspot.com…), for links.
  const account = await hubspot<{ portalId: number; uiDomain?: string }>(bearer, "/account-info/v3/details").catch(() => null);
  const id = account?.portalId ?? hubId;
  return {
    secret,
    metadata: { account_name: id ? `HubSpot account ${id}` : "HubSpot", hub_id: id ? String(id) : undefined, ui_domain: account?.uiDomain ?? "app.hubspot.com" },
    config: destination ? { ticket_destination: destination.value, ticket_destination_label: destination.label } : {},
  };
}

function splitName(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  return { firstname: parts.slice(0, -1).join(" ") || parts[0], ...(parts.length > 1 && { lastname: parts[parts.length - 1] }) };
}

// The visitor's contact, created or updated by email.
async function upsertContact(connection: Connection, context: RunContext, extra: Record<string, string> = {}) {
  const email = context.user.email!;
  const result = await hubspot<{ results: { id: string }[] }>(connection, `/crm/objects/${VERSION}/contacts/batch/upsert`, {
    method: "POST",
    body: JSON.stringify({
      inputs: [{ id: email, idProperty: "email", properties: { email, ...splitName(context.user.name), ...extra } }],
    }),
  });
  return result.results[0]?.id;
}

function footer(context: RunContext) {
  const lines = [
    `Opened by ${context.conversation.assistantName}, the AI assistant.`,
    context.conversation.pageUrl ? `Page: ${context.conversation.pageUrl}` : null,
    `Conversation: ${context.conversation.transcriptUrl}`,
  ];
  return `\n\n${lines.filter(Boolean).join("\n")}`;
}

export const hubspotAdapter: ProviderAdapter = {
  id: "hubspot",
  oauthConfigured: () => Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const url = new URL("https://app.hubspot.com/oauth/authorize");
    url.searchParams.set("client_id", process.env.HUBSPOT_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    return connected(token.access_token, { ...secretFrom(token), via: "oauth" }, token.hub_id);
  },

  async connectWithToken(values) {
    const key = (values.access_token ?? "").trim();
    if (!key) throw new Error("Paste a HubSpot service key.");
    return connected(key, { access_token: key, via: "token", key_hint: key.slice(-4) });
  },

  async settings(connection) {
    const list = await pipelines(connection);
    return [
      {
        key: "ticket_destination",
        label: "New tickets go to",
        capability: "create_ticket",
        options: list.flatMap((pipeline) =>
          pipeline.stages
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((stage) => ({ value: `${pipeline.id}:${stage.id}`, label: `${pipeline.label} › ${stage.label}` })),
        ),
      },
    ];
  },

  async run(capability, context) {
    const { connection, input, user } = context;
    if (!user.email) return { error: "Ask for their email first." };

    if (capability === "create_ticket") {
      const [pipeline, stage] = String(connection.config.ticket_destination ?? "").split(":");
      const contactId = await upsertContact(connection, context);
      const ticket = await hubspot<{ id: string }>(connection, `/crm/objects/${VERSION}/tickets`, {
        method: "POST",
        body: JSON.stringify({
          properties: {
            subject: String(input.subject ?? "").slice(0, 250),
            content: `${String(input.description ?? "")}${footer(context)}`,
            hs_ticket_priority: PRIORITIES[String(input.priority)] ?? "MEDIUM",
            ...(pipeline && stage && { hs_pipeline: pipeline, hs_pipeline_stage: stage }),
          },
          associations: contactId
            ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: TICKET_TO_CONTACT }] }]
            : [],
        }),
      });
      return { created: true, ticket_id: ticket.id, note: `The ticket is open. The team will reply to ${user.email}.` };
    }

    if (capability === "save_lead") {
      const contactId = await upsertContact(connection, context, {
        ...(typeof input.company === "string" && input.company.trim() && { company: input.company.trim() }),
        ...(typeof input.phone === "string" && input.phone.trim() && { phone: input.phone.trim() }),
      });
      if (contactId && typeof input.notes === "string" && input.notes.trim()) {
        await hubspot(connection, `/crm/objects/${VERSION}/notes`, {
          method: "POST",
          body: JSON.stringify({
            properties: { hs_timestamp: new Date().toISOString(), hs_note_body: `${input.notes.trim()}${footer(context)}` },
            associations: [
              { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_CONTACT }] },
            ],
          }),
        }).catch((error) => console.error("HubSpot note failed", error));
      }
      return { saved: true, note: "They're saved in HubSpot. The sales team will be in touch." };
    }

    throw new Error(`HubSpot can't ${capability}.`);
  },

  // A ticket in the chosen pipeline, with nobody attached, to check it all works.
  async test(connection, { assistantName }) {
    const [pipeline, stage] = String(connection.config.ticket_destination ?? "").split(":");
    const ticket = await hubspot<{ id: string }>(connection, `/crm/objects/${VERSION}/tickets`, {
      method: "POST",
      body: JSON.stringify({
        properties: {
          subject: `Test ticket from ${BRAND.name}`,
          content: `${assistantName} can open tickets in this HubSpot account. This one is only a test; you can close it.`,
          hs_ticket_priority: "LOW",
          ...(pipeline && stage && { hs_pipeline: pipeline, hs_pipeline_stage: stage }),
        },
      }),
    });
    const hub = connection.metadata.hub_id;
    const domain = connection.metadata.ui_domain ?? "app.hubspot.com";
    return { note: "Test ticket created", url: hub ? `https://${domain}/contacts/${hub}/record/0-5/${ticket.id}` : undefined };
  },

  async revoke(connection) {
    if (connection.secret.via !== "oauth" || !connection.secret.refresh_token) return;
    await callProvider(`https://api.hubspot.com/oauth/${VERSION}/token/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.HUBSPOT_CLIENT_ID ?? "",
        client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
        token: String(connection.secret.refresh_token),
        token_type_hint: "refresh_token",
      }),
    }).catch((error) => console.error("HubSpot revoke failed", error));
  },
};
