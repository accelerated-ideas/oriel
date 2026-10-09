import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PeriodSwitcher({ base, label, previous, next }: { base: string; label: string; previous: string; next: string | null }) {
  const arrow =
    "flex size-8 items-center justify-center rounded-[9px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink";
  return (
    <div className="flex items-center gap-1 rounded-[14px] bg-surface p-1 shadow-border">
      <Link href={`${base}?month=${previous}`} className={arrow} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-[124px] text-center text-[13.5px] font-medium tabular">{label}</span>
      {next ? (
        <Link href={`${base}?month=${next}`} className={arrow} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(arrow, "pointer-events-none opacity-30")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}

// One bar per day; hover shows the exact number.
export function DailyBars({ days, values, unit }: { days: string[]; values: Map<string, number>; unit: string }) {
  const max = Math.max(1, ...days.map((day) => values.get(day) ?? 0));
  return (
    <div className="flex h-44 items-end gap-[3px] sm:gap-1">
      {days.map((day) => {
        const value = values.get(day) ?? 0;
        const label = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        return (
          <div key={day} className="group relative flex h-full flex-1 items-end" title={`${label}: ${value} ${unit}`}>
            <div
              className={cn(
                "w-full rounded-t-[4px] transition-colors duration-150",
                value > 0 ? "bg-accent/80 group-hover:bg-accent" : "bg-zinc-100",
              )}
              style={{ height: value > 0 ? `${Math.max(4, (value / max) * 100)}%` : "4px" }}
            />
          </div>
        );
      })}
    </div>
  );
}
