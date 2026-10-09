import type { AvatarStyle } from "@/config/avatars";
import { markColor, textOn } from "@/lib/color";
import { FACE_GLYPH, faceGlyphMouth, HIVE_GLYPH, HIVE_GLYPH_RADIUS } from "@/lib/widget/avatar-shapes";
import { cn } from "@/lib/utils";

// The assistant's avatar, small and still, in its color: the same look
// visitors see. `on` is the surface behind it (the launcher is near-black).
export function AgentAvatar({
  color,
  look = "orb",
  on = "light",
  className,
}: {
  color: string;
  look?: AvatarStyle;
  on?: "light" | "dark";
  className?: string;
}) {
  if (look === "face") {
    const ink = textOn(color);
    return (
      <svg viewBox="0 0 100 100" aria-hidden className={cn("inline-block size-6 shrink-0", className)}>
        <path d={FACE_GLYPH.tile} fill={color} />
        {FACE_GLYPH.eyes.map((eye) => (
          <rect key={eye.x} x={eye.x} y={eye.y} width={eye.width} height={eye.height} rx={eye.radius} fill={ink} />
        ))}
        <path d={faceGlyphMouth(0)} fill={ink} stroke={ink} strokeWidth={FACE_GLYPH.mouthStroke} strokeLinejoin="round" />
      </svg>
    );
  }
  if (look === "hive") {
    const ink = markColor(color, on);
    return (
      <svg viewBox="0 0 100 100" aria-hidden className={cn("inline-block size-6 shrink-0", className)}>
        {HIVE_GLYPH.map((dot, index) => (
          <circle
            key={index}
            cx={dot.x}
            cy={dot.y}
            r={index ? HIVE_GLYPH_RADIUS.ring : HIVE_GLYPH_RADIUS.center}
            fill={ink}
            opacity={index ? 0.82 : 1}
          />
        ))}
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("orb-fill inline-block size-6 shrink-0 rounded-full shadow-[inset_0_-2px_4px_rgb(0_0_0/0.18)]", className)}
      style={{ "--accent": color } as React.CSSProperties}
    />
  );
}
