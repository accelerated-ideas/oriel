import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { insertMessages } from "@/lib/runtime/history";
import { recordClientToolResults, runAgentTurn, type TurnEvent } from "@/lib/runtime/run-turn";
import { maybeSummarize } from "@/lib/runtime/summarize";
import { applyInterruption, INTERRUPTED_MARK } from "@/lib/voice/interruptions";
import { voiceConfigured } from "@/lib/voice/elevenlabs";
import { sayLine, streamSpokenTurn, type SpokenTurnEvent } from "@/lib/voice/spoken-turn";
import { canAnswer, UNAVAILABLE_MESSAGE } from "@/lib/billing/limits";
import { rateLimit } from "@/lib/rate-limit";
import { pageSchema, recordPage } from "@/lib/widget/page";
import { markConversationActive, readWidgetSession } from "@/lib/widget/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  sessionToken: z.string(),
  message: z.string().max(4000).nullish(),
  // The page as it is right now, sent with each message (the page sync can
  // lag behind a click, and a single-page app renders after its URL changes).
  page: pageSchema.nullish(),
  toolResults: z
    .array(z.object({ toolCallId: z.string().max(200), output: z.unknown() }))
    .max(10)
    .nullish(),
  // The call just connected. `resume` is set when it continues after the
  // assistant moved the user to a new page (a full page load).
  start: z
    .object({
      resume: z.object({ toolCallId: z.string().max(200), outcome: z.string().max(500).nullish() }).nullish(),
    })
    .nullish(),
  // What the user heard of the assistant's last messages before cutting in.
  interrupted: z
    .array(z.object({ received: z.string().max(8000), heard: z.string().max(8000) }))
    .max(12)
    .nullish(),
});

// One spoken turn: runs the assistant and streams its reply as audio (Eleven
// v4 Turbo) plus the text of each sentence, as server-sent events.
export async function POST(request: NextRequest) {
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "Voice isn't configured on this server." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const session = await readWidgetSession(body.sessionToken);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });
  const conversationId = session.conversationId;

  if (!(await rateLimit(`voice-turn:${conversationId}`, 40, "1 m"))) {
    return NextResponse.json({ error: "You're talking faster than I can keep up." }, { status: 429 });
  }

  const [{ data: agent }] = await Promise.all([
    supabaseAdmin.from("agents").select("voice_id, greeting, organization_id").eq("id", session.agentId).single(),
    body.interrupted?.length ? applyInterruption(conversationId, body.interrupted) : null,
  ]);
  if (!agent) return NextResponse.json({ error: "Assistant not found" }, { status: 404 });

  const message = body.message?.trim();
  const toolResults = body.toolResults ?? [];
  if (message && !(await canAnswer(session.organizationId)).ok) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 402 });
  }
  if (toolResults.length > 0) await recordClientToolResults(conversationId, "voice", toolResults);
  const pageUrl = body.page ? await recordPage(session, body.page) : session.pageUrl;
  if (message) {
    await insertMessages([
      {
        conversation_id: conversationId,
        role: "user",
        content: message,
        channel: "voice",
        page_url: pageUrl,
      },
    ]);
  }
  await markConversationActive(conversationId, { used_voice: true });

  // The reply's model calls and its speech share one turn, for cost tracking.
  const turnId = crypto.randomUUID();
  let events: AsyncIterable<TurnEvent>;
  let alreadyShown = false;
  if (body.start) {
    const opening = await openingLine(conversationId, agent.greeting, body.start.resume ?? null, request.signal, turnId);
    // Nothing to say: the call just starts listening.
    if (!opening) return new Response(`data: ${JSON.stringify({ type: "finish" })}\n\n`, { headers: SSE_HEADERS });
    events = opening.events;
    alreadyShown = opening.alreadyShown;
  } else if (message || toolResults.length > 0) {
    events = runAgentTurn({ conversationId, channel: "voice", abortSignal: request.signal, turnId });
  } else {
    return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SpokenTurnEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The widget already hung up.
        }
      };
      try {
        await streamSpokenTurn({
          events,
          voiceId: agent.voice_id,
          signal: request.signal,
          send,
          alreadyShown,
          usage: { organizationId: agent.organization_id, agentId: session.agentId, conversationId, turnId },
        });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("Voice turn failed", error);
          send({ type: "error", message: "Something went wrong" });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  after(() => maybeSummarize(conversationId));

  return new Response(stream, { headers: SSE_HEADERS });
}

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

const BACK_LINE = "I'm here. What else can I help with?";
const ARRIVED_LINE = "Okay, we're there. What's next?";

// Whether a message is one of the lines a call opens with, even if the
// visitor cut it off ("Hey! I can answer qu—").
function isOpeningLine(content: string, greeting: string) {
  const text = content.trim();
  const cut = text.endsWith(INTERRUPTED_MARK) ? text.slice(0, -INTERRUPTED_MARK.length).trim() : null;
  return [greeting, BACK_LINE, ARRIVED_LINE].some((line) => {
    const full = line.trim();
    return Boolean(full) && (text === full || (cut !== null && cut.length > 0 && full.startsWith(cut)));
  });
}

// What the assistant says when a call connects.
async function openingLine(
  conversationId: string,
  greeting: string,
  resume: { toolCallId: string; outcome?: string | null } | null,
  signal: AbortSignal,
  turnId: string,
): Promise<{ events: AsyncIterable<TurnEvent>; alreadyShown: boolean } | null> {
  if (resume) {
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("page_title, page_url")
      .eq("id", conversationId)
      .single();
    const outcome =
      resume.outcome ||
      `Done, you moved them to ${conversation?.page_title || "the page"} (${conversation?.page_url ?? "unknown URL"}).`;
    const recorded = await recordClientToolResults(conversationId, "voice", [
      { toolCallId: resume.toolCallId, output: outcome },
    ]);
    if (recorded > 0) {
      return {
        events: runAgentTurn({ conversationId, channel: "voice", speakOnly: true, abortSignal: signal, turnId }),
        alreadyShown: false,
      };
    }
  }

  const [{ count: userMessages }, { data: last }, { data: conversation }] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("role", "user"),
    supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .is("tool_call_id", null)
      .neq("content", "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from("conversations").select("voice_seconds").eq("id", conversationId).single(),
  ]);

  if (!resume) {
    // A new conversation already starts with the greeting (stored when the
    // session opened); its first call says it out loud.
    const firstCall = !userMessages && !conversation?.voice_seconds;
    if (firstCall) return { events: sayLine(greeting), alreadyShown: true };
    // The visitor hasn't answered the last greeting yet: don't ask again.
    if (last?.role === "assistant" && isOpeningLine(last.content, greeting)) return null;
    if (!userMessages) return null;
  }

  const line = resume ? ARRIVED_LINE : BACK_LINE;
  await insertMessages([{ conversation_id: conversationId, role: "assistant", content: line, channel: "voice" }]);
  return { events: sayLine(line), alreadyShown: false };
}
