import "server-only";
import type { ModelMessage } from "ai";
import { HISTORY_MESSAGE_LIMIT } from "@/config/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MessageRow } from "@/lib/types";

export async function loadMessageRows(conversationId: string, limit = HISTORY_MESSAGE_LIMIT) {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as MessageRow[]).reverse();
}

type ToolCallPart = Extract<Exclude<ModelMessage["content"], string>[number], { type: "tool-call" }>;

function toolOutput(value: unknown) {
  if (typeof value === "string") return { type: "text" as const, value };
  return { type: "json" as const, value: (value ?? null) as never };
}

// Rebuilds model messages from stored rows. Tool calls without a result (or
// results without a call) are dropped so the provider always gets valid pairs.
export function rowsToModelMessages(rows: MessageRow[]): ModelMessage[] {
  const resultIds = new Set(rows.filter((row) => row.role === "tool" && row.tool_call_id).map((row) => row.tool_call_id));
  const callIds = new Set(
    rows.filter((row) => row.role === "assistant" && row.tool_call_id).map((row) => row.tool_call_id),
  );

  // Drop leading rows until the first user message so history never starts mid-turn.
  const firstUser = rows.findIndex((row) => row.role === "user");
  const usable = firstUser === -1 ? [] : rows.slice(Math.max(0, firstUser - 1));

  const messages: ModelMessage[] = [];
  // The page the user moved to since their last message ("Opened Install · …").
  // It isn't something they said, but the model has to see it where it
  // happened: after "click Acme" and a click, the next question is asked from
  // Acme's page. Only the latest move counts.
  // Moves the assistant made itself (navigate) are in its tool results; this
  // marks the ones the user made.
  let moved: MessageRow | null = null;
  let previous: MessageRow | null = null;
  for (const row of usable) {
    const last = messages[messages.length - 1];

    if (row.role === "event") {
      if (row.page_url) {
        const byAssistant = previous?.role === "assistant" && previous.tool_name === "navigate";
        moved = byAssistant ? null : row;
      }
      continue;
    }
    previous = row;

    if (row.role === "user") {
      if (!row.content.trim()) continue;
      const title = moved?.content.startsWith("Opened ") ? moved.content.slice("Opened ".length) : moved?.content;
      const page = moved ? `"${title}"` : null;
      const content = moved ? `[The user went to the ${page} page themselves: ${moved.page_url}]\n${row.content}` : row.content;
      moved = null;
      if (last?.role === "user" && typeof last.content === "string") {
        last.content = `${last.content}\n${content}`;
      } else {
        messages.push({ role: "user", content });
      }
      continue;
    }

    if (row.role === "assistant") {
      const parts: Exclude<Extract<ModelMessage, { role: "assistant" }>["content"], string> = [];
      if (row.tool_call_id) {
        if (!resultIds.has(row.tool_call_id) || !row.tool_name) continue;
        const call: ToolCallPart = {
          type: "tool-call",
          toolCallId: row.tool_call_id,
          toolName: row.tool_name,
          input: row.tool_input ?? {},
          ...(row.provider_metadata ? { providerOptions: row.provider_metadata as never } : {}),
        };
        parts.push(call);
      } else if (row.content.trim()) {
        parts.push({ type: "text", text: row.content });
      } else {
        continue;
      }

      if (last?.role === "assistant" && Array.isArray(last.content)) {
        // Text after a tool call starts a new assistant message only after a tool result.
        last.content.push(...parts);
      } else {
        messages.push({ role: "assistant", content: parts });
      }
      continue;
    }

    if (row.role === "tool") {
      if (!row.tool_call_id || !callIds.has(row.tool_call_id) || !row.tool_name) continue;
      const part = {
        type: "tool-result" as const,
        toolCallId: row.tool_call_id,
        toolName: row.tool_name,
        output: toolOutput(row.tool_output),
      };
      if (last?.role === "tool") {
        last.content.push(part);
      } else {
        messages.push({ role: "tool", content: [part] });
      }
    }
  }

  // Gemini wants the conversation to start with a user turn.
  while (messages.length > 0 && messages[0].role !== "user") messages.shift();
  return messages;
}

export async function insertMessages(rows: Partial<MessageRow>[]) {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from("messages").insert(rows);
  if (error) console.error("Failed to persist messages", error);
}

// The assistant closed the conversation (end_call, end_chat) in reply to the
// visitor's last message, a goodbye, so that message isn't billed.
export async function markLastVisitorMessageFree(conversationId: string) {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) await supabaseAdmin.from("messages").update({ billable: false }).eq("id", data.id);
}
