"use client";

import { useTranslations } from "next-intl";
import { EVIDENCE, HYPOTHESES } from "@/lib/data/record";
import { cn } from "@/lib/cn";

/**
 * The hypothesis that survived, per field, with what carries it: how many
 * independent source classes confirm it and how many objections stood. A field
 * where nothing survived says so — abstaining is an outcome, not a gap.
 */
export function HypothesesPanel({
  activeEvidence,
}: {
  activeEvidence: string | null;
}) {
  const t = useTranslations("ledger");
  const tCommon = useTranslations("common");

  return (
    <ul className="divide-y divide-line">
      {HYPOTHESES.map((hypothesis) => {
        const open = hypothesis.value === undefined;
        const highlighted = Boolean(
          EVIDENCE.find((e) => e.id === activeEvidence)?.supports?.includes(hypothesis.id),
        );
        return (
          <li
            key={hypothesis.id}
            className={cn(
              "flex flex-col gap-2.5 px-4 py-4 transition-colors duration-300 sm:px-5",
              highlighted && "bg-evidence-soft",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
                  {hypothesis.id}
                </span>
                <span className="text-[0.75rem] text-muted">{t(`fields.${hypothesis.field}`)}</span>
                <span
                  className={cn(
                    "text-[0.8125rem] font-medium",
                    open ? "text-muted" : "text-foreground-strong",
                  )}
                >
                  {open ? t("noCandidate") : hypothesis.value}
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-[0.625rem] uppercase tracking-[0.08em]",
                  open ? "text-abstain" : "text-corroborated",
                )}
              >
                {open ? t("decisions.abstain") : t("surviving")}
              </span>
            </div>

            {open ? (
              <p className="text-[0.75rem] leading-relaxed text-muted">{t("noCandidateBody")}</p>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="w-[5.5rem] shrink-0 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted-2">
                    {tCommon("confidence")}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong/30">
                    <span
                      className="block h-full rounded-full bg-corroborated"
                      style={{ width: `${(hypothesis.confidence ?? 0) * 100}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-muted">
                    {(hypothesis.confidence ?? 0).toFixed(2)}
                  </span>
                </div>
                <p className="flex flex-wrap items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted-2">
                  <span>{t("confirmedBy", { count: hypothesis.classes.length })}</span>
                  {hypothesis.classes.map((cls) => (
                    <span
                      key={cls}
                      className="rounded-[4px] border border-line px-1.5 py-px normal-case tracking-normal text-muted"
                    >
                      {t(`classes.${cls}`)}
                    </span>
                  ))}
                  <span className="text-corroborated">
                    · {t("objections", { count: hypothesis.objections })}
                  </span>
                </p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
