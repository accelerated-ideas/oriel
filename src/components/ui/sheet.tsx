"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// A panel that slides in from the right, for tasks with more room than a dialog.

export const Sheet = DialogPrimitive.Root;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-2 right-2 z-50 flex w-[calc(100vw-16px)] max-w-[620px] flex-col overflow-hidden rounded-2xl bg-surface shadow-float focus:outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-5 right-5 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-6 pt-5 pb-4 pr-14">
      {icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-[18px]">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <DialogPrimitive.Title className="text-[17px] leading-9 font-semibold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="-mt-1 text-[13.5px] leading-relaxed text-muted">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        )}
      </div>
    </div>
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-line bg-zinc-50/80 px-6 py-4", className)}
      {...props}
    />
  );
}
