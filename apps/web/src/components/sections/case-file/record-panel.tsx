"use client";

import { useTranslations } from "next-intl";
import { MinusCircle } from "lucide-react";
import { RECORD_FIELDS } from "@/lib/data/record";
import { ConfidenceMeter, DecisionPill, EvidenceRef } from "@/components/ui/confidence";
import { cn } from "@/lib/cn";

/**
 * The catalogue record. Every row shows the same four things in the same order:
 * what the field is, what we decided, how sure we are, and which evidence says
 * so. The abstained row is styled as a legitimate outcome, not an error.
 */
export function RecordPanel({
  activeEvidence,
  onHoverEvidence,
}: {
  activeEvidence: string | null;
  onHoverEvidence: (id: string | null) => void;
}) {
  const t = useTranslations("ledger");
  const tCommon = useTranslations("common");

  return (
    <ul className="divide-y divide-line">
      {RECORD_FIELDS.map((field) => {
        const abstained = field.decision === "abstain";
        const related = field.evidence.includes(activeEvidence ?? "");

        return (
          <li
            key={field.key}
            className={cn(
              "flex flex-col gap-2.5 px-4 py-4 transition-colors duration-300 sm:px-5",
              related && "bg-evidence-soft",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-[0.5625rem] tabular-nums text-muted-2">
                  {field.isadTag}
                </span>
                <span className="text-[0.8125rem] font-medium text-muted">
                  {t(`fields.${field.key}`)}
                </span>
              </div>
              <DecisionPill
                decision={field.decision}
                label={t(`decisions.${field.decision}`)}
              />
            </div>

            {abstained ? (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-line-strong bg-abstain-soft/40 px-3 py-2.5">
                <MinusCircle
                  aria-hidden
                  className="mt-px size-3.5 shrink-0 text-abstain"
                  strokeWidth={2}
                />
                <p className="text-[0.75rem] leading-relaxed text-muted">
                  {t("abstainReason")}
                </p>
              </div>
            ) : (
              <>
                <p className="font-display text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] text-foreground-strong sm:text-base">
                  {field.value}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span className="flex flex-wrap items-center gap-1">
                    {field.evidence.map((id) => (
                      <EvidenceRef
                        key={id}
                        id={id}
                        active={activeEvidence === id}
                        onMouseEnter={() => onHoverEvidence(id)}
                        onMouseLeave={() => onHoverEvidence(null)}
                        onFocus={() => onHoverEvidence(id)}
                        onBlur={() => onHoverEvidence(null)}
                      />
                    ))}
                  </span>
                  {field.confidence !== undefined && (
                    <ConfidenceMeter
                      value={field.confidence}
                      decision={field.decision}
                      label={tCommon("confidence")}
                    />
                  )}
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
