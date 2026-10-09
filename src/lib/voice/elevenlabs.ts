import "server-only";
import { TTS_MODEL_ID, TTS_SAMPLE_RATE } from "@/config/ai";

const API_BASE = "https://api.elevenlabs.io";
const WS_BASE = "wss://api.elevenlabs.io";
// ElevenLabs drops a speech socket after 20 seconds without input.
const KEEP_ALIVE_MS = 10_000;

export function voiceConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

// One-time token the browser uses to open its own Scribe (speech-to-text)
// WebSocket, so the API key never leaves the server.
export async function createScribeToken() {
  const response = await fetch(`${API_BASE}/v1/single-use-token/realtime_scribe`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Scribe token request failed (${response.status}): ${await response.text()}`);
  }
  return ((await response.json()) as { token: string }).token;
}

// When each character is spoken, in ms from the start of its audio chunk.
export type SpeechAlignment = { chars: string[]; starts: number[]; durations: number[] };

type SpeechHandlers = {
  onAudio: (segmentId: number, audioBase64: string, alignment: SpeechAlignment | null) => void;
  onSegmentEnd: (segmentId: number) => void;
  onError: (message: string) => void;
};

// Node's WebSocket (undici) takes headers as a non-standard init option.
type NodeWebSocketConstructor = new (url: string, init: { headers: Record<string, string> }) => WebSocket;

// Streams text into Eleven v4 Turbo and PCM audio back out.
// Text is grouped into segments (sentences). Each flush() closes a segment and
// ElevenLabs answers every flush with is_final_audio_for_turn, in order, so
// each audio chunk can be tied to the sentence it speaks.
export function openSpeechStream({ voiceId, handlers }: { voiceId: string; handlers: SpeechHandlers }) {
  const url = new URL(`${WS_BASE}/v1/text-to-dialogue/stream-input`);
  url.searchParams.set("model_id", TTS_MODEL_ID);
  url.searchParams.set("output_format", `pcm_${TTS_SAMPLE_RATE}`);
  // Character timings with each audio chunk, so the widget can show words as they're said.
  url.searchParams.set("sync_alignment", "true");

  const socket = new (WebSocket as unknown as NodeWebSocketConstructor)(url.toString(), {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
  });

  const outbox: string[] = [];
  const pending: number[] = []; // segments still waiting for audio, oldest first
  let open = false;
  let closed = false;
  let failed = false;
  let nextSegmentId = 0;
  let current: number | null = null;
  let lastSentAt = Date.now();
  let resolveClosed: () => void = () => {};
  const closedPromise = new Promise<void>((resolve) => (resolveClosed = resolve));

  const fail = (message: string) => {
    if (failed) return;
    failed = true;
    handlers.onError(message);
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  };

  const send = (message: Record<string, unknown>) => {
    if (closed || failed) return;
    const data = JSON.stringify(message);
    lastSentAt = Date.now();
    if (open) socket.send(data);
    else outbox.push(data);
  };

  const keepAlive = setInterval(() => {
    if (open && Date.now() - lastSentAt > KEEP_ALIVE_MS) send({ keep_alive: true });
  }, KEEP_ALIVE_MS / 2);

  socket.onopen = () => {
    open = true;
    socket.send(JSON.stringify({ voices: [voiceId] }));
    for (const data of outbox) socket.send(data);
    outbox.length = 0;
  };

  socket.onmessage = (event) => {
    let message: {
      audio?: string;
      alignment?: { chars?: string[]; char_start_times_ms?: number[]; char_durations_ms?: number[] } | null;
      is_final_audio_for_turn?: boolean;
      is_final?: boolean;
      error?: unknown;
      message?: unknown;
    };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.error) {
      fail(typeof message.message === "string" ? `${message.error}: ${message.message}` : String(message.error));
      return;
    }
    if (message.audio && pending.length > 0) {
      const { chars, char_start_times_ms: starts, char_durations_ms: durations } = message.alignment ?? {};
      const alignment = chars?.length && starts?.length === chars.length ? { chars, starts, durations: durations ?? [] } : null;
      handlers.onAudio(pending[0], message.audio, alignment);
    }
    if (message.is_final_audio_for_turn) {
      const segmentId = pending.shift();
      if (segmentId !== undefined) handlers.onSegmentEnd(segmentId);
    }
    if (message.is_final) socket.close();
  };

  socket.onerror = () => fail("Couldn't reach the speech service.");
  socket.onclose = () => {
    closed = true;
    clearInterval(keepAlive);
    resolveClosed();
  };

  return {
    // Adds text to the current segment and returns that segment's ID.
    write(text: string) {
      if (current === null) {
        current = nextSegmentId++;
        pending.push(current);
      }
      send({ inputs: [{ text, voice_id: voiceId }] });
      return current;
    },
    // Closes the current segment and starts generating its audio right away.
    flush() {
      if (current === null) return;
      send({ flush: true });
      current = null;
    },
    // Flushes what's left, waits for the remaining audio, then closes.
    async finish(timeoutMs = 20_000) {
      this.flush();
      if (closed || failed) return;
      if (pending.length === 0) {
        this.abort();
        return;
      }
      send({ close_socket: true });
      await Promise.race([closedPromise, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
      this.abort();
    },
    abort() {
      clearInterval(keepAlive);
      if (!closed) {
        try {
          socket.close();
        } catch {
          // Already closed.
        }
      }
    },
    get failed() {
      return failed;
    },
  };
}

export type SpeechStream = ReturnType<typeof openSpeechStream>;
