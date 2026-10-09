import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  STT_MIN_SPEECH_MS,
  STT_MODEL_ID,
  STT_PROVIDERS,
  STT_VAD_SILENCE_SECS,
  STT_VAD_THRESHOLD,
  type SttProvider,
} from "@/config/ai";
import { LANGUAGE_OPTIONS } from "@/config/voices";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createScribeToken, voiceConfigured } from "@/lib/voice/elevenlabs";
import { createGeminiTranscription, geminiTranscriptionConfigured } from "@/lib/voice/gemini-transcribe";
import { canAnswer, UNAVAILABLE_MESSAGE } from "@/lib/billing/limits";
import { rateLimit } from "@/lib/rate-limit";
import { markConversationActive, readWidgetSession } from "@/lib/widget/session";
import type { TranscriberConfig } from "@/components/widget/voice/transcriber";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionToken: z.string(),
  // Providers that already failed during this call, so it moves on to the next.
  avoid: z.array(z.enum(STT_PROVIDERS)).max(STT_PROVIDERS.length).default([]),
});

// Starts (or reconnects) a call: returns what the browser needs to open its
// speech-to-text socket, from the first provider in STT_PROVIDERS that's set up
// and hasn't failed this call. The assistant's side runs through /api/widget/voice/turn.
export async function POST(request: NextRequest) {
  // The assistant's voice is ElevenLabs either way.
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "Voice isn't configured on this server." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const session = await readWidgetSession(parsed.data.sessionToken);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  if (!(await rateLimit(`voice:${session.conversationId}`, 12, "1 m"))) {
    return NextResponse.json({ error: "Too many call attempts. Try again in a minute." }, { status: 429 });
  }
  if (!(await canAnswer(session.organizationId)).ok) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 402 });
  }

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("language, assistant_name, site_name")
    .eq("id", session.agentId)
    .single();
  const language = agent?.language ?? "en";
  // Names the recognizer should expect.
  const names = [agent?.assistant_name, agent?.site_name].filter((term): term is string => Boolean(term?.trim()));

  const available: Record<SttProvider, boolean> = { gemini: geminiTranscriptionConfigured(), scribe: true };
  const providers = STT_PROVIDERS.filter((provider) => available[provider] && !parsed.data.avoid.includes(provider));

  let transcriber: TranscriberConfig | null = null;
  for (const provider of providers) {
    try {
      transcriber =
        provider === "gemini"
          ? {
              provider,
              ...(await createGeminiTranscription({
                locale: LANGUAGE_OPTIONS.find((option) => option.code === language)?.locale ?? "en-US",
                vocabulary: names,
              })),
            }
          : {
              provider,
              token: await createScribeToken(),
              modelId: STT_MODEL_ID,
              languageCode: language,
              vadSilenceThresholdSecs: STT_VAD_SILENCE_SECS,
              vadThreshold: STT_VAD_THRESHOLD,
              minSpeechDurationMs: STT_MIN_SPEECH_MS,
              // Scribe caps keyterms at 20 characters.
              keyterms: names.filter((name) => name.length <= 20),
            };
      break;
    } catch (error) {
      console.error(`Couldn't start ${provider} transcription`, error);
    }
  }
  if (!transcriber) {
    // Everything was tried: tell the widget so it can say calls are unavailable.
    return NextResponse.json({ error: "Speech recognition isn't available right now.", code: "no_transcriber" }, { status: 503 });
  }

  await markConversationActive(session.conversationId, { used_voice: true });
  return NextResponse.json({ transcriber });
}
