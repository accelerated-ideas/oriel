import "server-only";
import { GEMINI_STT_MODEL_ID, GEMINI_STT_SILENCE_MS } from "@/config/ai";

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const API_BASE = "https://generativelanguage.googleapis.com";
// Single-use tokens only work on the constrained Live endpoint.
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export function geminiTranscriptionConfigured() {
  return Boolean(API_KEY);
}

// A single-use token for one Gemini Live transcription session, made with the
// API key so it never reaches the browser. The token locks the model and
// settings, so it can't be used for anything else. The browser has a minute to
// connect; a session lasts up to 10 minutes, then the call reconnects.
export async function createGeminiTranscription({ locale, vocabulary }: { locale: string; vocabulary: string[] }) {
  const setup = {
    model: `models/${GEMINI_STT_MODEL_ID}`,
    generationConfig: { responseModalities: ["TEXT"] },
    // VERBATIM (the default) keeps "mhm" and "yeah", which barge-in relies on.
    inputAudioTranscription: { languageCodes: [locale], customVocabulary: vocabulary },
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: GEMINI_STT_SILENCE_MS } },
  };
  const now = Date.now();
  // The REST name for the SDK's liveConnectConstraints is bidiGenerateContentSetup.
  const response = await fetch(`${API_BASE}/v1beta/auth_tokens`, {
    method: "POST",
    headers: { "x-goog-api-key": API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 15 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: setup,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Gemini transcription token request failed (${response.status}): ${await response.text()}`);
  }
  const { name } = (await response.json()) as { name: string };
  return { url: `${WS_URL}?access_token=${encodeURIComponent(name)}`, setup };
}
