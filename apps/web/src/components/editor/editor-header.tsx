"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, CircleDot } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CaseFile } from "@/lib/data/editor";

/**
 * Who this record is, what produced it, and how far through it you are.
 *
 * The signature leads: it is the only identifier an archivist will quote in a
 * corridor, and it is what the browser tab carries too.
 */
export function EditorHeader({
  record,
  decided,
  total,
  locale,
}: {
  record: CaseFile;
  decided: number;
  total: number;
  locale: string;
}) {
  const t = useTranslations("editor");
  const tPhotos = useTranslations("archive.photos");

  const cost = new Intl.NumberFormat(locale === "de" ? "de-CH" : locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(record.runCostUsd);

  return (
    <header className="flex flex-col gap-3">
      <Link
        href="/queue"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-[0.75rem] text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-mono text-[clamp(1.0625rem,0.95rem+0.5vw,1.375rem)] font-medium leading-tight tracking-[-0.01em] text-foreground-strong">
            {record.signature}
          </h1>
          <p className="max-w-[68ch] text-[0.875rem] leading-snug text-muted">
            {tPhotos(record.photoKey)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[0.625rem] uppercase tracking-[0.08em]">
          <Chip label={record.collection} />
          <Chip label={t("version", { n: record.version })} />
          <Chip
            label={t("runMeta", {
              seconds: record.runSeconds,
              cost,
              run: record.runId,
            })}
          />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-evidence-soft px-2.5 py-1 text-evidence">
            <CircleDot aria-hidden className="size-3" strokeWidth={2.2} />
            {t("progress", { done: decided, total })}
          </span>
        </div>
      </div>
    </header>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-muted-2">
      {label}
    </span>
  );
}
