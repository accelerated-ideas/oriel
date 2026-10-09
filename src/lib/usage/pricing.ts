// What we pay providers, used to estimate the cost of every model call.
// Prices change on known dates (promos, intro pricing), so each list is
// ordered by the date it takes effect and costs use the price on the day.
// Bump PRICING_VERSION whenever a number here changes.

export const PRICING_VERSION = "2026-10-08.4";

type Dated<T> = { from: string; price: T }[];

function priceOn<T>(list: Dated<T>, at: Date) {
  let current = list[0].price;
  for (const entry of list) if (at >= new Date(entry.from)) current = entry.price;
  return current;
}

const round = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000;

// Chat models, USD per 1M tokens. Output includes thinking tokens. A price can
// change above a prompt size (`longPrompt`: requests with more input tokens than
// `over` pay those prices instead).
// https://ai.google.dev/gemini-api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
// https://developers.openai.com/api/docs/models
// `cacheWrite`: Anthropic bills writing the prompt cache above the input price
// (1.25x for the 5-minute cache); elsewhere caching is free to write.
type TokenPrice = { input: number; cachedInput: number; cacheWrite?: number; output: number };
const TOKEN_PRICES: Record<string, Dated<TokenPrice & { longPrompt?: { over: number } & TokenPrice }>> = {
  "gemini-3.8-flash": [
    { from: "2026-01-01T00:00:00Z", price: { input: 0.75, cachedInput: 0.075, output: 3.75 } },
    { from: "2027-01-01T00:00:00Z", price: { input: 1.5, cachedInput: 0.15, output: 7.5 } },
  ],
  "claude-haiku-5-5": [
    {
      from: "2026-01-01T00:00:00Z",
      price: {
        input: 0.1,
        cachedInput: 0.01,
        cacheWrite: 0.125,
        output: 0.5,
        longPrompt: { over: 100_000, input: 0.5, cachedInput: 0.05, cacheWrite: 0.625, output: 2.5 },
      },
    },
  ],
  "gpt-6-luna": [{ from: "2026-01-01T00:00:00Z", price: { input: 0.1, cachedInput: 0.01, output: 0.5 } }],
};

// Gemini embeddings, USD per 1M input tokens (text).
const EMBEDDING_PRICES: Record<string, Dated<number>> = {
  "gemini-embedding-2": [{ from: "2026-01-01T00:00:00Z", price: 0.2 }],
};

// ElevenLabs text-to-speech, USD per 1K characters. v4 Turbo is 72% off until October 12, 2026.
// https://elevenlabs.io/pricing/api
const TTS_PRICES: Record<string, Dated<number>> = {
  eleven_v4_turbo: [
    { from: "2026-01-01T00:00:00Z", price: 0.011 },
    { from: "2026-10-13T00:00:00Z", price: 0.04 },
  ],
  eleven_flash_v2_5: [{ from: "2026-01-01T00:00:00Z", price: 0.04 }],
};

// Speech-to-text, billed for the audio sent. Scribe: USD per hour, plus
// `keyterms` per hour when keyterm prompting is on.
// https://elevenlabs.io/pricing/api
// Gemini: audio in (25 tokens a second) and the transcript out, USD per 1M
// tokens; the transcript is estimated from its length.
// https://ai.google.dev/gemini-api/docs/pricing
type SttPrice = { perHour: number; keyterms: number } | { audioInput: number; textOutput: number };
const TRANSCRIPTION_PRICES: Record<string, Dated<SttPrice>> = {
  scribe_v2_realtime: [{ from: "2026-01-01T00:00:00Z", price: { perHour: 0.39, keyterms: 0.08 } }],
  "gemini-3.5-transcribe-live": [{ from: "2026-01-01T00:00:00Z", price: { audioInput: 3.5, textOutput: 21 } }],
};
const GEMINI_AUDIO_TOKENS_PER_SECOND = 25;
const CHARACTERS_PER_TOKEN = 4;

export function llmCost({
  modelId,
  inputTokens,
  cachedInputTokens,
  cacheWriteInputTokens = 0,
  outputTokens,
  largestPromptTokens = 0,
  at = new Date(),
}: {
  modelId: string;
  // All input, including what was read from or written to the cache.
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens?: number;
  outputTokens: number;
  // The biggest single request's input, for prices that change with prompt size.
  largestPromptTokens?: number;
  at?: Date;
}) {
  const list = TOKEN_PRICES[modelId];
  if (!list) return 0;
  const listed = priceOn(list, at);
  const price = listed.longPrompt && largestPromptTokens > listed.longPrompt.over ? listed.longPrompt : listed;
  const uncached = Math.max(0, inputTokens - cachedInputTokens - cacheWriteInputTokens);
  return round(
    (uncached * price.input +
      cachedInputTokens * price.cachedInput +
      cacheWriteInputTokens * (price.cacheWrite ?? price.input) +
      outputTokens * price.output) /
      1_000_000,
  );
}

export function embeddingCost({ modelId, inputTokens, at = new Date() }: { modelId: string; inputTokens: number; at?: Date }) {
  const list = EMBEDDING_PRICES[modelId];
  if (!list) return 0;
  return round((inputTokens / 1_000_000) * priceOn(list, at));
}

export function ttsCost({ modelId, characters, at = new Date() }: { modelId: string; characters: number; at?: Date }) {
  const list = TTS_PRICES[modelId];
  if (!list) return 0;
  return round((characters / 1000) * priceOn(list, at));
}

export function transcriptionCost({
  modelId,
  audioSeconds,
  keyterms,
  outputCharacters = 0,
  at = new Date(),
}: {
  modelId: string;
  audioSeconds: number;
  keyterms: boolean;
  // What was transcribed, for providers that bill the text they return.
  outputCharacters?: number;
  at?: Date;
}) {
  const list = TRANSCRIPTION_PRICES[modelId];
  if (!list) return 0;
  const price = priceOn(list, at);
  if ("perHour" in price) return round((audioSeconds / 3600) * (price.perHour + (keyterms ? price.keyterms : 0)));
  const audioTokens = audioSeconds * GEMINI_AUDIO_TOKENS_PER_SECOND;
  const textTokens = outputCharacters / CHARACTERS_PER_TOKEN;
  return round((audioTokens * price.audioInput + textTokens * price.textOutput) / 1_000_000);
}
