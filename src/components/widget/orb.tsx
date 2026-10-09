"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// A soft accent-colored sphere. When `level` is provided it swells with audio.
export function Orb({
  size = 160,
  level,
  state = "idle",
  className,
}: {
  size?: number;
  level?: () => number;
  state?: "idle" | "connecting" | "thinking" | "listening" | "speaking";
  className?: string;
}) {
  const coreRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!level) return;
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      const value = Math.min(1, Math.max(0, level() || 0));
      smoothed = smoothed * 0.8 + value * 0.2;
      const scale = 1 + smoothed * 0.18;
      if (coreRef.current) coreRef.current.style.transform = `scale(${scale})`;
      if (haloRef.current) {
        haloRef.current.style.transform = `scale(${1 + smoothed * 0.45})`;
        haloRef.current.style.opacity = String(0.25 + smoothed * 0.5);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level]);

  return (
    <div
      className={cn("relative grid place-items-center transition-[width,height] duration-300 ease-out", className)}
      style={{ width: size, height: size }}
    >
      <div
        ref={haloRef}
        className="absolute inset-0 rounded-full opacity-25 blur-2xl transition-transform duration-75"
        style={{ background: "var(--accent)" }}
      />
      <div
        ref={coreRef}
        className={cn(
          "orb-fill relative rounded-full transition-[transform,width,height] [transition-duration:75ms,300ms,300ms]",
          !level && "animate-orb-breathe",
          (state === "connecting" || state === "thinking") && "animate-pulse",
        )}
        style={{
          width: size * 0.78,
          height: size * 0.78,
          boxShadow: "inset 0 -10px 30px rgb(9 9 11 / 0.18), 0 18px 40px -16px color-mix(in srgb, var(--accent) 75%, transparent)",
        }}
      />
    </div>
  );
}
