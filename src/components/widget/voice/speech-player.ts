"use client";

// Plays the assistant's streamed speech (PCM16, 24 kHz) without gaps and
// reveals its text character by character as it's spoken, using the timings
// ElevenLabs sends with each audio chunk. What has been revealed is also what
// gets reported as heard when the user interrupts.

const SAMPLE_RATE = 24_000;
// Buffer before the first chunk so a late second chunk doesn't cause a gap.
const START_LEAD_SECS = 0.12;
// Rough speaking rate, used to estimate a sentence's length before all its audio has arrived.
const CHARS_PER_SEC = 15;
const MAX_TRACKED_BLOCKS = 8;

type Segment = {
  key: string;
  block: Block;
  text: string;
  chunks: { start: number; duration: number }[];
  // When each non-space character of the text is spoken, in AudioContext time.
  charTimes: number[];
  // Non-space characters revealed so far. Only grows.
  revealed: number;
  ended: boolean;
  // No audio will come (speech failed); the text is shown as-is.
  silent: boolean;
};

type Block = { key: string; segments: Segment[]; shown: string };

// Something to do once the voice has said a turn's first `after` characters.
type Cue = { turnPrefix: string; after: number; run: () => void };

export type HeardBlock = { key: string; received: string; heard: string };

// Character timings for one audio chunk, in ms from the chunk's start.
export type SpeechAlignment = { chars: string[]; starts: number[]; durations: number[] };

type Callbacks = {
  // The text of a block that has been spoken so far (as it becomes audible).
  onBlockText: (blockKey: string, text: string) => void;
  onAudibleChange: (audible: boolean) => void;
};

function decodePcm(base64: string) {
  const binary = atob(base64);
  const samples = new Float32Array(binary.length >> 1);
  for (let i = 0; i < samples.length; i++) {
    let value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    if (value >= 0x8000) value -= 0x10000;
    samples[i] = value / 0x8000;
  }
  return samples;
}

const isSpace = (char: string) => /\s/.test(char);

function countVisible(text: string) {
  let count = 0;
  for (const char of text) if (!isSpace(char)) count++;
  return count;
}

// The text up to and including its nth non-space character.
function prefixOf(text: string, visible: number) {
  if (visible <= 0) return "";
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (!isSpace(text[i]) && ++seen === visible) return text.slice(0, i + 1);
  }
  return text;
}

export class SpeechPlayer {
  private gain: GainNode;
  private analyser: AnalyserNode;
  private levelBuffer: Float32Array<ArrayBuffer>;
  private frequencyBuffer: Uint8Array<ArrayBuffer>;
  private sources = new Set<AudioBufferSourceNode>();
  private segments = new Map<string, Segment>();
  private blocks: Block[] = [];
  private frame: number | null = null;
  private idleWaiters: (() => void)[] = [];
  private cues: Cue[] = [];
  private cueTimer: ReturnType<typeof setInterval> | null = null;
  private playHead = 0;
  private audible = false;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  lastAudibleAt = 0;

  constructor(
    private ctx: AudioContext,
    private callbacks: Callbacks,
  ) {
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuffer = new Float32Array(this.analyser.fftSize);
    this.frequencyBuffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.gain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  addText(segmentKey: string, blockKey: string, text: string) {
    let segment = this.segments.get(segmentKey);
    if (!segment) {
      let block = this.blocks.find((candidate) => candidate.key === blockKey);
      if (!block) {
        block = { key: blockKey, segments: [], shown: "" };
        this.blocks.push(block);
        if (this.blocks.length > MAX_TRACKED_BLOCKS) this.blocks.shift();
      }
      segment = { key: segmentKey, block, text: "", chunks: [], charTimes: [], revealed: 0, ended: false, silent: false };
      block.segments.push(segment);
      this.segments.set(segmentKey, segment);
    }
    segment.text += text;
    this.refresh();
  }

  addAudio(segmentKey: string, base64: string, alignment?: SpeechAlignment) {
    const segment = this.segments.get(segmentKey);
    if (!segment || segment.silent) return;
    const samples = decodePcm(base64);
    if (samples.length === 0) return;

    const buffer = this.ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);

    const now = this.ctx.currentTime;
    const start = this.playHead > now ? this.playHead : now + START_LEAD_SECS;
    source.start(start);
    this.playHead = start + buffer.duration;
    segment.chunks.push({ start, duration: buffer.duration });
    if (alignment) this.addTimings(segment, alignment, start, buffer.duration);

    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.checkIdle();
    };
    this.setAudible(true);
    this.refresh();
  }

  endSegment(segmentKey: string) {
    const segment = this.segments.get(segmentKey);
    if (!segment) return;
    segment.ended = true;
    this.checkIdle();
    this.refresh();
  }

  // Speech failed for this turn: show the text that has no audio as-is.
  showSilently(turnPrefix: string) {
    for (const segment of this.segments.values()) {
      if (!segment.key.startsWith(turnPrefix)) continue;
      segment.ended = true;
      if (segment.chunks.length > 0) continue;
      segment.silent = true;
    }
    this.checkIdle();
    this.refresh();
  }

  // The turn's stream is over: no more audio is coming for it.
  finishTurn(turnPrefix: string) {
    this.showSilently(turnPrefix);
  }

  isAudible() {
    return this.audible;
  }

  // Resolves once everything queued so far has been played.
  whenIdle() {
    if (this.isIdle()) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  // Lowers the voice while the user may be starting to talk.
  duck(on: boolean) {
    this.gain.gain.setTargetAtTime(on ? 0.2 : 1, this.ctx.currentTime, 0.04);
  }

  level() {
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (const sample of this.levelBuffer) sum += sample * sample;
    return Math.sqrt(sum / this.levelBuffer.length);
  }

  // How loud the voice is in `count` bands from 120 Hz to 4 kHz (low to
  // high), each 0–1. Drives the launcher's wave while the panel is minimized.
  bands(count: number) {
    this.analyser.getByteFrequencyData(this.frequencyBuffer);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const low = 120;
    const high = 4000;
    const result: number[] = [];
    for (let band = 0; band < count; band++) {
      const from = Math.floor((low * Math.pow(high / low, band / count)) / binHz);
      const to = Math.max(from + 1, Math.floor((low * Math.pow(high / low, (band + 1) / count)) / binHz));
      let sum = 0;
      for (let bin = from; bin < to; bin++) sum += this.frequencyBuffer[bin] ?? 0;
      // Speech is quieter in the higher bands; lift them so every bar moves.
      const loudness = sum / (to - from) / 255 + band * 0.025;
      result.push(Math.min(1, Math.max(0, (loudness - 0.37) / 0.55)));
    }
    return result;
  }

  // Text spoken in the last few seconds, for telling our own voice apart from the user's.
  recentText(windowSecs = 5) {
    const since = this.ctx.currentTime - windowSecs;
    return [...this.segments.values()]
      .filter((segment) => segment.chunks.some((chunk) => chunk.start + chunk.duration > since && chunk.start < this.ctx.currentTime))
      .map((segment) => segment.text)
      .join(" ");
  }

  // Runs `run` once the voice has said the turn's first `at` non-space
  // characters (by default, all the text received so far): pointing at
  // something as it's mentioned, not as the text streams in. Dropped if the
  // speech is stopped first.
  cue(turnPrefix: string, run: () => void, at?: number) {
    const after = at ?? this.turnCharacters(turnPrefix, (segment) => segment.text);
    if (after === 0) return run();
    this.cues.push({ turnPrefix, after, run });
    // A timer, not animation frames: those pause while the panel is minimized.
    this.cueTimer ??= setInterval(() => this.runDueCues(), 50);
  }

  // Whether the last thing said was a question (so a short "yes" is an answer).
  endedWithQuestion() {
    const spoken = [...this.segments.values()].filter((segment) => segment.revealed > 0 || segment.silent);
    return /\?\s*$/.test(spoken[spoken.length - 1]?.text ?? "");
  }

  // Stops all speech now. Returns what was heard of each tracked block, then
  // forgets them (each block is reported once).
  stop(): HeardBlock[] {
    const report = this.report();
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.cues = [];
    if (this.cueTimer) clearInterval(this.cueTimer);
    this.cueTimer = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.segments.clear();
    this.blocks = [];
    this.playHead = 0;
    this.duck(false);
    this.setAudible(false, true);
    this.checkIdle();
    return report;
  }

  dispose() {
    this.stop();
    this.gain.disconnect();
    this.analyser.disconnect();
  }

  // What has been heard is exactly what has been revealed on screen.
  private report(): HeardBlock[] {
    const now = this.heardTime();
    return this.blocks.map((block) => ({
      key: block.key,
      received: block.segments.map((segment) => segment.text).join("").trim(),
      heard: this.visibleText(block, now),
    }));
  }

  // ElevenLabs times are relative to the chunk and can run a little past its
  // audio; they're scaled to fit so the text never gets ahead of the voice.
  private addTimings(segment: Segment, alignment: SpeechAlignment, start: number, duration: number) {
    const last = alignment.chars.length - 1;
    if (last < 0) return;
    const spanSecs = (alignment.starts[last] + (alignment.durations[last] ?? 0)) / 1000;
    const scale = spanSecs > duration ? duration / spanSecs : 1;
    let previous = segment.charTimes[segment.charTimes.length - 1] ?? 0;
    alignment.chars.forEach((char, i) => {
      if (isSpace(char)) return;
      previous = Math.max(previous, start + (alignment.starts[i] / 1000) * scale);
      segment.charTimes.push(previous);
    });
  }

  private revealedText(segment: Segment, now: number) {
    if (segment.silent) return segment.text;
    const lastChunk = segment.chunks[segment.chunks.length - 1];
    if (!lastChunk) return "";
    if (segment.ended && now >= lastChunk.start + lastChunk.duration) return segment.text;

    let visible = 0;
    if (segment.charTimes.length > 0) {
      while (visible < segment.charTimes.length && segment.charTimes[visible] <= now) visible++;
    } else {
      // No timings came with this audio: estimate from how much has played.
      const total = segment.chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
      const played = segment.chunks.reduce((sum, chunk) => sum + Math.min(chunk.duration, Math.max(0, now - chunk.start)), 0);
      const expected = segment.ended ? total : Math.max(total, segment.text.length / CHARS_PER_SEC);
      visible = Math.floor(countVisible(segment.text) * Math.min(1, played / expected));
    }
    segment.revealed = Math.max(segment.revealed, visible);
    return prefixOf(segment.text, segment.revealed);
  }

  private visibleText(block: Block, now: number) {
    let text = "";
    for (const segment of block.segments) {
      const revealed = this.revealedText(segment, now);
      text += revealed;
      if (revealed.length < segment.text.length) break;
    }
    return text.trim();
  }

  private isRevealed(segment: Segment, now: number) {
    return this.revealedText(segment, now).length === segment.text.length && (segment.ended || segment.silent);
  }

  // Shows newly spoken text, once per animation frame while speech is playing.
  private refresh() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const now = this.heardTime();
      let pending = false;
      for (const block of this.blocks) {
        const text = this.visibleText(block, now);
        if (text && text !== block.shown) {
          block.shown = text;
          this.callbacks.onBlockText(block.key, text);
        }
        if (!block.segments.every((segment) => this.isRevealed(segment, now))) pending = true;
      }
      if (pending) this.refresh();
    });
  }

  private runDueCues() {
    const now = this.heardTime();
    const due = this.cues.filter((cue) => this.turnCharacters(cue.turnPrefix, (segment) => this.revealedText(segment, now)) >= cue.after);
    this.cues = this.cues.filter((cue) => !due.includes(cue));
    if (this.cues.length === 0 && this.cueTimer) {
      clearInterval(this.cueTimer);
      this.cueTimer = null;
    }
    for (const cue of due) cue.run();
  }

  // Non-space characters across a turn's segments, of the text `pick` gives.
  private turnCharacters(turnPrefix: string, pick: (segment: Segment) => string) {
    let total = 0;
    for (const segment of this.segments.values()) {
      if (segment.key.startsWith(turnPrefix)) total += countVisible(pick(segment));
    }
    return total;
  }

  // The moment of the audio reaching the speakers, rather than leaving the AudioContext.
  private heardTime() {
    return this.ctx.currentTime - (this.ctx.outputLatency || 0);
  }

  private isIdle() {
    return this.sources.size === 0 && [...this.segments.values()].every((segment) => segment.ended);
  }

  private checkIdle() {
    if (this.sources.size === 0) this.setAudible(false);
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  // Short gaps between sentences don't count as the assistant going quiet.
  private setAudible(audible: boolean, immediate = false) {
    if (this.quietTimer) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    if (audible) {
      this.lastAudibleAt = Date.now();
      if (!this.audible) {
        this.audible = true;
        this.callbacks.onAudibleChange(true);
      }
      return;
    }
    if (!this.audible) return;
    const quiet = () => {
      this.quietTimer = null;
      this.audible = false;
      this.lastAudibleAt = Date.now();
      this.callbacks.onAudibleChange(false);
    };
    if (immediate) quiet();
    else this.quietTimer = setTimeout(quiet, 250);
  }
}
