"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, MotionConfig, useInView, useReducedMotion, type Variants } from "motion/react";

export const EASE_OUT = [0.2, 0, 0, 1] as const;

// Whether the visitor prefers reduced motion. False until hydrated: the server
// can't know the preference, and the first render has to match its HTML.
export function usePrefersReducedMotion() {
  const reduce = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated && Boolean(reduce);
}

// Respects the visitor's reduced-motion setting everywhere on the page.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  shown: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: EASE_OUT, delay },
  }),
};

// Fades content up the first time it scrolls into view.
export function Reveal({
  children,
  className,
  delay = 0,
  amount = 0.2,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** How much of it must be on screen first. Lower it for tall blocks. */
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
      variants={item}
      custom={delay}
    >
      {children}
    </motion.div>
  );
}

// Children wrapped in RevealItem enter one after another.
export function RevealGroup({
  children,
  className,
  stagger = 0.09,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

// Clock for the scripted product scenes: loops from 0 to `duration` seconds
// while the scene is on screen, and pauses when it isn't (or when `paused`).
// With reduced motion it holds at `still`, a moment that shows the finished
// scene, unless the visitor chose to play it (`playWhenReduced`). A new
// `restart` value starts it over, in the same render, so a scene never shows
// a frame of another scene's time.
export function useScene<T extends Element>(
  duration: number,
  still: number,
  {
    paused = false,
    playWhenReduced = false,
    restart,
  }: { paused?: boolean; playWhenReduced?: boolean; restart?: unknown } = {},
) {
  const ref = useRef<T>(null);
  const visible = useInView(ref, { amount: 0.3 });
  const reduce = usePrefersReducedMotion();
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const [epoch, setEpoch] = useState(restart);
  if (epoch !== restart) {
    setEpoch(restart);
    setTime(reduce && !playWhenReduced ? still : 0);
  }
  const startedRef = useRef(restart);
  // Whether the reduced-motion still has been shown since the last restart.
  const heldRef = useRef(false);

  // Jumps to a moment in the scene.
  const seek = useCallback((at: number) => {
    timeRef.current = at;
    setTime(at);
  }, []);

  useEffect(() => {
    if (startedRef.current !== restart) {
      startedRef.current = restart;
      timeRef.current = 0;
      heldRef.current = false;
    }
    // The finished scene, set after hydration so the server and client markup
    // match. A moment picked with `seek` stays put.
    if (reduce && !playWhenReduced) {
      if (!heldRef.current) {
        heldRef.current = true;
        timeRef.current = still;
        setTime(still);
      }
      return;
    }
    if (!visible || paused) return;
    let frame = 0;
    let last = performance.now();
    let lastRender = 0;
    const tick = (now: number) => {
      // A frame's timestamp can be a hair earlier than when the loop started.
      timeRef.current = (timeRef.current + Math.min(0.1, Math.max(0, (now - last) / 1000))) % duration;
      last = now;
      // Re-render ~30 times a second; anything smoother reads timeRef directly.
      if (now - lastRender > 33) {
        lastRender = now;
        setTime(timeRef.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reduce, still, visible, paused, playWhenReduced, restart]);

  return { ref, time, timeRef, visible, still: Boolean(reduce), seek };
}

// The words of `text` spoken so far, if it's said between `start` and `end`.
export function wordsAt(text: string, start: number, end: number, time: number) {
  if (time < start) return "";
  const words = text.split(" ");
  const count = Math.min(words.length, Math.ceil(((time - start) / (end - start)) * words.length));
  return words.slice(0, Math.max(1, count)).join(" ");
}

export function between(time: number, start: number, end: number) {
  return time >= start && time < end;
}
