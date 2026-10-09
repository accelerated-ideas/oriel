"use client";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// "some" shows a dash, for a select-all box when only part is selected.
export function Checkbox({ state, label, onClick }: { state: "on" | "off" | "some"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "on" ? true : state === "some" ? "mixed" : false}
      aria-label={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-md"
    >
      <span
        className={cn(
          "flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-150",
          state === "off" ? "bg-surface shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]" : "bg-accent text-white",
        )}
      >
        {state === "on" && <Check className="size-3" strokeWidth={3} />}
        {state === "some" && <Minus className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}
