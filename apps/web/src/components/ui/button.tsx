import { cn } from "@/lib/cn";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground-strong shadow-[0_1px_2px_rgb(7_20_34/0.18)] active:translate-y-px",
  secondary:
    "border border-line-strong bg-surface/70 text-foreground backdrop-blur-sm hover:border-evidence hover:text-evidence active:translate-y-px",
  ghost: "text-foreground hover:bg-surface-2",
  quiet: "text-muted hover:text-foreground",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[0.8125rem] gap-1.5 rounded-lg",
  md: "h-11 px-5 text-sm gap-2 rounded-xl",
  lg: "h-13 px-6.5 text-[0.9375rem] gap-2.5 rounded-xl",
};

interface ButtonProps<T extends ElementType> {
  as?: T;
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: ReactNode;
}

export function Button<T extends ElementType = "button">({
  as,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof ButtonProps<T>>) {
  const Component = (as ?? "button") as ElementType;

  return (
    <Component
      className={cn(
        "inline-flex select-none items-center justify-center font-medium tracking-[-0.01em]",
        "transition-[background-color,border-color,color,transform,box-shadow] duration-200",
        "[transition-timing-function:var(--ease-archival)]",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
