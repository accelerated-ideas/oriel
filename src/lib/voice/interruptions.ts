import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Marks where the user cut the assistant off; the model sees it as a trailing dash.
export const INTERRUPTED_MARK = "—";

export type HeardBlock = {
  // Text of this assistant message as the widget received it.
  received: string;
  // How much of it was actually played before the interruption ("" = none).
  heard: string;
};

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

async function recentAssistantText(conversationId: string) {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("id, content")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .is("tool_call_id", null)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []).map((row) => ({ id: row.id as string, content: normalize(row.content as string) }));
}

// Cuts stored assistant messages down to what the user actually heard before
// interrupting, so the model knows what was really said. Messages are matched
// by the text the widget received. Anything newer than the newest match was
// generated but never reached the widget, so it wasn't heard either.
export async function applyInterruption(conversationId: string, blocks: HeardBlock[]) {
  const entries = blocks
    .map((block) => ({ received: normalize(block.received), heard: normalize(block.heard) }))
    .filter((block) => block.received);
  if (entries.length === 0) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    const rows = await recentAssistantText(conversationId); // newest first
    const updates: PromiseLike<unknown>[] = [];
    let cursor = 0;
    let newestMatch = -1;

    for (const entry of [...entries].reverse()) {
      const index = rows.findIndex((row, i) => i >= cursor && row.content.startsWith(entry.received));
      if (index === -1) continue;
      if (newestMatch === -1) newestMatch = index;
      cursor = index + 1;
      const row = rows[index];
      if (!entry.heard) updates.push(supabaseAdmin.from("messages").delete().eq("id", row.id));
      else if (entry.heard !== row.content) {
        updates.push(
          supabaseAdmin.from("messages").update({ content: `${entry.heard}${INTERRUPTED_MARK}` }).eq("id", row.id),
        );
      }
    }

    if (newestMatch === -1) {
      // The interrupted turn may still be saving its partial reply.
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
      continue;
    }
    for (const row of rows.slice(0, newestMatch)) {
      updates.push(supabaseAdmin.from("messages").delete().eq("id", row.id));
    }
    await Promise.all(updates);
    return;
  }
}
