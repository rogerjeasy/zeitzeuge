"use client";

import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, MapPinOff } from "lucide-react";
import { parseSubjectPoint, swisstopoEmbedUrl, swisstopoOpenUrl } from "@/lib/investigation/geo";
import type { CaseField } from "@/lib/api/investigation-types";

/**
 * The record's subject point (`subject_point`, LV95) on the swisstopo map
 * (spec §4). Lazy, fixed 4:3 frame, titled for screen readers, with the full
 * viewer one link away. Without a point: says so, never an empty frame.
 */
export function SubjectMap({ field }: { field: CaseField | undefined }) {
  const t = useTranslations("investigation.review");
  const locale = useLocale();
  const point = parseSubjectPoint(field);

  return (
    <section
      aria-labelledby="subject-map-heading"
      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h2 id="subject-map-heading" className="font-display text-[1.0625rem] text-foreground-strong">
          {t("mapTitle")}
        </h2>
        {point && (
          <span className="font-mono text-[0.6875rem] tabular-nums text-muted">
            LV95 {point.e} / {point.n}
          </span>
        )}
      </header>
      {point ? (
        <>
          <div className="aspect-[4/3] w-full bg-surface-2">
            <iframe
              src={swisstopoEmbedUrl(point, locale)}
              title={t("mapFrameTitle", { e: point.e, n: point.n })}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="size-full border-0"
            />
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[0.75rem]">
            {field?.explanation && <span className="min-w-0 text-muted">{field.explanation}</span>}
            <a
              href={swisstopoOpenUrl(point, locale)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md font-medium text-evidence underline-offset-2 hover:underline"
            >
              {t("mapOpen")}
              <ExternalLink aria-hidden className="size-3.5" strokeWidth={2} />
              <span className="sr-only">{t("newTab")}</span>
            </a>
          </p>
        </>
      ) : (
        <p className="flex items-center gap-2 px-4 py-5 text-[0.8125rem] text-muted">
          <MapPinOff aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          {t("noPoint")}
        </p>
      )}
    </section>
  );
}
