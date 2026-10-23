"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Timer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Fonds, FondsStats } from "@/lib/data/collections";
import { DecadeTimeline } from "./decade-timeline";
import { PlaceDistribution } from "./place-distribution";
import { SeriesPanel } from "./series-panel";

/**
 * One fonds (§9.2 #8).
 *
 * The identity block is ISAD(G) in ISAD(G)'s own order — reference code,
 * title, dates, extent, creator, scope — because that is the order the
 * archivist's finding aid uses and this screen is read beside it, not instead
 * of it. Everything below the fold is ours: when, where, and what clusters.
 */
export function FondsScreen({ fonds, stats }: { fonds: Fonds; stats: FondsStats }) {
  const t = useTranslations("collections");
  const tDetail = useTranslations("collections.detail");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const number = (value: number) => new Intl.NumberFormat(intl).format(value);

  const period = `${fonds.findingAid.circa ? `${t("circa")} ` : ""}${fonds.findingAid.from}–${fonds.findingAid.to}`;
  const extent = t(`extent.${fonds.extentUnit}`, { count: fonds.extent, formatted: number(fonds.extent) });
  const coverage = stats.described / fonds.extent;

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/collections"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-[0.75rem] text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
        {tDetail("back")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-2">
            {fonds.reference}
          </span>
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {fonds.name}
          </h1>
          <p className="max-w-[72ch] text-[0.875rem] leading-relaxed text-muted">
            {t(`fonds.${fonds.scopeKey}`)}
          </p>
        </div>

        {fonds.cover.length > 0 && (
          <div className="flex gap-px overflow-hidden rounded-[var(--radius-card)] bg-line">
            {fonds.cover.map((src, i) => (
              <figure key={src} className={`relative h-28 min-w-0 flex-1 sm:h-36 ${i > 1 ? "hidden sm:block" : ""}`}>
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 27vw"
                  priority
                  className="photo-archival object-cover"
                />
              </figure>
            ))}
          </div>
        )}
      </header>

      {/* ── ISAD(G) identity, in ISAD(G) order ───────────────────────────── */}
      <section
        aria-labelledby="identity-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
      >
        <h2
          id="identity-heading"
          className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2"
        >
          {tDetail("identity")}
        </h2>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field tag="3.1.1" label={tDetail("reference")} value={fonds.reference} mono />
          <Field tag="3.1.3" label={tDetail("periodLabel")} value={period} mono />
          <Field tag="3.1.5" label={tDetail("extentLabel")} value={extent} />
          {fonds.creator ? (
            <Field
              tag="3.2.1"
              label={tDetail("creator")}
              value={`${fonds.creator}${fonds.creatorDates ? ` (${fonds.creatorDates})` : ""}`}
            />
          ) : (
            <Field
              tag="—"
              label={tDetail("describedLabel")}
              value={`${number(stats.described)} · ${Math.round(coverage * 100)} %`}
              mono
            />
          )}
        </dl>
      </section>

      {/* ── coverage ─────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="coverage-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="flex flex-col gap-1">
            <h2
              id="coverage-heading"
              className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
            >
              {tDetail("coverageTitle")}
            </h2>
            <p className="max-w-[70ch] text-[0.75rem] leading-snug text-muted">
              {tDetail("coverageHint", {
                extent,
                described: number(stats.described),
                approved: number(stats.approved),
              })}
            </p>
          </div>
          <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] tabular-nums text-muted-2">
            <Timer aria-hidden className="size-3.5" strokeWidth={1.9} />
            {tDetail("medianSeconds", { seconds: stats.medianSeconds })}
          </p>
        </div>

        {/* approved inside described inside the fonds — one bar, three steps */}
        <span aria-hidden className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
          <span
            className="h-full bg-corroborated"
            style={{ width: `${(stats.approved / fonds.extent) * 100}%` }}
          />
          <span
            className="h-full bg-evidence"
            style={{ width: `${((stats.described - stats.approved) / fonds.extent) * 100}%` }}
          />
        </span>

        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.75rem]">
          <Key tone="bg-corroborated" label={t("stats.approved")} value={number(stats.approved)} />
          <Key tone="bg-evidence" label={t("stats.described")} value={number(stats.described)} />
          <Key tone="bg-surface-2 ring-1 ring-inset ring-line-strong" label={tDetail("remaining")} value={number(fonds.extent - stats.described)} />
          <Key tone="bg-abstain" label={tDetail("placesUnknown")} value={number(stats.placeUnknown)} />
        </ul>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <DecadeTimeline fonds={fonds} stats={stats} />
        <PlaceDistribution stats={stats} />
      </div>

      <SeriesPanel stats={stats} />
    </div>
  );
}

function Field({
  tag,
  label,
  value,
  mono,
}: {
  tag: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="flex items-baseline gap-1.5">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
          {tag}
        </span>
        <span className="text-[0.75rem] text-muted">{label}</span>
      </dt>
      <dd
        className={`min-w-0 break-words text-[0.875rem] text-foreground-strong ${mono ? "font-mono text-[0.8125rem] tabular-nums" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Key({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={`size-2.5 rounded-[2px] ${tone}`} />
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular-nums text-foreground-strong">{value}</span>
    </li>
  );
}
