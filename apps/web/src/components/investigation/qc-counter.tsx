import { useTranslations } from "next-intl";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { QcView } from "@/lib/investigation/qc";
import { cn } from "@/lib/cn";

/** The dashboard's one-line Prio-1 QC counter; the full panel is on /evaluation. */
export function QcCounter({ view }: { view: QcView }) {
  const t = useTranslations("investigation.qcPanel");
  const { qc, example } = view;
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
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border bg-surface px-4 py-3",
        example ? "border-dashed border-line-strong" : "border-line",
      )}
    >
      <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground-strong">
        <ClipboardCheck aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />
        {t("counterTitle", { batch: qc.batch ?? "—", total: qc.total })}
        {example && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted">
            {t("exampleTag")}
          </span>
        )}
      </p>
      <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
        {parts.map((p) => (
          <div key={p.key} className="flex items-baseline gap-1">
            <dd className={cn("font-mono tabular-nums font-medium", p.tone ?? "text-foreground")}>{p.value}</dd>
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
