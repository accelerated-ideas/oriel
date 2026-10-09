// Turns the call's raw audio readings into what the avatars draw from:
// smoothed, normalized against the voice's own recent peak (so quiet and loud
// voices move them the same amount), with a short history and a cross-fade
// between call states.

export type AvatarState = "idle" | "connecting" | "thinking" | "listening" | "speaking";

export type AvatarFrame = {
  t: number;
  dt: number;
  // How far each state has faded in, 0–1.
  mix: Record<AvatarState, number>;
  // Loudness, 0–1.
  level: number;
  // How sharply loudness is rising: the start of a syllable.
  onset: number;
  // Each of the seven voice bands (low to high) relative to the loudest, 0–1.
  bands: number[];
  // The bands scaled by loudness: what to draw while speaking.
  shape: number[];
  // Loudness `seconds` ago, for effects that travel.
  past: (seconds: number) => number;
  // 0 with reduced motion: reactions to the voice stay, idle drift goes.
  motion: number;
};

export type AvatarColors = {
  accent: string;
  // Features drawn on the accent (eyes, mouth).
  on: string;
  light: string;
  deep: string;
  // Marks drawn on the white panel (the Hive's dots).
  mark: string;
};

export type AvatarDrawer = (g: CanvasRenderingContext2D, size: number, frame: AvatarFrame, colors: AvatarColors) => void;

const BAND_COUNT = 7;
const HISTORY_SECONDS = 1.2;
// Levels under this are quiet, not stretched to fill the range.
const PEAK_FLOOR = 0.22;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Per-frame smoothing toward a target with time constant `tau` (seconds).
export const ease = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

export class AvatarSignal {
  private level = 0;
  private slow = 0;
  private peak = PEAK_FLOOR;
  private raw = new Array<number>(BAND_COUNT).fill(0);
  private history: { at: number; value: number }[] = [];
  readonly frame: AvatarFrame = {
    t: 0,
    dt: 0,
    mix: { idle: 1, connecting: 0, thinking: 0, listening: 0, speaking: 0 },
    level: 0,
    onset: 0,
    bands: new Array<number>(BAND_COUNT).fill(0),
    shape: new Array<number>(BAND_COUNT).fill(0),
    past: (seconds) => this.past(seconds),
    motion: 1,
  };

  // `level` is VoiceCall.level(); `bands` is VoiceCall.voiceBands(7), or null
  // when the assistant isn't audible.
  update(dt: number, state: AvatarState, level: number, bands: number[] | null, reducedMotion: boolean) {
    const frame = this.frame;
    frame.t += dt;
    frame.dt = dt;
    frame.motion = reducedMotion ? 0 : 1;
    for (const key of Object.keys(frame.mix) as AvatarState[]) {
      frame.mix[key] += ((key === state ? 1 : 0) - frame.mix[key]) * ease(dt, 0.16);
    }

    const value = clamp01(level || 0);
    this.level += (value - this.level) * ease(dt, value > this.level ? 0.03 : 0.12);
    this.slow += (value - this.slow) * ease(dt, 0.28);
    this.peak = Math.max(this.level, this.peak - dt * 0.06, PEAK_FLOOR);
    frame.level = clamp01(this.level / this.peak);
    frame.onset = clamp01(Math.max(0, this.level - this.slow) / this.peak);

    let loudest = 0.3;
    for (let i = 0; i < BAND_COUNT; i++) {
      const target = bands ? clamp01(Number(bands[i]) || 0) : 0;
      this.raw[i] += (target - this.raw[i]) * ease(dt, target > this.raw[i] ? 0.04 : 0.14);
      loudest = Math.max(loudest, this.raw[i]);
    }
    for (let i = 0; i < BAND_COUNT; i++) {
      frame.bands[i] = clamp01(this.raw[i] / loudest);
      frame.shape[i] = clamp01(frame.level * (0.4 + 0.75 * frame.bands[i]));
    }

    this.history.push({ at: frame.t, value: frame.level });
    while (this.history.length > 2 && this.history[0].at < frame.t - HISTORY_SECONDS) this.history.shift();
    return frame;
  }

  private past(seconds: number) {
    const at = this.frame.t - seconds;
    for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].at <= at) return this.history[i].value;
    return this.history[0]?.value ?? 0;
  }
}
