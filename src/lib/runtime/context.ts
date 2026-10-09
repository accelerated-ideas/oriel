import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadConnections, type Connection } from "@/lib/integrations/store";
import { loadStripeConnection, type StripeConnection } from "@/lib/integrations/stripe";
import { siteMapSize, type SiteMapSize } from "@/lib/site-map/search";
import type { Action, Agent, Conversation } from "@/lib/types";

export type RuntimeContext = {
  agent: Agent;
  conversation: Conversation;
  // The pages themselves are loaded per turn (loadSiteMapForPrompt).
  siteMap: SiteMapSize;
  actions: Action[];
  stripe: StripeConnection | null;
  // Slack, Zendesk, Cal.com… (not Stripe, above).
  integrations: Connection[];
};

export async function loadRuntimeContext(conversationId: string): Promise<RuntimeContext | null> {
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;

  const [{ data: agent }, siteMap, { data: actions }, stripe, integrations] = await Promise.all([
    supabaseAdmin.from("agents").select("*").eq("id", conversation.agent_id).single(),
    siteMapSize(conversation.agent_id),
    supabaseAdmin.from("actions").select("*").eq("agent_id", conversation.agent_id).eq("enabled", true).order("created_at"),
    loadStripeConnection(conversation.agent_id),
    loadConnections(conversation.agent_id),
  ]);
  if (!agent) return null;

  return {
    agent: agent as Agent,
    conversation: conversation as Conversation,
    siteMap,
    actions: ((actions ?? []) as Action[]).filter(
      (action) =>
        (action.kind !== "stripe" || stripe) &&
        (action.kind !== "integration" || integrations.some((connection) => connection.provider === action.config.provider)),
    ),
    stripe,
    integrations,
  };
}
