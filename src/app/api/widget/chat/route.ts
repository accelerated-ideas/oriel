import { after, NextResponse, type NextRequest } from "next/server";
import { endConversation, maybeSummarize } from "@/lib/runtime/summarize";
import { z } from "zod";
import { insertMessages } from "@/lib/runtime/history";
import { recordClientToolResults, runAgentTurn, serializeClientCalls } from "@/lib/runtime/run-turn";
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
});

// Text chat. Streams newline-delimited server-sent events of TurnEvent objects.
// When the assistant calls a browser-side tool, the stream ends with
// `client-tool-calls`; the widget runs them and posts the results back here.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const session = await readWidgetSession(parsed.data.sessionToken);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  if (!(await rateLimit(`chat:${session.conversationId}`, 20, "1 m"))) {
    return NextResponse.json({ error: "You're sending messages too quickly." }, { status: 429 });
  }

  const message = parsed.data.message?.trim();
  const toolResults = parsed.data.toolResults ?? [];
  if (!message && toolResults.length === 0) return NextResponse.json({ error: "Nothing to send" }, { status: 400 });

  if (message && !(await canAnswer(session.organizationId)).ok) {
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 402 });
  }

  if (toolResults.length > 0) await recordClientToolResults(session.conversationId, "text", toolResults);
  const pageUrl = parsed.data.page ? await recordPage(session, parsed.data.page) : session.pageUrl;
  if (message) {
    await insertMessages([
      {
        conversation_id: session.conversationId,
        role: "user",
        content: message,
        channel: "text",
        page_url: pageUrl,
      },
    ]);
  }
  await markConversationActive(session.conversationId, { used_text: true });

  const encoder = new TextEncoder();
  // Set when the assistant closes the chat (end_chat) in this turn.
  let closed = false;
  let streamDone: () => void = () => {};
  const finished = new Promise<void>((resolve) => (streamDone = resolve));
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        for await (const event of runAgentTurn({
          conversationId: session.conversationId,
          channel: "text",
          abortSignal: request.signal,
        })) {
          if (event.type === "client-tool-calls") {
            if (event.calls.some((call) => call.spec.kind === "end_chat")) closed = true;
            send({ type: "client-tool-calls", calls: serializeClientCalls(event.calls) });
          } else {
            send(event);
          }
        }
      } catch (error) {
        console.error("Chat stream failed", error);
        send({ type: "error", message: "Something went wrong" });
      } finally {
        controller.close();
        streamDone();
      }
    },
  });

  after(async () => {
    await finished;
    if (closed) await endConversation(session.conversationId);
    else await maybeSummarize(session.conversationId);
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
