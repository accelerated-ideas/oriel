import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { truncate } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

export const CONVERSATION_PAGE_SIZE = 40;

export type ConversationListItem = Pick<
  Conversation,
  | "id"
  | "used_voice"
  | "used_text"
  | "voice_seconds"
  | "message_count"
  | "visitor_id"
  | "user_external_id"
  | "user_email"
  | "user_name"
  | "user_verified"
  | "country"
  | "sentiment"
> & { title: string; at: string; handoff: boolean };

// Conversations newest first, for the list beside the transcript. `before` is
// the `at` of the last item already shown; `query` matches title, summary and visitor.
export async function listConversations(agentId: string, options: { query?: string; before?: string } = {}) {
  let request = supabaseAdmin
    .from("conversations")
    .select(
      "id, created_at, last_message_at, used_voice, used_text, voice_seconds, message_count, visitor_id, user_external_id, user_email, user_name, user_verified, country, title, sentiment",
    )
    .eq("agent_id", agentId)
    .gt("message_count", 1)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(CONVERSATION_PAGE_SIZE + 1);
  if (options.before) request = request.lt("last_message_at", options.before);

  // PostgREST filter syntax treats these as separators, so they can't be searched for.
  const query = options.query?.replace(/[,()%*\\]/g, " ").trim();
  if (query) {
    const pattern = `%${query}%`;
    request = request.or(
      `title.ilike.${pattern},summary.ilike.${pattern},user_email.ilike.${pattern},user_name.ilike.${pattern}`,
    );
  }

  const { data } = await request;
  const rows = (data ?? []) as Conversation[];
  const hasMore = rows.length > CONVERSATION_PAGE_SIZE;
  const page = rows.slice(0, CONVERSATION_PAGE_SIZE);

  // Conversations that haven't been summarized yet are named after their first question.
  const untitled = page.filter((row) => !row.title).map((row) => row.id);
  const firstQuestions = new Map<string, string>();
  if (untitled.length > 0) {
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("conversation_id, content")
      .in("conversation_id", untitled)
      .eq("role", "user")
      .order("created_at", { ascending: true });
    for (const message of messages ?? []) {
      if (!firstQuestions.has(message.conversation_id)) firstQuestions.set(message.conversation_id, message.content);
    }
  }

  // Follow-up requests nobody has dealt with yet.
  const handoffs = new Set<string>();
  if (page.length > 0) {
    const { data: insights } = await supabaseAdmin
      .from("insights")
      .select("conversation_id")
      .in(
        "conversation_id",
        page.map((row) => row.id),
      )
      .eq("type", "handoff")
      .eq("status", "open");
    for (const insight of insights ?? []) handoffs.add(insight.conversation_id);
  }

  const items: ConversationListItem[] = page.map((row) => ({
    id: row.id,
    used_voice: row.used_voice,
    used_text: row.used_text,
    voice_seconds: row.voice_seconds,
    message_count: row.message_count,
    visitor_id: row.visitor_id,
    user_external_id: row.user_external_id,
    user_email: row.user_email,
    user_name: row.user_name,
    user_verified: row.user_verified,
    country: row.country,
    sentiment: row.sentiment,
    title: row.title ?? truncate(firstQuestions.get(row.id) ?? "Untitled", 120),
    at: row.last_message_at ?? row.created_at,
    handoff: handoffs.has(row.id),
  }));
  return { items, hasMore };
}
