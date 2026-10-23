"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PANEL_INTERVAL, PANEL_PROCESSED_TODAY, PANEL_RECORDS } from "@/lib/data/auth-panel";
import { ConfidenceMeter, DecisionPill } from "@/components/ui/confidence";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/cn";

/**
 * The panel beside the form: a catalogue record resolving, field by field, on a
 * slow loop. It is the product's argument continuing while the visitor signs in
 * — and it ends on an abstention every time, because that is the claim the
 * system is actually making.
 *
 * Decorative: `aria-hidden`, so assistive technology goes straight to the form
 * rather than through a rotating carousel of text it did not ask for.
 */
export function AuthPanel() {
  const t = useTranslations("auth.panel");
  const tFields = useTranslations("ledger.fields");
  const tDecisions = useTranslations("ledger.decisions");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % PANEL_RECORDS.length),
      PANEL_INTERVAL,
    );
    return () => clearInterval(id);
  }, [reduced]);

  const record = PANEL_RECORDS[index];
  const processed = new Intl.NumberFormat(locale === "de" ? "de-CH" : locale)
    .format(PANEL_PROCESSED_TODAY);

  return (
    <aside
      aria-hidden
      className="relative hidden h-full overflow-hidden bg-ink-panel text-ink-panel-fg lg:block"
    >
      {/* the same contour field as the landing hero, so the two read as one product */}
      <div className="pointer-events-none absolute inset-0">
        <svg
          className="absolute -right-20 top-0 h-[42rem] w-[52rem] text-ink-panel-fg/[0.05]"
          viewBox="0 0 800 560"
          fill="none"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M-40 ${150 + i * 32} C 120 ${90 + i * 32}, 210 ${215 + i * 28}, 330 ${170 + i * 30} S 540 ${60 + i * 34}, 700 ${140 + i * 31} S 830 ${210 + i * 29}, 900 ${180 + i * 30}`}
              stroke="currentColor"
              strokeWidth="1.15"
            />
          ))}
        </svg>
        <div className="texture-grain absolute inset-0 opacity-30" />
      </div>

      <div className="relative flex h-full flex-col justify-between gap-8 p-8 xl:p-12">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-panel-muted">
            <span className="relative flex size-1.5">
              <span
                className={cn(
                  "absolute inline-flex size-full rounded-full bg-corroborated",
                  !reduced && "animate-ping opacity-60",
                )}
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-corroborated" />
            </span>
            {t("label")}
          </p>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-panel-muted">
            <span className="text-ink-panel-fg">{processed}</span> {t("processed")}
          </p>
        </div>

        {/* the record — keyed so each rotation replays the stagger */}
        <div key={index} className="flex min-h-0 flex-1 flex-col justify-center gap-5">
          <figure className="overflow-hidden rounded-lg border border-ink-panel-line shadow-lift">
            <div className="relative h-[clamp(12rem,34vh,22rem)] w-full">
              <Image
                src={record.photo.src}
                alt=""
                fill
                // The first record is the largest element on the page, so it is
                // the LCP candidate and must not lazy-load. Later rotations are
                // well past first paint and stay lazy.
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                sizes="(max-width: 1279px) 46vw, 40vw"
                className={cn(
                  "photo-archival object-cover object-[50%_32%]",
                  !reduced && "[animation:rise-in_700ms_var(--ease-archival)_both]",
                )}
              />
              <span className="absolute left-2 top-2 rounded-[4px] bg-[#061320]/75 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-[#cfe3f2] backdrop-blur-sm">
                {tCommon("signature")} {record.photo.signature}
              </span>
            </div>
          </figure>

          <dl className="flex flex-col divide-y divide-ink-panel-line/70">
            {record.fields.map((field, i) => (
              <div
                key={field.key}
                className={cn(
                  "flex flex-col gap-1.5 py-2.5",
                  !reduced && "[animation:rise-in_600ms_var(--ease-archival)_both]",
                )}
                style={reduced ? undefined : { animationDelay: `${320 + i * 260}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[0.75rem] text-ink-panel-muted">
                    {tFields(field.key)}
                  </dt>
                  <DecisionPill
                    decision={field.decision}
                    label={tDecisions(field.decision)}
                  />
                </div>
                <dd className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "min-w-0 truncate text-[0.875rem]",
                      field.value
                        ? "font-display font-semibold tracking-[-0.01em] text-ink-panel-fg"
                        : "text-ink-panel-muted",
                    )}
                  >
                    {field.value ?? "—"}
                  </span>
                  {field.confidence !== undefined && (
                    <ConfidenceMeter
                      value={field.confidence}
                      decision={field.decision}
                      label={tCommon("confidence")}
                    />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-4">
          <p className="max-w-[34ch] font-display text-[0.9375rem] italic leading-snug text-ink-panel-body [hyphens:none]">
            {t("caption")}
          </p>
          {/* which record is showing */}
          <div className="flex gap-1.5">
            {PANEL_RECORDS.map((r, i) => (
              <span
                key={r.photo.key}
                className={cn(
                  "h-0.5 w-7 rounded-full transition-colors duration-500",
                  i === index ? "bg-ink-panel-fg" : "bg-ink-panel-line",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
