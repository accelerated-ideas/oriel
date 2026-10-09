import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { summarizeConversation } from "@/lib/runtime/summarize";
import { applyInterruption } from "@/lib/voice/interruptions";
import { recordUsage } from "@/lib/usage/record";
import { GEMINI_STT_MODEL_ID, STT_MODEL_ID, STT_PROVIDERS } from "@/config/ai";
import { readWidgetSession } from "@/lib/widget/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionToken: z.string(),
  voiceSeconds: z.number().min(0).max(4 * 3600).nullish(),
  // A call ending isn't the end of the conversation; closing the widget is.
  reason: z.enum(["call_ended", "closed"]).default("call_ended"),
  // Hanging up mid-sentence: what the user heard of the last replies.
  interrupted: z
    .array(z.object({ received: z.string().max(8000), heard: z.string().max(8000) }))
    .max(12)
    .nullish(),
  // Audio sent to each speech-to-text provider during the call, and what it transcribed.
  transcription: z
    .array(
      z.object({
        provider: z.enum(STT_PROVIDERS),
        seconds: z.number().min(0).max(4 * 3600),
        characters: z.number().int().min(0).max(1_000_000).default(0),
      }),
    )
    .max(STT_PROVIDERS.length * 2)
    .nullish(),
});

export async function POST(request: NextRequest) {
  // sendBeacon posts text/plain, so parse the raw body.
  const raw = await request.text().catch(() => "");
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const session = await readWidgetSession(parsed.data.sessionToken);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  if (parsed.data.interrupted?.length) await applyInterruption(session.conversationId, parsed.data.interrupted);

  const seconds = Math.round(parsed.data.voiceSeconds ?? 0);
  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("voice_seconds, organization_id")
    .eq("id", session.conversationId)
    .single();

  await supabaseAdmin
    .from("conversations")
    .update({
      voice_seconds: (conversation?.voice_seconds ?? 0) + seconds,
      ...(parsed.data.reason === "closed" ? { status: "ended", ended_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.conversationId);

  // Speech-to-text is billed for the audio sent, per provider. A widget from
  // before the Gemini switch reports only the call time, which was all Scribe.
  if (seconds > 0 && conversation) {
    const scope = { organizationId: conversation.organization_id, agentId: session.agentId, conversationId: session.conversationId };
    const transcription = parsed.data.transcription ?? [{ provider: "scribe" as const, seconds: parsed.data.voiceSeconds ?? seconds, characters: 0 }];
    for (const used of transcription) {
      if (used.seconds <= 0) continue;
      await recordUsage(
        scope,
        used.provider === "gemini"
          ? { stage: "transcription", modelId: GEMINI_STT_MODEL_ID, audioSeconds: used.seconds, keyterms: false, outputCharacters: used.characters }
          : // The assistant's name always goes to Scribe as a keyterm.
            { stage: "transcription", modelId: STT_MODEL_ID, audioSeconds: used.seconds, keyterms: true },
      );
    }
  }

  after(() => summarizeConversation(session.conversationId));
  return NextResponse.json({ ok: true });
}
