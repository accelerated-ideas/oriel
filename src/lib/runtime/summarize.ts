import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { google } from "@/lib/ai";
import { SUMMARY_MODEL_ID } from "@/config/ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadMessageRows } from "@/lib/runtime/history";
import { recordUsage } from "@/lib/usage/record";

const summarySchema = z.object({
  title: z.string().describe("4-8 word title of what the user wanted, e.g. 'Stripe connection keeps failing'"),
  summary: z.string().describe("2-3 sentences: what the user wanted, what happened, and how it ended."),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  resolved: z.boolean().describe("Whether the user's need was met by the end."),
});

// Titles and summarizes a conversation for the dashboard.
export async function summarizeConversation(conversationId: string) {
  try {
    const rows = await loadMessageRows(conversationId, 120);
    const transcript = rows
      .filter((row) => (row.role === "user" || row.role === "assistant") && row.content.trim())
      .map((row) => `${row.role === "user" ? "User" : "Assistant"}: ${row.content}`)
      .join("\n");
    if (!rows.some((row) => row.role === "user")) return;

    const { output, usage } = await generateText({
      model: google(SUMMARY_MODEL_ID),
      output: Output.object({ schema: summarySchema }),
      prompt: `Summarize this support conversation between a website visitor and an AI assistant.\n\n${transcript.slice(-24_000)}`,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    });

    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .update({ title: output.title, summary: output.summary, sentiment: output.sentiment, resolved: output.resolved })
      .eq("id", conversationId)
      .select("organization_id, agent_id")
      .single();
    if (conversation) {
      await recordUsage(
        { organizationId: conversation.organization_id, agentId: conversation.agent_id, conversationId },
        {
          stage: "llm",
          purpose: "summary",
          modelId: SUMMARY_MODEL_ID,
          inputTokens: usage.inputTokens ?? 0,
          cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
        },
      );
    }
  } catch (error) {
    console.error("Failed to summarize conversation", conversationId, error);
  }
}

// The assistant ended the chat (end_chat): close the conversation and summarize it.
export async function endConversation(conversationId: string) {
  await supabaseAdmin
    .from("conversations")
    .update({ status: "ended", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  await summarizeConversation(conversationId);
}

// Titles a conversation once it has some substance, then refreshes the summary every few turns.
export async function maybeSummarize(conversationId: string) {
  const { data } = await supabaseAdmin
    .from("conversations")
    .select("title, message_count")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return;
  const count = data.message_count ?? 0;
  if ((!data.title && count >= 4) || (count >= 10 && count % 8 === 0)) {
    await summarizeConversation(conversationId);
  }
}
