import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(69_53_196/0.3)] hover:bg-accent-hover active:bg-accent-press",
        dark: "bg-ink text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] hover:bg-zinc-800",
        outline: "bg-surface text-ink shadow-border hover:bg-zinc-50 hover:shadow-border-hover",
        soft: "bg-surface-2 text-ink hover:bg-surface-3",
        ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "h-auto px-0 text-accent-ink underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-8 rounded-lg px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-5 text-[15px] [&_svg]:size-4.5",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Component>
  );
}

export { buttonVariants };
