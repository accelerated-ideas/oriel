import { cn } from "@/lib/utils";

// The launcher's audio-wave icon (the embed script draws the same seven bars).
const BARS = [5, 9, 14, 17, 12, 8, 5];

export function WaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className={cn("size-4", className)}>
      {BARS.map((height, index) => (
        <line key={index} x1={3 + index * 3} x2={3 + index * 3} y1={12 - height / 2} y2={12 + height / 2} />
      ))}
    </svg>
  );
}
