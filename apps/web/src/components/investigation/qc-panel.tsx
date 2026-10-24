import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RANKED_FIELD_KEYS, type QcSummary } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { intlLocale } from "./labels";

/**
 * The Prio-1 QC panel (§2.4): how many photographs a human has looked at, and
 * how often the human overrode the machine, per ranked field. Real data from
 * `GET /batches/{id}/qc` only; the screens show an empty state when there is
 * no batch.
 */
export function QcPanel({ qc, batchId }: { qc: QcSummary; batchId: string | null }) {
  const t = useTranslations("investigation.qcPanel");
  const tf = useTranslations("investigation.fields");
  const intl = intlLocale(useLocale());
  const pct = (v: number) =>
    new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(v);

  const tiles = [
    { key: "total", value: qc.total },
    { key: "processed", value: qc.processed },
    { key: "confirmed", value: qc.confirmed, tone: "text-corroborated" },
    { key: "corrected", value: qc.corrected, tone: "text-evidence" },
    { key: "open", value: qc.open, tone: "text-review" },
    { key: "machine", value: qc.machine },
  ];

  return (
    <section
      aria-labelledby="qc-heading"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="qc-heading"
            className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
          >
            {t("title", { batch: qc.batch ?? "—" })}
          </h2>
          <p className="max-w-[78ch] text-[0.75rem] leading-relaxed text-muted">{t("hint")}</p>
        </div>
        {batchId && (
          <Link
            href={`/batches/${batchId}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
          >
            {t("open")}
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
          </Link>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[0.625rem] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex min-w-0 flex-col gap-1 bg-background px-3 py-3">
            <dt className="truncate text-[0.6875rem] text-muted">{t(`tiles.${tile.key}`)}</dt>
            <dd
              className={cn(
                "font-display text-[1.5rem] font-semibold leading-none tabular-nums tracking-[-0.02em]",
                tile.tone ?? "text-foreground-strong",
              )}
            >
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
          {t("overrideTitle")}
        </p>
        <ul className="flex flex-col gap-1.5">
          {RANKED_FIELD_KEYS.map((key) => {
            const rate = qc.overrideRate[key] ?? null;
            return (
              <li key={key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-[0.75rem]">
                <span className="truncate text-foreground">{tf(key)}</span>
                <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-line-strong/40">
                  {rate !== null && (
                    <span className="block h-full rounded-full bg-evidence" style={{ width: `${Math.min(rate, 1) * 100}%` }} />
                  )}
                </span>
                <span className="text-right font-mono tabular-nums text-muted">
                  {rate === null ? t("notMeasured") : pct(rate)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[0.6875rem] text-muted-2">{t("overrideHint")}</p>
      </div>
    </section>
  );
}
