"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * A labelled input. Owns the id/`aria-describedby`/`aria-invalid` wiring once,
 * so no form has to remember it — the error is announced, not merely coloured.
 */
export function Field({
  label,
  hideLabel,
  error,
  hint,
  action,
  className,
  inputClassName,
  children,
  ...input
}: {
  label: string;
  /** Hide the visible label where a surrounding row already provides one. */
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  /** Rendered on the label row, e.g. a "forgot password?" link. */
  action?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  /** An adornment rendered inside the input, e.g. a reveal toggle. */
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"input">, "className">) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "flex items-baseline justify-between gap-3",
          hideLabel && !action && "sr-only",
        )}
      >
        <label
          htmlFor={id}
          className={cn(
            "text-[0.8125rem] font-medium text-foreground",
            hideLabel && "sr-only",
          )}
        >
          {label}
        </label>
        {action}
      </div>

      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "h-11 w-full rounded-xl border bg-surface px-3.5 text-[0.9375rem] text-foreground",
            "placeholder:text-muted-2/70",
            "transition-[border-color,box-shadow] duration-200 [transition-timing-function:var(--ease-archival)]",
            "focus:outline-none focus-visible:border-evidence focus-visible:ring-2 focus-visible:ring-evidence/25",
            "disabled:cursor-not-allowed disabled:opacity-60",
            error ? "border-refuted" : "border-line-strong hover:border-muted-2",
            children && "pr-11",
            inputClassName,
          )}
          {...input}
        />
        {children}
      </div>

      {hint && !error && (
        <p id={hintId} className="text-[0.6875rem] leading-snug text-muted-2">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-[0.6875rem] leading-snug text-refuted"
        >
          <span aria-hidden className="mt-[0.35em] size-1 shrink-0 rounded-full bg-refuted" />
          {error}
        </p>
      )}
    </div>
  );
}
