import "server-only";
import { openSpeechStream, type SpeechAlignment } from "@/lib/voice/elevenlabs";
import { SpeechChunker, type SpeechPiece } from "@/lib/voice/speech-chunker";
import { serializeClientCalls, type TurnEvent } from "@/lib/runtime/run-turn";
import { TTS_MODEL_ID } from "@/config/ai";
import { recordUsage, type UsageScope } from "@/lib/usage/record";

// Finished sentences wait this long for more text before they're voiced
// without it (the model paused; see speech-chunker.ts).
const HOLD_MS = 400;

// Events sent to the widget during a spoken turn.
//   speech-text   text added to a segment (sent even if audio fails)
//   audio         base64 PCM16 for a segment, with when each character in it is spoken
//   segment-end   all audio for a segment has arrived
//   speech-error  no audio for the rest of this turn; show the text instead
//   already-shown the text of this turn is already in the transcript (the greeting)
// A "block" is one stored assistant message. Server-side tools split a turn into
// several blocks, which matters when the user interrupts (see interruptions.ts).
export type SpokenTurnEvent =
  | { type: "speech-text"; segment: number; block: number; text: string }
  | { type: "audio"; segment: number; audio: string; alignment?: SpeechAlignment }
  | { type: "segment-end"; segment: number }
  | { type: "speech-error" }
  | { type: "already-shown" }
  | { type: "tool-activity"; toolCallId: string; name: string; label: string }
  | { type: "client-tool-calls"; calls: ReturnType<typeof serializeClientCalls> }
  // Carry out when the voice reaches it: `at` is how many non-space characters
  // of the turn's text come before it. The assistant doesn't wait for a result.
  | {
      type: "client-effect";
      call: { toolCallId: string; kind: "highlight"; name: string; input: Record<string, unknown> };
      at: number;
    }
  | { type: "error"; message: string }
  | { type: "finish" };

export async function streamSpokenTurn({
  events,
  voiceId,
  signal,
  send,
  usage,
  alreadyShown = false,
}: {
  events: AsyncIterable<TurnEvent>;
  voiceId: string;
  signal: AbortSignal;
  send: (event: SpokenTurnEvent) => void;
  usage: UsageScope;
  alreadyShown?: boolean;
}) {
  if (alreadyShown) send({ type: "already-shown" });
  const speech = openSpeechStream({
    voiceId,
    handlers: {
      onAudio: (segment, audio, alignment) => send({ type: "audio", segment, audio, ...(alignment && { alignment }) }),
      onSegmentEnd: (segment) => send({ type: "segment-end", segment }),
      onError: (message) => {
        console.error("Speech stream failed:", message);
        send({ type: "speech-error" });
      },
    },
  });
  const chunker = new SpeechChunker();
  let block = 0;
  let blockHasText = false;
  // Billed per character sent, including any the user cut off.
  let characters = 0;
  // Non-space characters of the turn's text so far, held or sent.
  let written = 0;

  const write = (piece: SpeechPiece) => {
    characters += piece.text.trim().length;
    const segment = speech.write(piece.text);
    send({ type: "speech-text", segment, block, text: piece.text });
    if (piece.flush) speech.flush();
    blockHasText = true;
  };

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const stopHolding = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  // Voices held sentences if no more text comes for a moment.
  const releaseLater = () => {
    stopHolding();
    if (!chunker.holding()) return;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      const piece = chunker.release();
      if (piece && !signal.aborted) write(piece);
    }, HOLD_MS);
  };

  const endBlock = () => {
    stopHolding();
    const rest = chunker.end();
    if (rest) write(rest);
    speech.flush();
    if (blockHasText) block++;
    blockHasText = false;
  };

  const abort = () => speech.abort();
  signal.addEventListener("abort", abort);
  try {
    for await (const event of events) {
      if (signal.aborted) return;
      if (event.type === "text-delta") {
        written += event.text.replace(/\s/g, "").length;
        for (const piece of chunker.push(event.text)) write(piece);
        releaseLater();
      } else if (event.type === "tool-activity") {
        endBlock();
        send(event);
      } else if (event.type === "client-tool-calls") {
        endBlock();
        send({ type: "client-tool-calls", calls: serializeClientCalls(event.calls) });
      } else if (event.type === "client-effect") {
        send({
          type: "client-effect",
          call: { toolCallId: event.toolCallId, kind: "highlight", name: event.name, input: event.input },
          at: written,
        });
      } else if (event.type === "error") {
        send(event);
      }
    }
    endBlock();
    if (!signal.aborted) await speech.finish();
  } finally {
    stopHolding();
    signal.removeEventListener("abort", abort);
    speech.abort();
    if (characters > 0) await recordUsage(usage, { stage: "tts", modelId: TTS_MODEL_ID, characters });
  }
  if (!signal.aborted) send({ type: "finish" });
}

// A fixed line spoken without the model, e.g. the greeting.
export async function* sayLine(text: string): AsyncGenerator<TurnEvent> {
  yield { type: "text-delta", text };
  yield { type: "finish" };
}
