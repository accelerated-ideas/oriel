"use client";
import { MAX_QUEUED_FRAMES, MIC_SAMPLE_RATE } from "./mic-worklet";
import type { TranscriberHandlers } from "./transcriber";

// Browser side of ElevenLabs Scribe realtime speech-to-text, the backup when
// Gemini can't take a call. Scribe's own voice activity detection decides when
// the user has finished a turn ("committed").

export type ScribeConfig = {
  token: string;
  modelId: string;
  languageCode: string;
  vadSilenceThresholdSecs: number;
  vadThreshold: number;
  minSpeechDurationMs: number;
  keyterms: string[];
};

// Errors that reconnecting won't fix.
const BROKEN = new Set(["auth_error", "quota_exceeded", "unaccepted_terms", "invalid_request"]);

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function connectScribe(config: ScribeConfig, handlers: TranscriberHandlers) {
  const params = new URLSearchParams({
    model_id: config.modelId,
    token: config.token,
    audio_format: `pcm_${MIC_SAMPLE_RATE}`,
    commit_strategy: "vad",
    vad_silence_threshold_secs: String(config.vadSilenceThresholdSecs),
    vad_threshold: String(config.vadThreshold),
    min_speech_duration_ms: String(config.minSpeechDurationMs),
    language_code: config.languageCode,
  });
  for (const term of config.keyterms) params.append("keyterms", term);

  const socket = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`);
  const queue: string[] = [];
  let started = false;
  let closedByUs = false;
  let problem: { type: string; message: string } | null = null;

  socket.onopen = () => {
    for (const frame of queue) socket.send(frame);
    queue.length = 0;
  };

  socket.onmessage = (event) => {
    let message: { message_type?: string; text?: string; error?: string; message?: string };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const type = message.message_type ?? "";
    if (type === "session_started") started = true;
    else if (type === "partial_transcript") handlers.onPartial(message.text ?? "");
    else if (type === "committed_transcript") handlers.onCommitted(message.text ?? "");
    // At the plan's concurrency limit Scribe answers "rate_limited" and closes:
    // every open call counts, and there's no queue.
    else if (type.includes("error") || type === "rate_limited" || BROKEN.has(type) || message.error) {
      problem = { type, message: message.error ?? message.message ?? type };
    }
  };

  socket.onclose = () => {
    if (closedByUs) return;
    const kind = problem?.type === "rate_limited" ? "busy" : BROKEN.has(problem?.type ?? "") || !started ? "broken" : "dropped";
    handlers.onClosed({ kind, message: problem?.message ?? "Speech recognition disconnected" });
  };

  return {
    send(pcm: ArrayBuffer) {
      const frame = JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: toBase64(pcm),
        commit: false,
        sample_rate: MIC_SAMPLE_RATE,
      });
      if (socket.readyState === WebSocket.OPEN) socket.send(frame);
      else if (socket.readyState === WebSocket.CONNECTING) {
        queue.push(frame);
        if (queue.length > MAX_QUEUED_FRAMES) queue.shift();
      }
    },
    close() {
      closedByUs = true;
      socket.close();
    },
  };
}
