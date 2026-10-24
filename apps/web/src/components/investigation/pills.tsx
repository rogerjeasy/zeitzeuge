"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { QC_KEY, STATUS_KEY } from "./labels";

const PILL =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-medium uppercase tracking-[0.08em] whitespace-nowrap";

const STATUS_TONE = {
  accept: { bg: "bg-corroborated-soft", text: "text-corroborated", dot: "bg-corroborated" },
  review: { bg: "bg-review-soft", text: "text-review", dot: "bg-review" },
  undetermined: { bg: "bg-abstain-soft", text: "text-abstain", dot: "bg-abstain" },
} as const;

/** The rule's verdict for a whole row: übernahmefähig · Prüfbedarf · unbestimmt. */
export function StatusPill({ label, className }: { label: string | null; className?: string }) {
  const t = useTranslations("investigation");
  const key = label ? STATUS_KEY[label] : undefined;
  if (!key) {
    return (
      <span className={cn(PILL, "bg-surface-2 text-muted", className)}>
        <span aria-hidden className="size-1.5 rounded-full bg-line-strong" />
        {t("status.none")}
      </span>
    );
  }
  const tone = STATUS_TONE[key];
  return (
    <span className={cn(PILL, tone.bg, tone.text, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {t(`status.${key}`)}
    </span>
  );
}

const QC_TONE = {
  confirmed: "border-corroborated/40 text-corroborated",
  corrected: "border-evidence/40 text-evidence",
  open: "border-review/40 text-review",
  machine: "border-line-strong text-muted",
} as const;

/** Whether a human has looked: maschinell · geprüft · korrigiert · offen. */
export function QcPill({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("investigation");
  const key = QC_KEY[status] ?? "machine";
  return (
    <span className={cn(PILL, "border bg-surface", QC_TONE[key], className)}>
      {t("qcPrefix")} · {t(`qc.${key}`)}
    </span>
  );
}

/** A confidence figure coloured by the band it falls in — never by guesswork. */
export function ConfidenceFigure({
  value,
  decision,
  className,
}: {
  value: number | null;
  decision: string;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return <span className={cn("font-mono text-[0.6875rem] text-muted-2", className)}>—</span>;
  }
  const tone =
    decision === "emit"
      ? "text-corroborated"
      : decision === "emit_with_review"
        ? "text-review"
        : "text-abstain";
  return (
    <span className={cn("font-mono text-[0.6875rem] tabular-nums", tone, className)}>
      {value.toFixed(2)}
    </span>
  );
}
