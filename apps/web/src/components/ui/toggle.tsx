"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * A switch built on a real checkbox, so it keeps native keyboard behaviour and
 * form semantics. `role="switch"` tells assistive tech it is on/off rather than
 * checked/unchecked.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Visually the label usually sits in the row beside it. */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="peer size-full cursor-pointer appearance-none disabled:cursor-not-allowed"
        style={{ position: "absolute", inset: 0, zIndex: 1, opacity: 0 }}
      />
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors duration-200",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-evidence/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          checked ? "bg-evidence" : "bg-line-strong/50",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-background shadow-sm transition-transform duration-200 [transition-timing-function:var(--ease-archival)]",
            checked && "translate-x-4",
          )}
        />
      </span>
    </span>
  );
}
