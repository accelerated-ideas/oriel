"use client";
import type { HostPage } from "../host-bridge";
import { streamEvents, type ClientToolRequest } from "../stream-chat";
import { MAX_QUEUED_FRAMES, MIC_SAMPLE_RATE, micWorkletUrl } from "./mic-worklet";
import {
  connectTranscriber,
  type SttProvider,
  type Transcriber,
  type TranscriberClose,
  type TranscriberConfig,
} from "./transcriber";
import { SpeechPlayer, type HeardBlock, type SpeechAlignment } from "./speech-player";
import { isBackchannel, isEcho, wordCount } from "./turn-taking";

// A live voice call, without any framework:
//   mic → AudioWorklet (16 kHz PCM) → speech-to-text WebSocket (Gemini, or
//   Scribe as the backup) → committed transcript
//   → /api/widget/voice/turn (the assistant's model + text-to-speech, streamed) → SpeechPlayer
// Barge-in: local voice detection ducks the assistant within ~200 ms, and the
// first real words from speech-to-text stop it.

export type CallStatus = "idle" | "starting" | "blocked" | "listening" | "thinking" | "speaking" | "error";

type VoiceTurnEvent =
  | { type: "speech-text"; segment: number; block: number; text: string }
  | { type: "audio"; segment: number; audio: string; alignment?: SpeechAlignment }
  | { type: "segment-end"; segment: number }
  | { type: "speech-error" }
  | { type: "already-shown" }
  | { type: "tool-activity"; toolCallId: string; name: string; label: string }
  | { type: "client-tool-calls"; calls: ClientToolRequest[] }
  | { type: "client-effect"; call: ClientToolRequest; at?: number }
  | { type: "error"; message: string }
  | { type: "finish" };

type TurnPayload = {
  message?: string;
  page?: HostPage;
  toolResults?: { toolCallId: string; output: unknown }[];
  start?: { resume: { toolCallId: string } | null };
};

export type VoiceCallCallbacks = {
  onStatus: (status: CallStatus, error?: string) => void;
  // What the user is saying right now (live transcript), "" when they stop.
  onPartial: (text: string) => void;
  onUserText: (text: string) => void;
  // Upserts the assistant message for a block; null removes it.
  onAssistantText: (key: string, text: string | null) => void;
  onActivity: (label: string) => void;
  runClientTool: (call: ClientToolRequest) => Promise<{ ok: boolean; output: string }>;
  // The page as it is right now, sent with what the user says.
  currentPage?: () => Promise<HostPage | null>;
  // `failed`: the call ended with an error, which stays on screen.
  onEnded: (summary: {
    seconds: number;
    interrupted: HeardBlock[] | null;
    transcription: TranscriptionUsage[];
    failed?: boolean;
  }) => void;
};

// Audio sent to each speech-to-text provider and what it transcribed, for billing.
export type TranscriptionUsage = { provider: SttProvider; seconds: number; characters: number };

// Barge-in tuning (frames are 40 ms).
const DUCK_AFTER_FRAMES = 6;
const UNDUCK_AFTER_QUIET_FRAMES = 20;
const MIN_VOICE_RMS = 0.02;
const MIN_VOICE_RMS_WHILE_SPEAKING = 0.05;
// Someone is talking close to the mic: this many frames above the threshold.
const NEARBY_VOICE_FRAMES = 3;
// Recognized words lag the audio; words this soon after a nearby voice are theirs.
const NEARBY_VOICE_WINDOW_MS = 1500;
// Longest wait for the assistant to finish a sentence before running a browser tool.
const SPEECH_DRAIN_TIMEOUT_MS = 15_000;
// A dropped speech-to-text connection is retried after these waits; after the
// last, or when a provider can't start or has no room, the call moves on to
// the next provider. A connection that holds this long starts the count over.
const STT_RETRY_DELAYS_MS = [0, 500, 1500, 3000];
const STT_STABLE_MS = 30_000;
const NO_TRANSCRIBER = "no_transcriber";

function hasUnheard(blocks: HeardBlock[]) {
  return blocks.some((block) => block.heard !== block.received);
}

export class VoiceCall {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private micNode: AudioWorkletNode | null = null;
  private transcriber: Transcriber | null = null;
  private sttProvider: SttProvider | null = null;
  // Providers that failed this call, and whether one was full.
  private sttAvoid = new Set<SttProvider>();
  private sttWasBusy = false;
  private sttRetries = 0;
  private sttOpenedAt = 0;
  // Mic audio from while no speech-to-text connection was open, for the next one.
  private pendingAudio: ArrayBuffer[] = [];
  private sttUsage: Record<SttProvider, { seconds: number; characters: number }> = {
    gemini: { seconds: 0, characters: 0 },
    scribe: { seconds: 0, characters: 0 },
  };
  private player: SpeechPlayer | null = null;
  private status: CallStatus = "idle";
  private ended = false;
  private startedAt = 0;
  private muted = false;
  private turnSeq = 0;
  private turn: { id: number; controller: AbortController } | null = null;
  // Turns whose text is already in the transcript (the greeting), by key prefix.
  private hiddenTurns = new Set<string>();
  private pendingReport: HeardBlock[] = [];
  // A reply was cut off before it finished streaming; the server may have
  // saved words the user never heard, so the next turn must report.
  private reportNeeded = false;
  private queuedReply: string | null = null;
  private gestureResolve: (() => void) | null = null;
  // Voice detection state.
  private noiseFloor = 0.01;
  private lastNearbyVoiceAt = 0;
  private voiceFrames = 0;
  private quietFrames = 0;
  private ducked = false;
  private micLevel = 0;

  // `showOpening`: the greeting isn't on screen yet (a new conversation), so
  // the opening line's words appear as it's said instead of being hidden.
  constructor(
    private sessionToken: string,
    private callbacks: VoiceCallCallbacks,
    private showOpening = false,
  ) {}

  // Call from a click handler: browsers only allow audio to start from a user gesture.
  // `resume` continues a call after a full page load: with the assistant's
  // navigate call when it moved the page, or without one when the visitor did
  // (then the assistant has nothing to say and just listens).
  async start(resume: { toolCallId: string | null } | null = null) {
    this.setStatus("starting");
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    const resumed = ctx.resume().catch(() => {});
    window.addEventListener("pagehide", this.onPageHide);

    try {
      const [config, stream] = await Promise.all([
        this.requestTranscriber(),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        }),
        ctx.audioWorklet.addModule(micWorkletUrl()),
      ]);
      this.stream = stream;
      if (this.ended) return this.release();

      this.player = new SpeechPlayer(ctx, {
        onBlockText: (key, text) => this.showAssistantText(key, text),
        onAudibleChange: (audible) => this.onAudibleChange(audible),
      });

      const micNode = new AudioWorkletNode(ctx, "mic-processor");
      micNode.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => this.onMicFrame(event.data);
      // The worklet only runs while connected to the graph; route it through silence.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(micNode);
      micNode.connect(sink).connect(ctx.destination);
      this.micNode = micNode;

      this.openTranscriber(config);

      // After a full page load there's no click to start audio with; ask for one.
      await Promise.race([resumed, new Promise((resolve) => setTimeout(resolve, 400))]);
      if (ctx.state !== "running") {
        this.setStatus("blocked");
        await new Promise<void>((resolve) => (this.gestureResolve = resolve));
        if (this.ended) return;
      }

      this.startedAt = Date.now();
      this.updateStatus();
      if (resume && !resume.toolCallId) return;
      await this.runTurn({ start: { resume: resume?.toolCallId ? { toolCallId: resume.toolCallId } : null } });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.fail(
        /NotAllowed|Permission|denied/i.test(message)
          ? "Microphone access is blocked. Allow it in your browser's address bar, or type instead."
          : /NotFound|DevicesNotFound/i.test(message)
            ? "No microphone found. Plug one in, or type instead."
            : "Couldn't start the call. Try again.",
      );
    }
  }

  // The panel was opened from the launcher: if audio was blocked, that click lets it start.
  continueIfBlocked() {
    if (this.status === "blocked") this.continueAfterGesture();
  }

  // Called from a click when audio was blocked (see start()).
  continueAfterGesture() {
    void this.ctx?.resume().then(() => {
      this.gestureResolve?.();
      this.gestureResolve = null;
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.callbacks.onPartial("");
  }

  // The assistant's voice in frequency bands while it's talking, else null.
  voiceBands(count: number) {
    return this.player?.isAudible() ? this.player.bands(count) : null;
  }

  level() {
    if (!this.player) return 0;
    return this.status === "speaking" ? this.player.level() * 3 : this.muted ? 0 : Math.min(1, this.micLevel * 9);
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    if (this.turn) this.reportNeeded = true;
    this.turn?.controller.abort();
    this.turn = null;
    const stopped = this.player?.stop() ?? [];
    this.markCutOff(stopped);
    const report = [...this.pendingReport, ...stopped];
    const needed = this.reportNeeded || hasUnheard(report);
    this.pendingReport = [];
    const seconds = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    this.release();
    this.setStatus("idle");
    this.callbacks.onEnded({
      seconds,
      interrupted: needed && report.length > 0 ? report : null,
      transcription: this.takeTranscriptionUsage(),
    });
  }

  // ---------- turns ----------

  private async runTurn(payload: TurnPayload) {
    if (this.ended || !this.player) return;
    const player = this.player;
    this.turn?.controller.abort();
    const id = ++this.turnSeq;
    const controller = new AbortController();
    this.turn = { id, controller };
    this.updateStatus();
    const isCurrent = () => !this.ended && this.turn?.id === id;
    if (payload.message && this.callbacks.currentPage) {
      const page = await this.callbacks.currentPage();
      if (!isCurrent()) return;
      if (page) payload = { ...payload, page };
    }

    const interrupted = this.reportNeeded || hasUnheard(this.pendingReport) ? this.pendingReport : null;
    this.pendingReport = [];
    this.reportNeeded = false;
    const prefix = `${id}:`;
    const afterSpeech: ClientToolRequest[] = [];
    const results: Promise<{ toolCallId: string; output: unknown }>[] = [];

    try {
      const events = streamEvents<VoiceTurnEvent>(
        "/api/widget/voice/turn",
        { sessionToken: this.sessionToken, ...payload, interrupted },
        controller.signal,
      );
      for await (const event of events) {
        if (!isCurrent()) return;
        switch (event.type) {
          case "speech-text":
            player.addText(`${prefix}${event.segment}`, `${prefix}b${event.block}`, event.text);
            break;
          case "audio":
            player.addAudio(`${prefix}${event.segment}`, event.audio, event.alignment);
            break;
          case "segment-end":
            player.endSegment(`${prefix}${event.segment}`);
            break;
          case "speech-error":
            player.showSilently(prefix);
            break;
          case "already-shown":
            if (this.showOpening) this.showOpening = false;
            else this.hiddenTurns.add(prefix);
            break;
          case "tool-activity":
            this.callbacks.onActivity(event.label);
            break;
          case "client-tool-calls":
            for (const call of event.calls) {
              // Pointing at things and in-page actions happen while it talks;
              // leaving the page or hanging up waits until it's done talking.
              if (call.kind === "navigate" || call.kind === "end_call") afterSpeech.push(call);
              else results.push(this.runTool(call));
            }
            break;
          case "client-effect":
            // Point at it when the voice gets there, not when the text arrives.
            player.cue(
              prefix,
              () => {
                if (!this.ended) void this.callbacks.runClientTool(event.call);
              },
              event.at,
            );
            break;
          case "error":
            this.callbacks.onActivity(event.message || "Something went wrong.");
            break;
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError" || !isCurrent()) return;
      this.callbacks.onActivity("Connection lost. Say that again?");
    }
    if (!isCurrent()) return;
    player.finishTurn(prefix);
    this.turn = null;
    this.updateStatus();

    if (afterSpeech.length > 0) {
      await Promise.race([player.whenIdle(), new Promise((resolve) => setTimeout(resolve, SPEECH_DRAIN_TIMEOUT_MS))]);
      if (this.ended || this.turnSeq !== id) return;
      for (const call of afterSpeech) {
        if (call.kind === "end_call") {
          this.end();
          return;
        }
        results.push(this.runTool(call));
      }
    }
    if (results.length === 0) return;
    const toolResults = await Promise.all(results);
    if (this.ended || this.turnSeq !== id) return;
    await this.runTurn({ toolResults });
  }

  private async runTool(call: ClientToolRequest) {
    const result = await this.callbacks.runClientTool(call);
    return { toolCallId: call.toolCallId, output: result.output };
  }

  // Stops the assistant mid-sentence and remembers what the user actually heard.
  private interrupt() {
    if (!this.player) return;
    if (this.turn) this.reportNeeded = true;
    this.turn?.controller.abort();
    this.turn = null;
    // Also cancels anything waiting to continue the old turn (e.g. tool results).
    this.turnSeq++;
    const report = this.player.stop();
    this.markCutOff(report);
    this.pendingReport.push(...report);
    this.ducked = false;
    this.updateStatus();
  }

  // Shows replies cut short the way they're stored: what was heard, then "—".
  private markCutOff(blocks: HeardBlock[]) {
    for (const block of blocks) {
      if (block.heard === block.received) continue;
      this.showAssistantText(block.key, block.heard ? `${block.heard}—` : null);
    }
  }

  private showAssistantText(key: string, text: string | null) {
    if (this.hiddenTurns.has(key.slice(0, key.indexOf(":") + 1))) return;
    this.callbacks.onAssistantText(key, text);
  }

  // ---------- listening ----------

  private onMicFrame({ pcm, rms }: { pcm: ArrayBuffer; rms: number }) {
    if (this.ended) return;
    this.micLevel = rms;
    this.sendAudio(this.muted ? new ArrayBuffer(pcm.byteLength) : pcm);
    if (this.muted || !this.player) return;

    const speaking = this.player.isAudible();
    if (rms < this.noiseFloor * 2) this.noiseFloor = Math.min(0.05, Math.max(0.002, this.noiseFloor * 0.98 + rms * 0.02));
    const threshold = Math.max(speaking ? MIN_VOICE_RMS_WHILE_SPEAKING : MIN_VOICE_RMS, this.noiseFloor * 3.5);
    if (rms > threshold) {
      this.voiceFrames++;
      this.quietFrames = 0;
      if (this.voiceFrames >= NEARBY_VOICE_FRAMES) this.lastNearbyVoiceAt = Date.now();
    } else {
      this.quietFrames++;
      if (this.quietFrames > 3) this.voiceFrames = 0;
    }

    if (speaking && !this.ducked && this.voiceFrames >= DUCK_AFTER_FRAMES) {
      this.ducked = true;
      this.player.duck(true);
    } else if (this.ducked && this.quietFrames >= UNDUCK_AFTER_QUIET_FRAMES) {
      this.ducked = false;
      this.player.duck(false);
    }
  }

  private onPartial(text: string) {
    if (this.ended || this.muted || !this.player) return;
    // Words alone can be a TV or a colleague across the room. They only show,
    // and only stop the assistant, while the mic also hears someone close by;
    // anything else waits for the finished sentence (onCommitted).
    const nearby = Date.now() - this.lastNearbyVoiceAt < NEARBY_VOICE_WINDOW_MS;
    if (!nearby && text.trim()) return;
    this.callbacks.onPartial(text);
    if (wordCount(text) === 0) return;
    const ownVoice = isEcho(text, this.player.recentText());
    if (ownVoice || isBackchannel(text)) return;
    // Talking over the assistant, or still talking while it was about to answer.
    if (this.player.isAudible() || this.turn) this.interrupt();
  }

  private onCommitted(text: string) {
    if (this.ended || !this.player) return;
    this.callbacks.onPartial("");
    const clean = text.trim();
    if (!clean || this.muted) return;

    // Our own voice is only plausible while speaking or just after; a real reply
    // can't be spoken and recognized that fast.
    const recentlySpeaking = this.player.isAudible() || Date.now() - this.player.lastAudibleAt < 700;
    if (recentlySpeaking && isEcho(clean, this.player.recentText())) return;
    if (this.player.isAudible()) {
      // "Mhm" while it talks isn't a turn; but "yes" to a question it just asked is.
      if (isBackchannel(clean)) {
        this.queuedReply = clean;
        return;
      }
      this.interrupt();
    }
    this.queuedReply = null;
    if (this.turn) this.interrupt();
    this.callbacks.onUserText(clean);
    void this.runTurn({ message: clean });
  }

  private onAudibleChange(audible: boolean) {
    if (!audible && this.queuedReply && this.player) {
      const reply = this.queuedReply;
      this.queuedReply = null;
      if (this.player.endedWithQuestion() && !this.turn) {
        this.callbacks.onUserText(reply);
        void this.runTurn({ message: reply });
        return;
      }
    }
    if (!audible && this.ducked) {
      this.ducked = false;
      this.player?.duck(false);
    }
    this.updateStatus();
  }

  // ---------- plumbing ----------

  // ---------- speech-to-text ----------

  private sendAudio(pcm: ArrayBuffer) {
    if (this.transcriber && this.sttProvider) {
      this.transcriber.send(pcm);
      this.sttUsage[this.sttProvider].seconds += pcm.byteLength / 2 / MIC_SAMPLE_RATE;
      return;
    }
    this.pendingAudio.push(pcm);
    if (this.pendingAudio.length > MAX_QUEUED_FRAMES) this.pendingAudio.shift();
  }

  // The server picks the provider: the first that's set up and hasn't failed this call.
  private async requestTranscriber(): Promise<TranscriberConfig> {
    const response = await fetch("/api/widget/voice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionToken: this.sessionToken, avoid: [...this.sttAvoid] }),
    });
    const data = (await response.json().catch(() => null)) as {
      transcriber?: TranscriberConfig;
      error?: string;
      code?: string;
    } | null;
    if (data?.code === NO_TRANSCRIBER) throw new Error(NO_TRANSCRIBER);
    if (!response.ok || !data?.transcriber) throw new Error(data?.error ?? "Couldn't start the call.");
    return data.transcriber;
  }

  private openTranscriber(config: TranscriberConfig) {
    const transcriber: Transcriber = connectTranscriber(config, {
      onPartial: (text) => {
        if (this.transcriber === transcriber) this.onPartial(text);
      },
      onCommitted: (text) => {
        if (this.transcriber !== transcriber) return;
        this.sttUsage[config.provider].characters += text.length;
        this.onCommitted(text);
      },
      onClosed: (close) => {
        if (this.transcriber !== transcriber) return;
        this.transcriber = null;
        if (!this.ended) void this.reconnectTranscriber(config.provider, close);
      },
    });
    this.transcriber = transcriber;
    this.sttProvider = config.provider;
    this.sttOpenedAt = Date.now();
    // What the mic heard while there was no connection.
    for (const pcm of this.pendingAudio.splice(0)) this.sendAudio(pcm);
  }

  private async reconnectTranscriber(provider: SttProvider, close: TranscriberClose) {
    if (Date.now() - this.sttOpenedAt > STT_STABLE_MS) this.sttRetries = 0;
    if (close.kind === "dropped" && this.sttRetries < STT_RETRY_DELAYS_MS.length) {
      // Sessions time out (Gemini's last 10 minutes) or drop: reconnect, waiting longer each time.
      await new Promise((resolve) => setTimeout(resolve, STT_RETRY_DELAYS_MS[this.sttRetries++]));
    } else {
      // It couldn't start, has no room, or keeps dropping: move on to the next provider.
      console.warn(`Speech recognition (${provider}) ${close.kind}: ${close.message}`);
      this.sttAvoid.add(provider);
      if (close.kind === "busy") this.sttWasBusy = true;
      this.sttRetries = 0;
    }
    if (this.ended) return;
    try {
      const config = await this.requestTranscriber();
      if (!this.ended) this.openTranscriber(config);
    } catch (error) {
      if (error instanceof Error && error.message === NO_TRANSCRIBER) {
        this.fail(
          this.sttWasBusy
            ? "Calls are busy right now. Try again in a minute, or keep going by typing."
            : "Speech recognition isn't available right now. You can keep going by typing.",
        );
      } else {
        this.fail("The call dropped. You can start it again or keep going by typing.");
      }
    }
  }

  // What each provider was sent and transcribed since the last report; starts over.
  private takeTranscriptionUsage(): TranscriptionUsage[] {
    const usage = (Object.keys(this.sttUsage) as SttProvider[])
      .filter((provider) => this.sttUsage[provider].seconds > 0)
      .map((provider) => ({
        provider,
        seconds: Math.round(this.sttUsage[provider].seconds * 10) / 10,
        characters: this.sttUsage[provider].characters,
      }));
    for (const provider of Object.keys(this.sttUsage) as SttProvider[]) this.sttUsage[provider] = { seconds: 0, characters: 0 };
    return usage;
  }

  private onPageHide = () => {
    // The page is going away (e.g. the assistant opened another page): record the call time.
    if (this.ended || !this.startedAt) return;
    navigator.sendBeacon(
      "/api/widget/end",
      JSON.stringify({
        sessionToken: this.sessionToken,
        voiceSeconds: (Date.now() - this.startedAt) / 1000,
        transcription: this.takeTranscriptionUsage(),
      }),
    );
    this.startedAt = 0;
  };

  private updateStatus() {
    // Before the call is connected the status is "starting" or "blocked".
    if (this.ended || !this.player || !this.startedAt) return;
    this.setStatus(this.player.isAudible() ? "speaking" : this.turn ? "thinking" : "listening");
  }

  private setStatus(status: CallStatus, error?: string) {
    this.status = status;
    this.callbacks.onStatus(status, error);
  }

  private fail(message: string) {
    if (this.ended) return;
    this.ended = true;
    this.turn?.controller.abort();
    const seconds = this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
    this.player?.stop();
    this.release();
    this.setStatus("error", message);
    if (seconds > 0) {
      this.callbacks.onEnded({ seconds, interrupted: null, transcription: this.takeTranscriptionUsage(), failed: true });
    }
  }

  private release() {
    window.removeEventListener("pagehide", this.onPageHide);
    this.transcriber?.close();
    this.transcriber = null;
    this.pendingAudio = [];
    this.micNode?.port.close();
    this.micNode?.disconnect();
    this.micNode = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.player?.dispose();
    this.player = null;
    this.gestureResolve?.();
    this.gestureResolve = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
