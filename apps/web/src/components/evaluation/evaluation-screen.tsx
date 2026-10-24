"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { ReliabilityChart } from "@/components/sections/calibration/reliability-chart";
import {
  EVAL_RUN,
  GOLD_SET,
  STRATA,
  meetsTarget,
  metric,
  photographs,
  pooled,
  type Stratum,
} from "@/lib/data/evaluation";
import { GoldSetPanel } from "./gold-set-panel";
import { MetricsTable } from "./metrics-table";
import { AblationTable } from "./ablation-table";
import { formatValue } from "./format";
import { cn } from "@/lib/cn";
import { QcPanel } from "@/components/investigation/qc-panel";
import { ExampleBanner } from "@/components/investigation/example-banner";
import type { QcView } from "@/lib/investigation/qc";

/**
 * The live accuracy dashboard (§9.2 #9).
 *
 * The one screen on which the product stops asserting and starts reporting.
 * Everything here is derived from one authored table of per-stratum results, so
 * a judge who narrows the set gets a page that recomputes honestly — including
 * the rows that then go red. That is the feature: a dashboard where nothing can
 * fail is a brochure.
 */
export function EvaluationScreen({ qc }: { qc: QcView }) {
  const t = useTranslations("evaluation");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const [strata, setStrata] = useState<Stratum[]>([...STRATA]);
  const whole = strata.length === STRATA.length;

  const shown = photographs(strata);
  const hallucination = useMemo(() => pooled(metric("hallucination"), strata), [strata]);
  const ece = useMemo(() => pooled(metric("ece"), strata), [strata]);

  /** The three the pitch leads with, beside the hero. */
  const supporting = (["municipality", "datingMae", "coverage"] as const).map((id) => {
    const m = metric(id);
    const value = pooled(m, strata);
    return { m, value, met: meetsTarget(m, value) };
  });

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
          {t("title")}
        </h1>
        <p className="max-w-[78ch] text-[0.875rem] leading-relaxed text-muted">{t("subtitle")}</p>
        <p className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
          {t("runMeta", {
            id: EVAL_RUN.id,
            images: EVAL_RUN.images,
            blind: Math.round(EVAL_RUN.blindShare * 100),
          })}
        </p>
      </header>

      {/* ── the Prio-1 QC panel: real when the archive has a batch ───────── */}
      <QcPanel qc={qc.qc} batchId={qc.batchId} example={qc.example} error={qc.error} />

      <ExampleBanner message={t("exampleNote")} />

      {/* ── the hero: one number, and why it is allowed to be zero ───────── */}
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-stretch">
        <div className="flex flex-col justify-center gap-3 rounded-[var(--radius-card)] border border-corroborated/30 bg-corroborated-soft/40 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-corroborated">
            <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.2} />
            {t("heroLabel")}
          </p>
          {/* the hero figure: sans, not the display serif, and the only one here */}
          <p className="font-sans text-[clamp(2.75rem,2rem+3vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-corroborated">
            {hallucination === null
              ? "—"
              : formatValue(hallucination, metric("hallucination").unit, intl)}
          </p>
          <p className="max-w-[46ch] text-[0.8125rem] leading-relaxed text-muted">
            {t("heroNote")}
          </p>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {supporting.map(({ m, value, met }) => (
            <div key={m.id} className="flex flex-col justify-center gap-1.5 bg-background p-4 sm:p-5">
              <dt className="text-[0.75rem] font-medium text-muted">{t(`metrics.${m.id}`)}</dt>
              <dd className="flex flex-col gap-1">
                <span
                  className={cn(
                    "font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em]",
                    met === false ? "text-refuted" : "text-foreground-strong",
                  )}
                >
                  {value === null ? "—" : formatValue(value, m.unit, intl)}
                </span>
                <span className="font-mono text-[0.625rem] tabular-nums text-muted-2">
                  {m.higherIsBetter ? "≥ " : "≤ "}
                  {formatValue(m.target, m.unit, intl)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── the stratum control, stated before anything it changes ───────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-line bg-surface-2/40 px-4 py-3">
        <p className="min-w-0 flex-1 basis-64 text-[0.75rem] leading-relaxed text-muted">
          {t("filterHint")}
        </p>
        <p aria-live="polite" className="font-mono text-[0.75rem] tabular-nums text-foreground-strong">
          {t("showing", { shown, total: GOLD_SET.total })}
        </p>
        {!whole && (
          <button
            type="button"
            onClick={() => setStrata([...STRATA])}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] text-foreground transition-colors hover:border-evidence hover:text-evidence"
          >
            <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
            {t("filterAll")}
          </button>
        )}
      </div>

      <GoldSetPanel selected={strata} onSelect={setStrata} />

      <MetricsTable strata={strata} />

      {/* ── calibration ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="calibration-heading"
        className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="calibration-heading"
            className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
          >
            {t("calibrationTitle")}
          </h2>
          <p className="max-w-[78ch] text-[0.75rem] leading-relaxed text-muted">
            {t("calibrationHint")}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <ReliabilityChart />

          <div className="flex flex-col gap-2 rounded-[0.625rem] border border-line bg-surface-2/40 p-4">
            <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
              {t("eceLabel")}
            </p>
            <p
              className={cn(
                "font-display text-[2rem] font-semibold leading-none tracking-[-0.03em]",
                meetsTarget(metric("ece"), ece) === false ? "text-refuted" : "text-foreground-strong",
              )}
            >
              {ece === null ? "—" : formatValue(ece, "ratio", intl)}
            </p>
            <p className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
              ≤ {formatValue(metric("ece").target, "ratio", intl)}
            </p>
            <p className="mt-1 border-t border-line pt-2 text-[0.75rem] leading-relaxed text-muted">
              {t("metrics.eceDef")}
            </p>
          </div>
        </div>
      </section>

      <AblationTable strata={strata} />
    </div>
  );
}
