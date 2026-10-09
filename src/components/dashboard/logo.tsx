import Link from "next/link";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

// A sound wave on a flat iris disc. Bar heights in a 32-unit box.
const BARS = [5.5, 10.5, 16, 9.5, 5];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <circle cx="16" cy="16" r="16" className="fill-accent" />
      {BARS.map((height, index) => (
        <line
          key={index}
          x1={8.8 + index * 3.6}
          x2={8.8 + index * 3.6}
          y1={16 - height / 2}
          y2={16 + height / 2}
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          // Inside a Logo, hovering makes the wave talk.
          className="origin-center [transform-box:fill-box] group-hover/logo:animate-wave motion-reduce:group-hover/logo:animate-none"
          style={{ animationDelay: `${-index * 170}ms`, animationDuration: `${480 + index * 90}ms` }}
        />
      ))}
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group/logo flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-brand text-[23px] leading-none font-semibold tracking-[-0.055em]">{BRAND.name}</span>
    </Link>
  );
}
