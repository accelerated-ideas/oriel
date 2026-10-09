"use client";
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-left text-[14px] text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-zinc-400 focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 data-[placeholder]:text-faint",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[60] max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl bg-surface p-1 shadow-pop data-[state=open]:animate-fade-in"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-pointer flex-col rounded-lg py-2 pr-8 pl-3 text-[14px] text-ink outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-3"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                {option.description && <span className="text-[12.5px] text-muted">{option.description}</span>}
                <SelectPrimitive.ItemIndicator className="absolute top-2.5 right-2.5">
                  <Check className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
