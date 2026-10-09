// Speech-to-text for calls, from the browser straight to the provider. Gemini
// Live transcription is tried first and ElevenLabs Scribe takes over when it
// can't serve the call (see /api/widget/voice). Both report the same events.
import { connectGemini, type GeminiConfig } from "./gemini-socket";
import { connectScribe, type ScribeConfig } from "./scribe-socket";

export type SttProvider = "gemini" | "scribe";

export type TranscriberConfig = ({ provider: "gemini" } & GeminiConfig) | ({ provider: "scribe" } & ScribeConfig);

// Why a connection ended, which decides what the call does next:
//   dropped  it was working, then closed (timeout, session limit, network): reconnect
//   busy     the provider has no room for another call right now: try the next one
//   broken   it couldn't start, or refused us (credentials, settings): try the next one
export type TranscriberClose = { kind: "dropped" | "busy" | "broken"; message: string };

export type TranscriberHandlers = {
  // What the user is saying right now, the whole utterance so far.
  onPartial: (text: string) => void;
  // The finished utterance, once the provider decides the user stopped.
  onCommitted: (text: string) => void;
  // The connection ended without us closing it.
  onClosed: (close: TranscriberClose) => void;
};

export type Transcriber = {
  send(pcm: ArrayBuffer): void;
  close(): void;
};

export function connectTranscriber(config: TranscriberConfig, handlers: TranscriberHandlers): Transcriber {
  return config.provider === "gemini" ? connectGemini(config, handlers) : connectScribe(config, handlers);
}
