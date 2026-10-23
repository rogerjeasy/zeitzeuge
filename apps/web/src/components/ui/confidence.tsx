import { cn } from "@/lib/cn";
import type { Decision } from "@/lib/data/record";

const decisionTone: Record<Decision, { text: string; bg: string; dot: string }> = {
  emit: { text: "text-corroborated", bg: "bg-corroborated-soft", dot: "bg-corroborated" },
  emit_with_review: { text: "text-review", bg: "bg-review-soft", dot: "bg-review" },
  abstain: { text: "text-abstain", bg: "bg-abstain-soft", dot: "bg-abstain" },
};

export function DecisionPill({
  decision,
  label,
  className,
}: {
  decision: Decision;
  label: string;
  className?: string;
}) {
  const tone = decisionTone[decision];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.08em]",
        tone.bg,
        tone.text,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {label}
    </span>
  );
}

/**
 * A confidence meter, not a percentage badge. Twelve discrete ticks read as a
 * measurement; a smooth bar reads as a progress indicator, which this is not.
 */
export function ConfidenceMeter({
  value,
  decision,
  label,
  className,
}: {
  value: number;
  decision: Decision;
  label: string;
  className?: string;
}) {
  const ticks = 12;
  const filled = Math.round(value * ticks);
  const tone = decisionTone[decision];

  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      title={`${label}: ${(value * 100).toFixed(0)} %`}
    >
      <span aria-hidden className="flex items-end gap-[2px]">
        {Array.from({ length: ticks }, (_, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px] transition-colors duration-300",
              i < filled ? tone.dot : "bg-line-strong/40",
              i % 3 === 2 ? "h-3" : "h-2",
            )}
          />
        ))}
      </span>
      <span className={cn("font-mono text-[0.6875rem] tabular-nums", tone.text)}>
        {value.toFixed(2)}
      </span>
      <span className="sr-only">
        {label} {(value * 100).toFixed(0)} %
      </span>
    </span>
  );
}

export function EvidenceRef({
  id,
  active,
  className,
  ...rest
}: {
  id: string;
  active?: boolean;
} & React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-[5px] border px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums transition-colors duration-200",
        active
          ? "border-evidence bg-evidence text-background"
          : "border-evidence/25 bg-evidence-soft text-evidence hover:border-evidence/60",
        className,
      )}
      {...rest}
    >
      {id}
    </button>
  );
}
