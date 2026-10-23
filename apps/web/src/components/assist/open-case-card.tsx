"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Eye, HelpCircle, MinusCircle } from "lucide-react";
import { tipsFor, type OpenCase } from "@/lib/data/assist";

/**
 * One unsolved record, as the public sees it.
 *
 * It leads with what the pipeline *did* establish. Publishing only the gap
 * would be asking a resident to start from nothing, and the fields we are sure
 * of are exactly what lets someone recognise the place at a glance.
 */
export function OpenCaseCard({ item }: { item: OpenCase }) {
  const t = useTranslations("assist");
  const tFields = useTranslations("ledger.fields");
  const tPhotos = useTranslations("archive.photos");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const number = (v: number) => new Intl.NumberFormat(intl).format(v);

  const tips = tipsFor(item.id);

  return (
    <li className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <figure className="relative aspect-[3/2] w-full bg-surface-2">
        <Image
          src={item.src}
          alt={tPhotos(item.photoKey)}
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
          className="photo-archival object-cover"
        />
      </figure>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-2">
            {item.signature}
          </span>
          <p className="flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-foreground">
            <HelpCircle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-evidence" strokeWidth={2} />
            {t(`cases.${item.key}`)}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("knownLabel")}
          </span>
          <ul className="flex flex-col gap-1">
            {item.known.map((field) => (
              <li key={field.fieldKey} className="flex flex-wrap items-baseline gap-x-2 text-[0.75rem]">
                <span className="text-muted">{tFields(field.fieldKey)}</span>
                <span className="min-w-0 text-foreground-strong">{field.value}</span>
                <span className="font-mono text-[0.625rem] tabular-nums text-muted-2">
                  {field.confidence.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-abstain">
            {t("missingLabel")}
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {item.missing.map((key) => (
              <li
                key={key}
                className="inline-flex items-center gap-1 rounded-full bg-abstain-soft px-2 py-0.5 text-[0.6875rem] text-abstain"
              >
                <MinusCircle aria-hidden className="size-3" strokeWidth={2} />
                {tFields(key)}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line pt-2.5 font-mono text-[0.625rem] tabular-nums text-muted-2">
          <span className="inline-flex items-center gap-1">
            <Eye aria-hidden className="size-3" strokeWidth={2} />
            {t("viewsLabel", { count: number(item.views) })}
          </span>
          <span aria-hidden>·</span>
          <span>{t("publishedAgo", { days: item.publishedDaysAgo })}</span>
          <span aria-hidden>·</span>
          <span className={tips.length > 0 ? "text-evidence" : undefined}>
            {t("tipCount", { count: tips.length })}
          </span>
        </p>
      </div>
    </li>
  );
}
