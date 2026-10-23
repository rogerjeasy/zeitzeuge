"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Table2, X } from "lucide-react";
import type { BandDay } from "@/lib/data/history";
import { cn } from "@/lib/cn";

/**
 * Fourteen days of the trail, stacked by who acted.
 *
 * Machine below, human above, in the two validated chart hues — the one
 * comparison the screen exists to make, so it is the only thing encoded. The
 * columns are also the day filter: an audit trail is almost always read as
 * "what happened on the day the complaint is about".
 *
 * Every day is drawn, including the empty weekends. Dropping them would make
 * the fortnight look busier than it was, which is the one lie a chart of an
 * audit trail must not tell.
 */
export function ActivityBand({
  days,
  selected,
  onSelect,
}: {
  days: BandDay[];
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const t = useTranslations("history.band");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const tableId = useId();

  const [hovered, setHovered] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const peak = Math.max(...days.map((d) => d.total), 1);
  const active = hovered ?? selected;
  const shown = days.find((d) => d.day === active);
  const whole = days.reduce(
    (sum, d) => ({ machine: sum.machine + d.machine, human: sum.human + d.human, total: sum.total + d.total }),
    { machine: 0, human: 0, total: 0 },
  );

  const weekday = (day: string) =>
    new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );
  const full = (day: string) =>
    new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );

  return (
    <section
      aria-labelledby="band-heading"
      className="flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="band-heading"
            className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
          >
            {t("title")}
          </h2>
          <p className="text-[0.75rem] leading-snug text-muted">{t("hint")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* A legend, not colour alone — two series always get one. */}
          <ul className="flex items-center gap-3 text-[0.6875rem] text-muted">
            {(["machine", "human"] as const).map((series) => (
              <li key={series} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-[2px]"
                  style={{ background: series === "machine" ? "var(--chart-1)" : "var(--chart-2)" }}
                />
                {t(series)}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
            aria-controls={tableId}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[0.6875rem] text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Table2 aria-hidden className="size-3.5" strokeWidth={1.9} />
            {t("tableToggle")}
          </button>
        </div>
      </div>

      {/* readout — one reading line rather than a value on every column */}
      <p aria-live="polite" className="min-h-[1.25rem] text-[0.75rem] text-muted">
        {shown ? (
          <>
            <span className="font-medium text-foreground-strong">{full(shown.day)}</span>
            {" · "}
            {t("events", { count: shown.total })}
            {shown.total > 0 && (
              <span className="text-muted-2">
                {" · "}
                {shown.machine} {t("machine")} · {shown.human} {t("human")}
              </span>
            )}
          </>
        ) : (
          <>
            {t("events", { count: whole.total })}
            <span className="text-muted-2">
              {" · "}
              {whole.machine} {t("machine")} · {whole.human} {t("human")}
            </span>
          </>
        )}
      </p>

      <div className="relative flex items-end gap-[3px] border-b border-line-strong/60 sm:gap-1.5">
        {days.map((day) => {
          const isSelected = selected === day.day;
          const height = (day.total / peak) * 100;
          // Columns are capped so the band never becomes a wall of ink, and the
          // leftover width stays as air between them.
          return (
            <button
              key={day.day}
              type="button"
              onClick={() => onSelect(isSelected ? null : day.day)}
              onMouseEnter={() => setHovered(day.day)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(day.day)}
              onBlur={() => setHovered(null)}
              aria-pressed={isSelected}
              title={`${full(day.day)} — ${day.total}`}
              className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md pb-0.5 pt-2"
            >
              <span className="flex h-24 w-full max-w-6 items-end justify-center sm:h-28">
                <span
                  className={cn(
                    "flex w-full flex-col justify-end overflow-hidden transition-[height,opacity] duration-300",
                    "[transition-timing-function:var(--ease-archival)]",
                    active && active !== day.day && "opacity-60",
                  )}
                  style={{ height: `${Math.max(height, day.total ? 6 : 2)}%` }}
                >
                  {day.human > 0 && (
                    <span
                      className="w-full rounded-t-[4px]"
                      style={{
                        background: "var(--chart-2)",
                        flexGrow: day.human,
                        // the 2px surface gap that separates the two segments
                        marginBottom: day.machine > 0 ? 2 : 0,
                      }}
                    />
                  )}
                  {day.machine > 0 && (
                    <span
                      className={cn("w-full", day.human === 0 && "rounded-t-[4px]")}
                      style={{ background: "var(--chart-1)", flexGrow: day.machine }}
                    />
                  )}
                  {day.total === 0 && (
                    <span className="h-px w-full rounded-full bg-line-strong/50" />
                  )}
                </span>
              </span>

              <span
                className={cn(
                  "w-full truncate text-center font-mono text-[0.5625rem] uppercase tracking-[0.04em] transition-colors",
                  isSelected
                    ? "text-evidence"
                    : "text-muted-2 group-hover:text-foreground",
                )}
              >
                {weekday(day.day)}
              </span>
              <span
                aria-hidden
                className={cn(
                  "h-[2px] w-5 rounded-full transition-colors",
                  isSelected ? "bg-evidence" : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>

      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="inline-flex h-8 w-fit items-center gap-1.5 self-start rounded-lg border border-line px-2.5 text-[0.75rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2} />
          {t("clearDay")}
        </button>
      )}

      {/* the table view, so nothing is gated behind colour or hover */}
      {showTable && (
        <div id={tableId} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[22rem] border-collapse text-[0.75rem]">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                <th scope="col" className="px-2.5 py-1.5 font-normal">{t("tableDay")}</th>
                <th scope="col" className="px-2.5 py-1.5 text-right font-normal">{t("machine")}</th>
                <th scope="col" className="px-2.5 py-1.5 text-right font-normal">{t("human")}</th>
                <th scope="col" className="px-2.5 py-1.5 text-right font-normal">{t("tableTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.map((day) => (
                <tr key={day.day} className="text-muted">
                  <th scope="row" className="px-2.5 py-1.5 text-left font-normal text-foreground">
                    {full(day.day)}
                  </th>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{day.machine}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{day.human}</td>
                  <td className="px-2.5 py-1.5 text-right font-medium tabular-nums text-foreground">
                    {day.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
