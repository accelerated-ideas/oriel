import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chatModel } from "@/config/ai";
import { embeddingCost, llmCost, PRICING_VERSION, transcriptionCost, ttsCost } from "@/lib/usage/pricing";

export type UsageScope = {
  organizationId: string;
  agentId: string | null;
  conversationId: string | null;
  turnId?: string | null;
};

type UsageInput =
  | {
      stage: "llm";
      purpose: "reply" | "summary";
      modelId: string;
      inputTokens: number;
      cachedInputTokens: number;
      // Priced apart where writing the cache costs more (Anthropic).
      cacheWriteInputTokens?: number;
      outputTokens: number;
      // The biggest single request's input, for prices that change with prompt size.
      largestPromptTokens?: number;
    }
  | { stage: "tts"; modelId: string; characters: number }
  // Gemini also bills the text it returns (`outputCharacters`).
  | { stage: "transcription"; modelId: string; audioSeconds: number; keyterms: boolean; outputCharacters?: number }
  // Knowledge: indexing sources ("knowledge") or embedding a visitor's question ("search").
  | { stage: "embedding"; purpose: "knowledge" | "search"; modelId: string; inputTokens: number };

// Records what one model call cost us. Never throws: a missing cost row must
// not break a conversation.
export async function recordUsage(scope: UsageScope, usage: UsageInput) {
  try {
    const base = {
      organization_id: scope.organizationId,
      agent_id: scope.agentId,
      conversation_id: scope.conversationId,
      turn_id: scope.turnId ?? null,
      model_id: usage.modelId,
      pricing_version: PRICING_VERSION,
    };
    const row: Record<string, unknown> =
      usage.stage === "llm"
        ? {
            ...base,
            stage: "llm",
            purpose: usage.purpose,
            provider: chatModel(usage.modelId)?.provider ?? "google",
            input_tokens: usage.inputTokens,
            cached_input_tokens: usage.cachedInputTokens,
            output_tokens: usage.outputTokens,
            cost_usd: llmCost(usage),
          }
        : usage.stage === "embedding"
          ? {
              ...base,
              stage: "embedding",
              purpose: usage.purpose,
              provider: "google",
              input_tokens: usage.inputTokens,
              cost_usd: embeddingCost(usage),
            }
          : usage.stage === "tts"
            ? {
                ...base,
                stage: "tts",
                purpose: "reply",
                provider: "elevenlabs",
                characters: usage.characters,
                cost_usd: ttsCost(usage),
              }
            : {
                ...base,
                stage: "transcription",
                purpose: "call",
                provider: usage.modelId.startsWith("gemini") ? "google" : "elevenlabs",
                audio_seconds: Math.round(usage.audioSeconds * 100) / 100,
                ...(usage.outputCharacters ? { characters: usage.outputCharacters } : {}),
                cost_usd: transcriptionCost(usage),
              };
    const { error } = await supabaseAdmin.from("usage_events").insert(row);
    if (error) console.error("Failed to record usage", error);
  } catch (error) {
    console.error("Failed to record usage", error);
  }
}
