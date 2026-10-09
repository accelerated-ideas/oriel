import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarState } from "./signal";

const TAU = Math.PI * 2;

// A pretend call for previews: the visitor asks something, the assistant
// thinks, then answers. `loudness` matches what VoiceCall.level() gives.
const PHASES: { state: AvatarState; seconds: number; loudness: number }[] = [
  { state: "idle", seconds: 1.6, loudness: 0 },
  { state: "listening", seconds: 2.6, loudness: 0.6 },
  { state: "thinking", seconds: 1.4, loudness: 0 },
  { state: "speaking", seconds: 5.4, loudness: 0.42 },
];
const LOOP_SECONDS = PHASES.reduce((sum, phase) => sum + phase.seconds, 0);

function phaseAt(seconds: number) {
  let t = seconds % LOOP_SECONDS;
  for (const phase of PHASES) {
    if (t < phase.seconds) return { phase, t };
    t -= phase.seconds;
  }
  return { phase: PHASES[0], t: 0 };
}

// The rhythm of speech: four or five syllables a second, in phrases with
// pauses, with vowels and hissing sounds moving through the bands.
function speech(t: number, loudness: number) {
  const inPhrase = t % 3.4 < 2.7 ? 1 : 0;
  const syllable = Math.max(0, Math.sin(t * TAU * 2.4 + Math.sin(t * 1.7) * 1.3)) ** 1.4;
  const level = inPhrase * syllable * (0.55 + 0.45 * Math.sin(t * 1.3 + 0.6)) * loudness;
  const vowel = 0.5 + 0.5 * Math.sin(t * 3.1);
  const hiss = Math.max(0, Math.sin(t * 5.3 + 1)) ** 3;
  const shape = [0.55, 0.75, 0.85 * (0.6 + 0.4 * vowel), 0.6 * (1.2 - vowel), 0.45, 0.3 + 0.6 * hiss, 0.25 + 0.7 * hiss];
  return { level, bands: shape.map((value) => Math.min(1, value * level * 2.2)) };
}

const secondsSince = (start: number) => (performance.now() - start) / 1000;

// Drives avatar previews through a loop of that call.
export function useDemoCall() {
  const [state, setState] = useState<AvatarState>("idle");
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    const timer = setInterval(() => setState(phaseAt(secondsSince(startRef.current)).phase.state), 100);
    return () => clearInterval(timer);
  }, []);

  const level = useCallback(() => {
    const { phase, t } = phaseAt(secondsSince(startRef.current));
    return phase.loudness ? speech(t, phase.loudness).level : 0;
  }, []);
  const bands = useCallback(() => {
    const { phase, t } = phaseAt(secondsSince(startRef.current));
    return phase.state === "speaking" ? speech(t, phase.loudness).bands : null;
  }, []);

  return { state, level, bands };
}
