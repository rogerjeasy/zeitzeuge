"use client";

import { useTranslations } from "next-intl";
import { HYPOTHESES } from "@/lib/data/record";
import { cn } from "@/lib/cn";

/**
 * Prior → posterior for each competing hypothesis. The bar that collapses is
 * the point: the system generated four answers and the evidence killed three.
 */
export function HypothesesPanel({
  activeEvidence,
}: {
  activeEvidence: string | null;
}) {
  const t = useTranslations("ledger");

  return (
    <ul className="divide-y divide-line">
      {HYPOTHESES.map((hypothesis) => {
        const dead = hypothesis.posterior < 0.1;
        const highlighted =
          activeEvidence !== null && hypothesis.refutedBy === activeEvidence;

        return (
          <li
            key={hypothesis.id}
            className={cn(
              "flex flex-col gap-2.5 px-4 py-4 transition-colors duration-300 sm:px-5",
              highlighted && "bg-refuted-soft",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
                  {hypothesis.id}
                </span>
                <span
                  className={cn(
                    "text-[0.8125rem] font-medium",
                    dead ? "text-muted line-through decoration-refuted/60" : "text-foreground-strong",
                  )}
                >
                  {t(`hypotheses.${hypothesis.key}`)}
                </span>
              </div>
              <span
                className={cn(
                  "font-mono text-[0.625rem] uppercase tracking-[0.08em]",
                  dead ? "text-refuted" : "text-corroborated",
                )}
              >
                {dead ? t("refuted") : t("surviving")}
              </span>
            </div>

            {/* prior above, posterior below — the collapse is the story */}
            <div className="flex flex-col gap-1">
              <Bar
                label={t("prior")}
                value={hypothesis.prior}
                className="bg-muted-2/50"
              />
              <Bar
                label={t("posterior")}
                value={hypothesis.posterior}
                className={dead ? "bg-refuted" : "bg-corroborated"}
              />
            </div>

            {hypothesis.refutedBy && (
              <p className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-refuted">
                {t("refutedBy")} {hypothesis.refutedBy}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Bar({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[5.5rem] shrink-0 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted-2">
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong/30">
        <span
          className={cn("block h-full rounded-full", className)}
          style={{ width: `${Math.max(value * 100, 1.5)}%` }}
        />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-muted">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
