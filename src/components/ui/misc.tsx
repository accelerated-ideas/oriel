import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-ink-2",
        accent: "bg-accent-soft text-accent-ink",
        success: "bg-success-soft text-success-ink",
        warning: "bg-warning-soft text-warning-ink",
        danger: "bg-danger-soft text-danger",
        outline: "text-ink-2 shadow-border",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// Segmented control: a zinc track with the active option raised in white.
export const segmentedTrack = "inline-flex flex-wrap gap-0.5 rounded-[14px] bg-surface-2 p-1";
export function segmentedItem(active: boolean) {
  return cn(
    "rounded-[10px] px-3 py-1.5 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150",
    active ? "bg-surface text-ink shadow-border" : "text-muted hover:text-ink",
  );
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl bg-surface shadow-border", className)} {...props} />;
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center rounded border border-line-strong bg-surface px-1.5 font-mono text-[11px] text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-zinc-50 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-surface text-accent shadow-border [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="font-display text-[22px] leading-tight">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[34px] leading-[1.05] text-balance sm:text-[40px]">{title}</h1>
        {description && <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// A settings section: title and description on the left, fields on the right.
// Sections sit directly on the page panel, separated by dividers.
export function SectionCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-5 border-t border-line py-8 first:border-t-0 first:pt-2 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-12",
        className,
      )}
    >
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-pretty text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {children}
        {footer && <div className="flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </section>
  );
}
