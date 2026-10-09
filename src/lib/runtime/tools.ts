import "server-only";
import { jsonSchema, tool, type Tool } from "ai";
import { chatModelsFor } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { searchKnowledge } from "@/lib/knowledge/search";
import { searchSitePages } from "@/lib/site-map/search";
import { appUrl } from "@/config/brand";
import { CAPABILITIES, type Capability } from "@/lib/integrations/capabilities";
import { adapterFor } from "@/lib/integrations/providers";
import { executeHttpAction, type StoredHttpConfig } from "@/lib/actions/http";
import { runStripeOperation } from "@/lib/actions/stripe";
import { stripeApiKey } from "@/lib/integrations/stripe";
import { STRIPE_OPERATIONS } from "@/lib/actions/stripe-catalog";
import { checkConfirmation, CONFIRMATION_REQUIRED, targetKeys } from "@/lib/runtime/confirmations";
import { notifyHandoff } from "@/lib/runtime/handoff";
import type { RuntimeContext } from "@/lib/runtime/context";
import type { Action, ActionParameter, InsightType, PageLink, StripeOperation } from "@/lib/types";
import { errorMessage, truncate } from "@/lib/utils";

export type Channel = "voice" | "text";

export type ClientToolSpec =
  | { kind: "navigate" }
  | { kind: "highlight" }
  | { kind: "end_call" }
  | { kind: "end_chat" }
  | { kind: "client_action"; action: Action };

// Tools the assistant uses to close the conversation after a goodbye. The
// visitor message they answer isn't billed (see run-turn.ts).
export const CLOSING_TOOL_KINDS = new Set<ClientToolSpec["kind"]>(["end_call", "end_chat"]);

export const BUILTIN_TOOL_NAMES = new Set([
  "navigate",
  "read_page",
  "highlight",
  "search_knowledge",
  "find_page",
  "capture_feedback",
  "escalate_to_human",
  "end_call",
  "end_chat",
]);

const GOODBYE_PROPERTY = {
  type: "string",
  description: "Your short goodbye to the user, e.g. \"You're welcome! Have a great day.\"",
} as const;

const CONFIRMED_PROPERTY = {
  type: "boolean",
  description:
    "Set true once the user has agreed to exactly this, in reply to your question about it. Otherwise leave it out: the tool replies with what to ask.",
} as const;

type JsonObjectSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
};

function parametersToSchema(parameters: ActionParameter[], withConfirmation: boolean): JsonObjectSchema {
  const properties: JsonObjectSchema["properties"] = {};
  const required: string[] = [];
  for (const parameter of parameters) {
    properties[parameter.name] = {
      type: parameter.type,
      description: parameter.description,
      ...(parameter.enum && parameter.enum.length > 0 ? { enum: parameter.enum } : {}),
    };
    if (parameter.required) required.push(parameter.name);
  }
  if (withConfirmation) properties.confirmed = { ...CONFIRMED_PROPERTY };
  return { type: "object", properties, required };
}

function objectSchema(schema: JsonObjectSchema) {
  return jsonSchema<Record<string, unknown>>(schema);
}

function identityOf(context: RuntimeContext) {
  const { conversation } = context;
  return {
    verified: conversation.user_verified,
    id: conversation.user_external_id,
    email: conversation.user_verified ? conversation.user_email : null,
    stripeCustomerId: conversation.user_verified ? conversation.stripe_customer_id : null,
  };
}

// What the model hears when a tool needs a signed-in customer and there isn't one.
export function notSignedIn(context: RuntimeContext) {
  return {
    error: context.conversation.is_preview
      ? "This needs a signed-in customer, and a dashboard preview has no customer account. Don't say they're logged out: explain this works for signed-in users on the site."
      : "This needs a signed-in user, and this visitor isn't signed in. Tell them they need to log in first, and offer to take them to the login page if the site map has one.",
  };
}

// The model and usage scope for checking a user's yes (see confirmations.ts).
export function confirmationCheck(context: RuntimeContext) {
  return {
    model: chatModelsFor(context.agent)[0],
    usage: { organizationId: context.agent.organization_id, agentId: context.agent.id, conversationId: context.conversation.id },
  };
}

// Wraps a sensitive action with identity and confirmation checks.
async function guarded(
  context: RuntimeContext,
  options: {
    name: string;
    requiresIdentity: boolean;
    requiresConfirmation: boolean;
    input: Record<string, unknown>;
    parameters: Pick<ActionParameter, "name" | "required">[];
    // What it does, in a few words, for the confirmation check.
    about: string;
  },
  run: () => Promise<unknown>,
) {
  if (options.requiresIdentity && !identityOf(context).verified) return notSignedIn(context);
  if (options.requiresConfirmation) {
    const { confirmed } = await checkConfirmation(
      context.conversation.id,
      { name: options.name, about: options.about },
      options.input,
      targetKeys(options.parameters),
      confirmationCheck(context),
    );
    if (!confirmed) return CONFIRMATION_REQUIRED;
  }
  try {
    return await run();
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

// How often a tool already ran in this conversation (integration tools have a cap).
async function usesSoFar(conversationId: string, toolName: string) {
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "tool")
    .eq("tool_name", toolName);
  return count ?? 0;
}

export function buildTools(
  context: RuntimeContext,
  channel: Channel,
  // When all the knowledge is already in the prompt there's nothing to search.
  { searchKnowledge: canSearch }: { searchKnowledge: boolean },
) {
  const { agent, conversation, actions, siteMap } = context;
  const builtin = agent.builtin_tools ?? {};
  const tools: Record<string, Tool> = {};
  const clientTools = new Map<string, ClientToolSpec>();

  // What's on their screen is read when needed, not put in every prompt. The
  // widget sends a fresh snapshot with every message and after every move.
  if (agent.share_page_content && !conversation.is_preview) {
    tools.read_page = tool({
      description:
        "Read the page the user is on right now: its visible text, and where its links go. Use it when they ask about something on their screen, before pointing at something on the page, or to find a link to open. It's always current, including right after you take them somewhere. It's quick, so don't announce it. Read before you reply rather than after, and once you've read it, carry on without repeating what you already said.",
      inputSchema: objectSchema({ type: "object", properties: {}, required: [] }),
      execute: async () => {
        const { data } = await supabaseAdmin
          .from("conversations")
          .select("page_title, page_url, page_text, page_links")
          .eq("id", conversation.id)
          .single();
        if (!data?.page_url) return { error: "The page isn't known yet." };
        return {
          title: data.page_title,
          url: data.page_url,
          text: data.page_text ? truncate(data.page_text as string, 4000) : "(no text)",
          links: describeLinks(data.page_links as PageLink[] | null),
        };
      },
    });
  }

  if (builtin.navigate !== false) {
    tools.navigate = tool({
      description:
        "Take the user to a page. Use a path from the site map (like /settings/billing), a link on the current page, or a full URL from a tool result. Say a short line first, like \"Taking you there now.\" When it returns, you've taken them there: carry on from the new page without announcing the move again.",
      inputSchema: objectSchema({
        type: "object",
        properties: {
          url: { type: "string", description: "A path on this site such as /pricing, or a full https URL." },
          page_title: { type: "string", description: "Short name of the destination, e.g. Billing settings." },
        },
        required: ["url"],
      }),
    });
    clientTools.set("navigate", { kind: "navigate" });
  }

  // The model points at things with [[name]] markers in its reply
  // (see inline-markers.ts), not a tool: a tool call would cost a second round
  // trip and usually a second message.

  if (channel === "voice") {
    tools.end_call = tool({
      description:
        "Hang up the call. Only after the user says goodbye or clearly has nothing else. Your goodbye is said before hanging up.",
      inputSchema: objectSchema({
        type: "object",
        properties: { goodbye: GOODBYE_PROPERTY },
        required: ["goodbye"],
      }),
    });
    clientTools.set("end_call", { kind: "end_call" });
  } else {
    tools.end_chat = tool({
      description:
        "Close the chat. Only when the user says goodbye or thanks you and clearly has nothing else to ask. Your goodbye is shown as your last message.",
      inputSchema: objectSchema({
        type: "object",
        properties: { goodbye: GOODBYE_PROPERTY },
        required: ["goodbye"],
      }),
    });
    clientTools.set("end_chat", { kind: "end_chat" });
  }

  if (builtin.search_knowledge !== false && canSearch) {
    tools.search_knowledge = tool({
      description:
        "Search the product documentation and knowledge base. Use it when the knowledge already in your instructions doesn't answer the question.",
      inputSchema: objectSchema({
        type: "object",
        properties: { query: { type: "string", description: "What to look up, phrased as a question or keywords." } },
        required: ["query"],
      }),
      execute: async (input) => {
        try {
          const results = await searchKnowledge(
            agent.id,
            { text: String(input.query ?? "") },
            { usage: { organizationId: agent.organization_id, agentId: agent.id, conversationId: conversation.id } },
          );
          if (results.length === 0) return { results: [], note: "Nothing relevant found. Say you're not sure rather than guessing." };
          return { results: results.map((r) => ({ source: r.title, url: r.url, excerpt: r.content })) };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    });
  }

  // Large site maps aren't in the prompt whole (see site-map/search.ts).
  if (siteMap.pages > 0 && !siteMap.inline) {
    tools.find_page = tool({
      description:
        "Look up pages in the site map by what the user wants to do or find, e.g. \"change payment card\" or \"API keys\". Use it when the site map pages in your instructions don't include the right one. Returns pages with their paths, for navigate.",
      inputSchema: objectSchema({
        type: "object",
        properties: { query: { type: "string", description: "What the user wants to do or find." } },
        required: ["query"],
      }),
      execute: async (input) => {
        try {
          const pages = await searchSitePages(
            agent.id,
            { text: String(input.query ?? "") },
            { count: 8, usage: { organizationId: agent.organization_id, agentId: agent.id, conversationId: conversation.id } },
          );
          if (pages.length === 0) return { pages: [], note: "No page in the site map matches. Don't guess a path." };
          return {
            pages: pages.map((page) => ({
              title: page.title,
              path: page.path,
              ...(page.description && { description: page.description }),
              ...(page.requires_auth && { requires_login: true }),
            })),
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    });
  }

  if (builtin.capture_feedback !== false) {
    tools.capture_feedback = tool({
      description:
        "Record what the user experienced with the product, for the team: a bug they hit in the product, a feature they asked for, something in the product that confused them, a complaint, praise, or a sign they might leave. It's about the user and the product, never about you: don't record your own mistakes, failed tools, things you didn't know, or how the conversation went. Call it once you understand the issue well enough to describe it clearly. Don't tell the user you're logging it unless they ask. It's recorded in the background and your turn ends there, so write everything you want to say (including any question) before calling it.",
      inputSchema: objectSchema({
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["bug", "feature_request", "confusion", "complaint", "praise", "churn_risk", "other"],
            description: "What kind of feedback this is.",
          },
          title: {
            type: "string",
            description: "One-line summary from the user's side, for the product team, e.g. \"Can't find where to invite teammates\".",
          },
          details: {
            type: "string",
            description: "What the user was trying to do, what happened, what they expected, and any steps or context.",
          },
          severity: { type: "string", enum: ["low", "medium", "high"], description: "Impact on the user." },
          updates: {
            type: "string",
            description:
              "To add to feedback you already recorded in this conversation (you learned more about the same issue), the id its result gave. Leave it out for a new issue.",
          },
        },
        required: ["type", "title", "details"],
      }),
      execute: async (input) => {
        const entry = {
          type: input.type as InsightType,
          title: String(input.title ?? "").slice(0, 200),
          details: String(input.details ?? "").slice(0, 4000),
          severity: (input.severity as string) || "medium",
        };
        // Learning more about an issue already recorded updates that entry
        // rather than adding a second one (only this conversation's own).
        if (typeof input.updates === "string" && input.updates) {
          const { data: updated } = await supabaseAdmin
            .from("insights")
            .update(entry)
            .eq("id", input.updates)
            .eq("conversation_id", conversation.id)
            .select("id")
            .maybeSingle();
          if (updated) return { recorded: true, id: updated.id, note: "Updated. Carry on without mentioning it." };
        }
        const { data: created } = await supabaseAdmin
          .from("insights")
          .insert({
            ...entry,
            agent_id: agent.id,
            organization_id: agent.organization_id,
            conversation_id: conversation.id,
            page_url: conversation.page_url,
            user_email: conversation.user_email,
          })
          .select("id")
          .single();
        return { recorded: true, id: created?.id, note: "Carry on without mentioning it." };
      },
    });
  }

  if (builtin.escalate !== false) {
    tools.escalate_to_human = tool({
      description:
        "Ask the human team to follow up when you can't solve it, the user asks for a person, or it involves money or account access you can't handle. Nobody joins this conversation: the team gets back to them later, usually by email, so never say someone is joining. Include a complete summary so nobody has to ask the user again.",
      inputSchema: objectSchema({
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "The problem, what was tried, what the user expects, and anything the team needs to act.",
          },
          urgency: { type: "string", enum: ["low", "medium", "high"], description: "How urgent it is for the user." },
          contact_email: {
            type: "string",
            description: "Where the team should reply. Only if the user gave one and they aren't signed in.",
          },
        },
        required: ["summary"],
      }),
      execute: async (input) => {
        const email = (input.contact_email as string | undefined) || conversation.user_email;
        const { data: insight } = await supabaseAdmin
          .from("insights")
          .insert({
            agent_id: agent.id,
            organization_id: agent.organization_id,
            conversation_id: conversation.id,
            type: "handoff",
            title: String(input.summary ?? "").split(/[.\n]/)[0].slice(0, 160) || "Follow-up requested",
            details: String(input.summary ?? "").slice(0, 4000),
            severity: (input.urgency as string) || "medium",
            page_url: conversation.page_url,
            user_email: email,
          })
          .select("id")
          .single();
        await notifyHandoff({ agent, conversation, summary: String(input.summary ?? ""), email, insightId: insight?.id ?? null });
        return {
          handed_off: true,
          note: email
            ? `The team will follow up by email at ${email}.`
            : "The team has the details. If the user wants a reply, ask for their email and call this again with contact_email.",
        };
      },
    });
  }

  for (const action of actions) {
    if (BUILTIN_TOOL_NAMES.has(action.name)) continue;

    const signedInNote = action.requires_identity || action.kind === "stripe" ? " Requires a signed-in user." : "";

    if (action.kind === "client") {
      tools[action.name] = tool({
        description: `${action.description || action.title}${signedInNote}`,
        inputSchema: objectSchema(parametersToSchema(action.parameters, action.requires_confirmation)),
      });
      clientTools.set(action.name, { kind: "client_action", action });
      continue;
    }

    if (action.kind === "http") {
      tools[action.name] = tool({
        description: `${action.description || action.title}${signedInNote}`,
        inputSchema: objectSchema(parametersToSchema(action.parameters, action.requires_confirmation)),
        execute: async (input) =>
          guarded(
            context,
            {
              name: action.name,
              requiresIdentity: action.requires_identity,
              requiresConfirmation: action.requires_confirmation,
              input,
              parameters: action.parameters,
              about: action.title || action.description || action.name,
            },
            () =>
              executeHttpAction(action.config as StoredHttpConfig, {
                input,
                user: {
                  id: conversation.user_external_id,
                  email: conversation.user_email,
                  name: conversation.user_name,
                  verified: conversation.user_verified,
                  attributes: conversation.user_attributes,
                },
                conversation: { id: conversation.id, page_url: conversation.page_url },
              }),
          ),
      });
      continue;
    }

    // Slack, Zendesk, Cal.com…: one tool per capability, run by the connected
    // service that handles it (src/lib/integrations).
    if (action.kind === "integration") {
      const capability = action.config.capability as Capability | undefined;
      const connection = context.integrations.find((candidate) => candidate.provider === action.config.provider);
      if (!capability || !CAPABILITIES[capability] || !connection) continue;
      const spec = CAPABILITIES[capability];
      tools[action.name] = tool({
        description: spec.description,
        inputSchema: objectSchema(parametersToSchema(spec.parameters, action.requires_confirmation)),
        execute: async (input) =>
          guarded(
            context,
            {
              name: action.name,
              requiresIdentity: false,
              requiresConfirmation: action.requires_confirmation,
              input,
              parameters: spec.parameters,
              about: action.title || spec.description,
            },
            async () => {
              if ((await usesSoFar(conversation.id, action.name)) >= spec.maxPerConversation) {
                return { error: "This was already done in this conversation. Don't do it again; tell the user it's taken care of." };
              }
              const givenEmail = text(input.email);
              return adapterFor(connection.provider).run(capability, {
                connection,
                input,
                user: {
                  name: text(input.name) ?? conversation.user_name,
                  // A signed-in user's own email wins over anything typed.
                  email: conversation.user_verified
                    ? conversation.user_email
                    : givenEmail && EMAIL.test(givenEmail)
                      ? givenEmail
                      : conversation.user_email,
                  verified: conversation.user_verified,
                  timeZone: text(input.time_zone) ?? conversation.time_zone,
                },
                conversation: {
                  id: conversation.id,
                  pageUrl: conversation.page_url,
                  transcriptUrl: appUrl(`/account/${agent.organization_id}/agents/${agent.id}/conversations/${conversation.id}`),
                  assistantName: agent.assistant_name,
                },
              });
            },
          ),
      });
      continue;
    }

    if (action.kind === "stripe" && context.stripe) {
      const operation = action.config.operation as StripeOperation | undefined;
      if (!operation || !STRIPE_OPERATIONS[operation]) continue;
      const spec = STRIPE_OPERATIONS[operation];
      const parameters = spec.parameters.map((parameter) =>
        operation === "change_plan" && parameter.name === "price_id"
          ? {
              ...parameter,
              description: `The plan to switch to. Options: ${(action.config.allowed_prices ?? [])
                .map((price) => `${price.label} = ${price.price_id}`)
                .join("; ")}`,
              enum: (action.config.allowed_prices ?? []).map((price) => price.price_id),
            }
          : parameter,
      );
      const stripe = context.stripe;
      tools[action.name] = tool({
        description: `${action.description || spec.description}${signedInNote}`,
        inputSchema: objectSchema(parametersToSchema(parameters, action.requires_confirmation)),
        execute: async (input) =>
          guarded(
            context,
            {
              name: action.name,
              requiresIdentity: true,
              requiresConfirmation: action.requires_confirmation,
              input,
              parameters,
              about: action.title || action.description || spec.description,
            },
            async () =>
              runStripeOperation({
                secretKey: await stripeApiKey(stripe),
                operation,
                config: { ...action.config, operation },
                input,
                identity: {
                  stripeCustomerId: conversation.stripe_customer_id,
                  // Matching by email is opt-in: it's only safe when the site verifies emails.
                  email: stripe.config.match_by_email === true ? conversation.user_email : null,
                },
                returnUrl: conversation.page_url,
              }),
          ),
      });
    }
  }

  // Pages are referenced by the navigate tool; nothing else to register for them.
  return { tools, clientTools };
}

// Where the page's links go, kept short.
function describeLinks(links: PageLink[] | null) {
  const lines: string[] = [];
  let length = 0;
  for (const link of links ?? []) {
    const line = `${link.text}: ${link.url}`;
    length += line.length + 1;
    if (length > 2500) break;
    lines.push(line);
  }
  return lines;
}

// Tools that run without an activity line in the widget: they're part of
// answering, not something the user needs to see happen.
export const SILENT_TOOLS = new Set(["read_page"]);

// Labels for activity chips in the widget and the dashboard transcript.
export function toolDisplayName(name: string, actions: Action[]) {
  const builtins: Record<string, string> = {
    navigate: "Opened a page",
    read_page: "Read the page",
    highlight: "Pointed at something",
    search_knowledge: "Searched the docs",
    capture_feedback: "Noted feedback",
    escalate_to_human: "Looped in the team",
    end_call: "Ended the call",
    end_chat: "Ended the chat",
  };
  return builtins[name] ?? actions.find((action) => action.name === name)?.title ?? name.replace(/_/g, " ");
}
