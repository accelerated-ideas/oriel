"use client";
import { useEffect, useRef } from "react";
import type { AvatarStyle } from "@/config/avatars";
import { markColor, mixHex, textOn } from "@/lib/color";
import { cn } from "@/lib/utils";
import { Orb } from "../orb";
import { faceDrawer } from "./face";
import { hiveDrawer } from "./hive";
import { AvatarSignal, type AvatarColors, type AvatarState } from "./signal";

type AvatarProps = {
  look: AvatarStyle;
  color: string;
  size: number;
  // VoiceCall.level(), while on a call.
  level?: () => number;
  // VoiceCall.voiceBands(7), while on a call.
  bands?: () => number[] | null;
  state?: AvatarState;
  className?: string;
};

// The assistant in the look chosen for it. The orb is CSS; the face and the
// hive are drawn on a canvas every frame from the call's audio.
export function Avatar({ look, ...props }: AvatarProps) {
  if (look === "face" || look === "hive") return <CanvasAvatar key={look} look={look} {...props} />;
  return <Orb size={props.size} level={props.level} state={props.state} className={props.className} />;
}

// The canvas reaches past the box on every side, for the face's bob and the
// hive's biggest dots.
const BLEED = 0.15;

function colorsFor(accent: string): AvatarColors {
  return {
    accent,
    on: textOn(accent),
    light: mixHex(accent, "#ffffff", 0.3),
    deep: mixHex(accent, "#09090b", 0.14),
    mark: markColor(accent, "light"),
  };
}

function CanvasAvatar({ look, color, size, level, bands, state = "idle", className }: AvatarProps & { look: "face" | "hive" }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ color, level, bands, state });
  useEffect(() => {
    latest.current = { color, level, bands, state };
  });

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!box || !canvas || !g) return;
    const draw = look === "face" ? faceDrawer() : hiveDrawer();
    const signal = new AvatarSignal();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let colors = colorsFor(latest.current.color);
    let drawn = { px: 0, ratio: 0 };
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const current = latest.current;
      if (current.color !== colors.accent) colors = colorsFor(current.color);
      const f = signal.update(dt, current.state, current.level?.() ?? 0, current.bands?.() ?? null, reducedMotion.matches);

      // The box animates between the call and chat sizes, so measure it each frame.
      const S = box.clientWidth;
      const px = Math.round(S * (1 + 2 * BLEED));
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (px !== drawn.px || ratio !== drawn.ratio) {
        canvas.width = px * ratio;
        canvas.height = px * ratio;
        drawn = { px, ratio };
      }
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, px, px);
      g.translate((px - S) / 2, (px - S) / 2);
      draw(g, S, f, colors);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [look]);

  return (
    <div
      ref={boxRef}
      className={cn("relative shrink-0 transition-[width,height] duration-300 ease-out", className)}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute"
        style={{ inset: `${-BLEED * 100}%`, width: `${(1 + 2 * BLEED) * 100}%`, height: `${(1 + 2 * BLEED) * 100}%` }}
      />
    </div>
  );
}
