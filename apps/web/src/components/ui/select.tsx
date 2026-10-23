"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A native `<select>`, styled. Native is the right call here: it gets the
 * platform's own picker on a phone, full keyboard behaviour for free, and no
 * focus-trap of our own to get wrong.
 */
export function Select({
  label,
  hideLabel,
  options,
  className,
  ...rest
}: {
  label: string;
  hideLabel?: boolean;
  options: { value: string; label: string }[];
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<"select">, "className" | "children">) {
  const id = useId();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "text-[0.8125rem] font-medium text-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className={cn(
            "h-10 w-full appearance-none rounded-lg border border-line-strong bg-surface pl-3 pr-9 text-[0.8125rem] text-foreground",
            "transition-[border-color,box-shadow] duration-200",
            "focus:outline-none focus-visible:border-evidence focus-visible:ring-2 focus-visible:ring-evidence/25",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-2"
          strokeWidth={2}
        />
      </div>
    </div>
  );
}
