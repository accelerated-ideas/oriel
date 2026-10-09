import "server-only";
import { verifySession } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function readWidgetSession(token: unknown) {
  const claims = verifySession(token);
  if (!claims) return null;
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id, agent_id, organization_id, status, page_url")
    .eq("id", claims.conversationId)
    .eq("agent_id", claims.agentId)
    .maybeSingle();
  if (!conversation) return null;
  return { ...claims, organizationId: conversation.organization_id as string, pageUrl: conversation.page_url as string | null };
}

export async function markConversationActive(conversationId: string, patch: Record<string, unknown> = {}) {
  await supabaseAdmin
    .from("conversations")
    .update({ status: "active", ended_at: null, updated_at: new Date().toISOString(), ...patch })
    .eq("id", conversationId);
}
