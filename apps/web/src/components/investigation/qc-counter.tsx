import { useTranslations } from "next-intl";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { QcSummary } from "@/lib/api/investigation-types";

/** The dashboard's one-line Prio-1 QC counter; the full panel is on /evaluation. */
export function QcCounter({ qc }: { qc: QcSummary }) {
  const t = useTranslations("investigation.qcPanel");
  const parts = [
    { key: "processed", value: qc.processed },
    { key: "confirmed", value: qc.confirmed, tone: "text-corroborated" },
    { key: "corrected", value: qc.corrected, tone: "text-evidence" },
    { key: "open", value: qc.open, tone: "text-review" },
    { key: "machine", value: qc.machine },
  ];

  return (
    <section
      aria-label={t("counterLabel")}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3"
    >
      <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground-strong">
        <ClipboardCheck aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />
        {t("counterTitle", { batch: qc.batch ?? "—", total: qc.total })}
      </p>
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
        {parts.map((p) => (
          <div key={p.key} className="flex items-baseline gap-1">
            <dd className={`font-mono font-medium tabular-nums ${p.tone ?? "text-foreground"}`}>{p.value}</dd>
            <dt className="text-muted">{t(`tiles.${p.key}`)}</dt>
          </div>
        ))}
      </dl>
      <Link
        href="/evaluation"
        className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[0.75rem] font-medium text-evidence hover:underline"
      >
        {t("counterCta")}
        <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
      </Link>
    </section>
  );
}
