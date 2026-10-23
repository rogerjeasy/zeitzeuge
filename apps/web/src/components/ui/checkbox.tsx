"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A real `<input type="checkbox">` kept in the accessibility tree and visually
 * replaced, so it keeps native keyboard behaviour and form semantics.
 */
export function Checkbox({
  label,
  className,
  ...input
}: {
  label: React.ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<"input">, "type" | "className">) {
  const id = useId();

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="relative flex size-[1.125rem] shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          className="peer size-full cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors duration-200 checked:border-evidence checked:bg-evidence focus:outline-none focus-visible:ring-2 focus-visible:ring-evidence/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          {...input}
        />
        <Check
          aria-hidden
          strokeWidth={3.2}
          className="pointer-events-none absolute size-3 text-background opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
        />
      </span>
      <label
        htmlFor={id}
        className="cursor-pointer select-none text-[0.8125rem] leading-snug text-muted"
      >
        {label}
      </label>
    </div>
  );
}
