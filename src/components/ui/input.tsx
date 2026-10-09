import * as React from "react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/lib/utils";
import { Badge } from "./misc";

const fieldBase =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[14px] text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-zinc-400 focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({
  className,
  minRows = 3,
  maxRows = 18,
  ...props
}: React.ComponentProps<typeof TextareaAutosize>) {
  return (
    <TextareaAutosize
      minRows={minRows}
      maxRows={maxRows}
      className={cn(fieldBase, "resize-none py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-ink", className)} {...props} />;
}

export function Field({
  label,
  optional,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  // Shows an "Optional" badge next to the label.
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {optional ? (
        <div className="flex items-center gap-2">
          <Label htmlFor={htmlFor}>{label}</Label>
          <Badge className="py-px text-[11.5px]">Optional</Badge>
        </div>
      ) : (
        <Label htmlFor={htmlFor}>{label}</Label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
