"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * A native range input with the track painted from its own value, so the filled
 * portion needs no second element to stay in sync.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  hideLabel,
  valueLabel,
  marks,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  label: string;
  /** Hide the visible label where a surrounding row already provides one. */
  hideLabel?: boolean;
  /** Rendered beside the label — the number the reader actually cares about. */
  valueLabel: string;
  marks?: { value: number; label: string }[];
  className?: string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className={cn(
            "text-[0.8125rem] font-medium text-foreground",
            hideLabel && "sr-only",
          )}
        >
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-[0.875rem] font-semibold tabular-nums text-evidence">
          {valueLabel}
        </output>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="zz-range h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-evidence/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />

      {marks && (
        <div className="flex justify-between font-mono text-[0.625rem] tabular-nums text-muted-2">
          {marks.map((mark) => (
            <span key={mark.value}>{mark.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
