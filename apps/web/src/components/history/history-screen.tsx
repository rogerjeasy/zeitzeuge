"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Download, FileJson, FileSpreadsheet, ScrollText } from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import {
  DEMO_TODAY,
  EVENTS,
  NO_FILTERS,
  activityBand,
  filterEvents,
  groupByDay,
  summarise,
  toCsv,
  type Filters,
} from "@/lib/data/history";
import { ActivityBand } from "./activity-band";
import { TrailFilters } from "./trail-filters";
import { EventRow } from "./event-row";

const STAT_IDS = ["events", "approved", "overrides", "held"] as const;

/**
 * The audit trail (§17: "audit trail, no lock-in, exportable").
 *
 * The editor answers "who said this?" for one field. This screen answers it for
 * the archive — and it is the screen a cantonal IT governance function reads
 * before it says yes, which is why the trail can leave as a file and why the
 * machine/human split is the first thing the eye lands on.
 */
export function HistoryScreen() {
  const t = useTranslations("history");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const shown = useMemo(() => filterEvents(EVENTS, filters), [filters]);
  const grouped = useMemo(() => groupByDay(shown), [shown]);
  // The band always plots the whole fortnight: it is the map you filter *with*,
  // so redrawing it from the filtered set would delete the days you might go to.
  const band = useMemo(() => activityBand(EVENTS), []);
  const totals = useMemo(() => summarise(EVENTS), []);

  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(intl, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00Z`));

  function download(kind: "csv" | "json") {
    const body = kind === "csv" ? toCsv(shown) : JSON.stringify(shown, null, 2);
    const blob = new Blob([body], {
      type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zeitzeuge-audit-trail.${kind}`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(kind);
  }

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("title")}
          </h1>
          <p className="max-w-[76ch] text-[0.875rem] leading-relaxed text-muted">
            {t("subtitle")}
          </p>
        </div>

        <Menu
          label={t("exportTrail.label")}
          trigger={({ toggle, open, ...aria }) => (
            <button
              type="button"
              data-menu-trigger
              onClick={toggle}
              {...aria}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line-strong bg-surface/70 px-4 text-[0.8125rem] font-medium text-foreground transition-colors duration-200 hover:border-evidence hover:text-evidence"
            >
              <Download aria-hidden className="size-4" strokeWidth={1.9} />
              {t("exportTrail.label")}
              <ChevronDown
                aria-hidden
                className={`size-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                strokeWidth={2}
              />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuLabel>{t("filter.showing", { shown: shown.length, total: totals.events })}</MenuLabel>
              <MenuItem
                icon={<FileSpreadsheet aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />}
                onClick={() => {
                  download("csv");
                  close();
                }}
              >
                {t("exportTrail.csv")}
              </MenuItem>
              <MenuItem
                icon={<FileJson aria-hidden className="size-4 text-muted-2" strokeWidth={1.9} />}
                onClick={() => {
                  download("json");
                  close();
                }}
              >
                {t("exportTrail.json")}
              </MenuItem>
            </>
          )}
        </Menu>
      </header>

      {downloaded && (
        <p
          aria-live="polite"
          className="w-fit rounded-lg bg-corroborated-soft px-3 py-1.5 text-[0.75rem] text-corroborated"
        >
          {t("exportTrail.done", { format: t(`exportTrail.${downloaded}` as "exportTrail.csv") })}
        </p>
      )}

      {/*
        The chart and the four numbers are one reading: the summary says what
        the fortnight came to, the band says how it was distributed and is the
        control you filter with. Side by side above 1280 px so neither costs a
        scroll; stacked below, chart first, because the chart is also the filter.
      */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ActivityBand
          days={band}
          selected={filters.day}
          onSelect={(day) => setFilters((f) => ({ ...f, day }))}
        />

        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2">
          {STAT_IDS.map((id) => (
            <div key={id} className="flex flex-col gap-1.5 bg-background p-4 sm:p-5">
              <dt className="text-[0.75rem] font-medium text-muted">{t(`stats.${id}`)}</dt>
              <dd className="flex flex-col gap-1">
                <span className="font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em] text-foreground-strong">
                  {new Intl.NumberFormat(intl).format(totals[id])}
                </span>
                <span className="text-[0.6875rem] leading-snug text-muted-2">
                  {t(`stats.${id}Hint`)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <TrailFilters
        filters={filters}
        onChange={setFilters}
        shown={shown.length}
        total={totals.events}
      />

      {grouped.length > 0 ? (
        <div className="flex flex-col">
          {grouped.map(({ day, items }) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2
                id={`day-${day}`}
                className="z-10 -mx-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 bg-background px-1 py-2 lg:sticky lg:top-[9.5rem]"
              >
                {day === DEMO_TODAY && (
                  <span className="rounded-full bg-evidence-soft px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-evidence">
                    {t("today")}
                  </span>
                )}
                <span className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
                  {dayLabel(day)}
                </span>
                <span className="font-mono text-[0.625rem] text-muted-2">
                  {t("band.events", { count: items.length })}
                </span>
              </h2>

              <ol className="flex flex-col pt-1">
                {items.map((event, i) => (
                  <EventRow key={event.id} event={event} last={i === items.length - 1} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2/40 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-surface text-muted-2">
            <ScrollText aria-hidden className="size-6" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-foreground-strong">
              {t("empty.title")}
            </h2>
            <p className="max-w-[48ch] text-[0.875rem] leading-relaxed text-muted">
              {t("empty.body", { total: totals.events })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilters(NO_FILTERS)}
            className="inline-flex h-10 items-center rounded-xl border border-line-strong bg-surface px-4 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
          >
            {t("empty.action")}
          </button>
        </div>
      )}
    </div>
  );
}
