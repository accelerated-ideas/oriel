// Model choices live here so they can be swapped without touching runtime code.

// The models an assistant can reply with, voice and text alike. Each
// assistant picks one, plus a fallback that takes over when it fails or
// doesn't answer in time (agents.chat_model, agents.fallback_model).
// Thinking is set per channel. All three think a little on calls too: it
// costs time before the first word (Haiku 5.5: a median 0.76s without
// thinking, 1.49s with low effort, in the call tests of October 8, 2026) but
// made fewer slips (half the issues a reviewing model flagged).
export type ChatProvider = "google" | "anthropic" | "openai";

type PerChannel<T> = { voice: T; text: T };

export type ChatModel = {
  id: string;
  name: string;
  provider: ChatProvider;
  // Google: thinking level. gemini-3.8-flash takes low / medium / high (not minimal).
  thinkingLevel?: PerChannel<string>;
  // Anthropic: adaptive thinking at this effort, or "off" for none.
  effort?: PerChannel<"off" | "low" | "medium">;
  // OpenAI: reasoning effort (gpt-6-luna defaults to medium).
  reasoningEffort?: PerChannel<"none" | "low" | "medium">;
  // Added to the system prompt when this model answers and can read the page.
  pageReading?: string;
};

// Gemini and GPT-6 Luna read the page on nearly every turn, which costs a
// model step each time (about 4s to the first word in tests). Haiku reads
// only when it needs to.
const READ_PAGE_SPARINGLY =
  "Use read_page only when your answer depends on what's on their screen right now. Most questions don't: answer them from your knowledge. Don't read the page on every turn: if you've already read it and they haven't moved, use what you read.";

// The current model from each provider. Their previous versions (Gemini 3.5
// Flash, Claude Haiku 4.5, GPT-5.4 mini) cost more, so they aren't offered.
export const CHAT_MODELS = [
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", provider: "anthropic", effort: { voice: "low", text: "low" } },
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "google",
    thinkingLevel: { voice: "low", text: "low" },
    pageReading: READ_PAGE_SPARINGLY,
  },
  {
    id: "gpt-6-luna",
    name: "GPT-6 Luna",
    provider: "openai",
    reasoningEffort: { voice: "low", text: "low" },
    pageReading: READ_PAGE_SPARINGLY,
  },
] as const satisfies readonly ChatModel[];

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

// Haiku 5.5 was the quickest to answer and among the cheapest in tests
// (README, "Latency"). Gemini backs it up: its key is always set, since
// embeddings and summaries need it.
export const DEFAULT_CHAT_MODEL_ID: ChatModelId = "claude-haiku-5-5";
export const DEFAULT_FALLBACK_MODEL_ID: ChatModelId = "gemini-3.8-flash";

export const CHAT_PROVIDER_NAMES: Record<ChatProvider, string> = {
  google: "Google",
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export function chatModel(id: string | null | undefined): ChatModel | null {
  return CHAT_MODELS.find((model) => model.id === id) ?? null;
}

// The models that actually answer, given the assistant's choices and which
// providers have keys: its model, or else the default, or else the first
// usable one; then its fallback, when that's usable and different.
export function resolveChatModels(chosen: { chat_model: string | null; fallback_model: string | null }, usable: readonly string[]) {
  const candidates = [chosen.chat_model, DEFAULT_CHAT_MODEL_ID, ...CHAT_MODELS.map((model) => model.id)];
  const primary = chatModel(candidates.find((id) => id && usable.includes(id)) ?? DEFAULT_FALLBACK_MODEL_ID)!;
  const fallback = chosen.fallback_model && usable.includes(chosen.fallback_model) ? chatModel(chosen.fallback_model) : null;
  return { primary, fallback: fallback && fallback.id !== primary.id ? fallback : null };
}

// When the model hasn't started answering after this long, the fallback takes
// over. Gemini's first words usually come in 1.5 to 4 seconds but have spiked
// past 10 (README, "Latency").
export const FALLBACK_AFTER_MS = 12_000;

// Cheap model for post-call summaries.
export const SUMMARY_MODEL_ID = "gemini-3.8-flash";

export const EMBEDDING_MODEL_ID = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;

// Voice calls run our own pipeline: speech-to-text in the browser (Gemini Live
// transcription, or ElevenLabs Scribe when Gemini can't take the call), and
// Eleven v4 Turbo for the assistant's voice, over an ElevenLabs WebSocket.
// v4 Turbo is only served by the Text to Dialogue WebSocket, not /stream-input.
export const TTS_MODEL_ID = "eleven_v4_turbo";
export const TTS_SAMPLE_RATE = 24_000;
// Speech-to-text providers, in the order a call tries them. Gemini allows about
// 1,000 sessions at once on a Tier 2 project; Scribe allows only as many as the
// ElevenLabs plan (15 on Creator), counting every open call, and refuses the
// rest. Measured on the same audio (October 2026), both finish a transcript
// about 0.7–0.9 s after a sentence ends.
export const STT_PROVIDERS = ["gemini", "scribe"] as const;
export type SttProvider = (typeof STT_PROVIDERS)[number];
export const GEMINI_STT_MODEL_ID = "gemini-3.5-transcribe-live";
// Silence after which Gemini ends the user's turn. 300 ms matched Scribe's
// 0.55 s at the end of a sentence; it waits longer on its own when speech
// stops mid-sentence.
export const GEMINI_STT_SILENCE_MS = 300;
export const STT_MODEL_ID = "scribe_v2_realtime";
// Silence after which Scribe ends the user's turn. Lower answers sooner but
// cuts in on people who pause mid-sentence (the next turn then merges in).
export const STT_VAD_SILENCE_SECS = 0.55;
// How sure Scribe must be that it hears speech (0.1–0.9, its default 0.4), and
// the shortest sound that counts (50–2000 ms, default 100). A little stricter
// than the defaults so clicks, bumps and quiet voices across the room don't
// start a turn; in tests it still heard a soft voice over room noise. Scribe's
// filter_background_audio was tried and left off: it was slower and once
// missed a soft voice.
export const STT_VAD_THRESHOLD = 0.45;
export const STT_MIN_SPEECH_MS = 250;

// Knowledge bases below this size are placed in the prompt verbatim instead of retrieved.
export const INLINE_KNOWLEDGE_MAX_CHARS = 24_000;
// Pinned sources are in every prompt, so they're kept small.
export const PINNED_KNOWLEDGE_MAX_CHARS = 30_000;
// Site maps below this size are placed in the prompt whole (about 100 to 200
// pages); larger ones are searched each turn.
export const INLINE_SITE_MAP_MAX_CHARS = 8_000;

// How many prior messages the model sees on each turn.
export const HISTORY_MESSAGE_LIMIT = 60;
