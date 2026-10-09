"use client";
import { useEffect, useRef, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./motion";

// A slowly moving colour field with film grain, behind the product scenes.
// The shader pauses itself off screen and in background tabs. Until it draws,
// and in browsers without WebGL 2, the same colours show as CSS gradients.

// White specks laid over the colour, as in printed film.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

type Palette = readonly [string, string, string, string];

// Each scene gets colours that match what it shows.
export const PALETTES = {
  iris: ["#c8bcff", "#6352f2", "#ffc7e3", "#ffe1c7"],
  sky: ["#bfe3ff", "#3d7dff", "#a9b8ff", "#e4f2ff"],
  mint: ["#b8f0d6", "#1aa57d", "#86dcc2", "#e8fff4"],
  coral: ["#ffc2a6", "#f2557f", "#ffd98a", "#ffe8dc"],
  amber: ["#ffe0a3", "#ff9a4d", "#ffcfb0", "#f7b75c"],
  stripe: ["#d6d2ff", "#7a73ff", "#a5ecff", "#f1edff"],
  night: ["#1b1442", "#6352f2", "#07060d", "#a046d6"],
} as const satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

export function Backdrop({
  palette,
  dark = false,
  speed = 0.3,
  frame = 0,
  className,
}: {
  palette: PaletteName;
  /** Deepens the colours, for light content on top. */
  dark?: boolean;
  speed?: number;
  /** Where the motion starts, so neighbouring backdrops don't look alike. */
  frame?: number;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();
  const colors = useBlendedColors(PALETTES[palette], reduce ? 0 : 700);
  const [a, b, c, d] = colors;
  // Checked after hydration, so the server and client markup match.
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(supportsWebGL2()), []);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{
        background: `radial-gradient(70% 60% at 15% 20%, ${a}, transparent 70%), radial-gradient(60% 60% at 85% 35%, ${b}, transparent 70%), radial-gradient(80% 70% at 40% 100%, ${c}, transparent 70%), ${d}`,
      }}
    >
      {webgl && (
        <MeshGradient
          className="absolute inset-0"
          width="100%"
          height="100%"
          colors={colors}
          distortion={0.85}
          swirl={0.3}
          grainMixer={0.1}
          speed={reduce ? 0 : speed}
          frame={frame}
          // The colours are soft, so full resolution only costs battery.
          minPixelRatio={1}
          maxPixelCount={1100 * 900}
        />
      )}
      {dark && <div className="absolute inset-0 bg-[#06070b]/30" />}
      <div className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}

// Paper's shaders need WebGL 2. Asked once, with a throwaway context.
let webgl2: boolean | undefined;
function supportsWebGL2() {
  if (webgl2 === undefined) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      webgl2 = Boolean(gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

// Eases from the colours on screen to new ones, so a palette change reads as
// the light shifting rather than a cut.
function useBlendedColors(target: Palette, duration: number) {
  const [colors, setColors] = useState<string[]>(() => [...target]);
  const shownRef = useRef<string[]>(colors);
  const key = target.join();

  useEffect(() => {
    const from = shownRef.current;
    if (from.join() === key) return;
    if (!duration) {
      shownRef.current = [...target];
      setColors(shownRef.current);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      shownRef.current = target.map((color, index) => mixHex(from[index] ?? color, color, eased));
      setColors(shownRef.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, duration]);

  return colors;
}

function mixHex(from: string, to: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const a = parse(from);
  const b = parse(to);
  return `#${a
    .map((value, index) =>
      Math.round(value + (b[index] - value) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
