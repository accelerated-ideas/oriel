"use client";
import { MAX_QUEUED_FRAMES, MIC_SAMPLE_RATE } from "./mic-worklet";
import type { TranscriberHandlers } from "./transcriber";

// Browser side of Gemini Live transcription. The server makes a single-use
// token that locks the model and settings (`setup` here repeats them), so the
// API key never reaches the browser. Gemini's voice activity detection decides
// when the user has finished speaking: it sends interim text while they talk,
// then the final text.

export type GeminiConfig = {
  // Includes the single-use token.
  url: string;
  setup: Record<string, unknown>;
};

type ServerMessage = {
  setupComplete?: object;
  serverContent?: {
    interimInputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
  };
  error?: { message?: string; status?: string };
};

const decoder = new TextDecoder();

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Close reasons that mean Gemini has no room for us (quota, rate limits).
const BUSY = ["resource_exhausted", "quota", "rate limit", "too many", "capacity"];
const isBusy = (reason: string) => BUSY.some((sign) => reason.toLowerCase().includes(sign));

export function connectGemini(config: GeminiConfig, handlers: TranscriberHandlers) {
  const socket = new WebSocket(config.url);
  socket.binaryType = "arraybuffer";
  // Audio waits until the session is set up.
  const queue: string[] = [];
  let ready = false;
  let closedByUs = false;
  let problem: string | null = null;

  const frame = (pcm: ArrayBuffer) =>
    JSON.stringify({ realtimeInput: { audio: { data: toBase64(pcm), mimeType: `audio/pcm;rate=${MIC_SAMPLE_RATE}` } } });

  socket.onopen = () => socket.send(JSON.stringify({ setup: config.setup }));

  socket.onmessage = (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(typeof event.data === "string" ? event.data : decoder.decode(event.data as ArrayBuffer));
    } catch {
      return;
    }
    if (message.setupComplete) {
      ready = true;
      for (const queued of queue) socket.send(queued);
      queue.length = 0;
      return;
    }
    if (message.error) problem = message.error.message ?? message.error.status ?? "error";
    const content = message.serverContent;
    if (content?.inputTranscription) handlers.onCommitted(content.inputTranscription.text ?? "");
    else if (content?.interimInputTranscription) handlers.onPartial(content.interimInputTranscription.text ?? "");
  };

  socket.onclose = (event) => {
    if (closedByUs) return;
    const reason = event.reason || problem || `closed (${event.code})`;
    // A session that ends after working (Gemini's 10-minute limit, a network
    // blip) reconnects; one that never got going moves on to the next provider.
    const kind = isBusy(reason) ? "busy" : ready ? "dropped" : "broken";
    handlers.onClosed({ kind, message: reason });
  };

  return {
    send(pcm: ArrayBuffer) {
      if (ready && socket.readyState === WebSocket.OPEN) {
        socket.send(frame(pcm));
      } else if (socket.readyState <= WebSocket.OPEN) {
        queue.push(frame(pcm));
        if (queue.length > MAX_QUEUED_FRAMES) queue.shift();
      }
    },
    close() {
      closedByUs = true;
      if (ready && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      socket.close();
    },
  };
}
