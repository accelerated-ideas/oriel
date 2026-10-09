import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, streamText } from "ai";
import { CHAT_MODELS, chatModel, resolveChatModels, type ChatModel, type ChatProvider } from "@/config/ai";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export const google = createGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY });
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// A provider's models can only be used once its key is set. Google is always
// set: embeddings and summaries need it.
const PROVIDER_KEYS: Record<ChatProvider, string | undefined> = {
  google: GOOGLE_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
};

export function isChatModelAvailable(id: string) {
  const model = chatModel(id);
  return Boolean(model && PROVIDER_KEYS[model.provider]);
}

export function availableChatModelIds() {
  return CHAT_MODELS.filter((model) => isChatModelAvailable(model.id)).map((model) => model.id);
}

// The models a turn tries, in order (see resolveChatModels).
export function chatModelsFor(agent: { chat_model: string | null; fallback_model: string | null }): ChatModel[] {
  const { primary, fallback } = resolveChatModels(agent, availableChatModelIds());
  return fallback ? [primary, fallback] : [primary];
}

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;

export function languageModel(model: ChatModel): LanguageModel {
  if (model.provider === "anthropic") return anthropic(model.id);
  if (model.provider === "openai") return openai(model.id);
  return google(model.id);
}

// Each provider's settings for a reply: thinking per channel (see CHAT_MODELS),
// no reasoning shown. OpenAI doesn't store the conversation (we send the
// history every turn).
export function languageModelOptions(model: ChatModel, channel: "voice" | "text"): ProviderOptions {
  if (model.provider === "anthropic") {
    const effort = model.effort?.[channel] ?? "off";
    return {
      anthropic: effort === "off" ? { thinking: { type: "disabled" as const } } : { thinking: { type: "adaptive" as const }, effort },
    };
  }
  if (model.provider === "openai") {
    const reasoningEffort = model.reasoningEffort?.[channel];
    return { openai: { store: false, ...(reasoningEffort ? { reasoningEffort } : {}) } };
  }
  return {
    google: {
      thinkingConfig: { thinkingLevel: model.thinkingLevel?.[channel] ?? "low", includeThoughts: false },
    },
  };
}

// For short checks that need no thinking (a yes or no), with the least each
// provider allows.
export function quickModelOptions(model: ChatModel): ProviderOptions {
  if (model.provider === "anthropic") return { anthropic: { thinking: { type: "disabled" as const } } };
  if (model.provider === "openai") return { openai: { store: false, reasoningEffort: "none" } };
  return { google: { thinkingConfig: { thinkingLevel: "low", includeThoughts: false } } };
}
