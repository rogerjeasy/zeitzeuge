"use client";

import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { COLLECTIONS, PRESETS, type Actor, type Filters, type Preset } from "@/lib/data/history";
import { cn } from "@/lib/cn";

/**
 * Filters in one row above the trail, and sticky under the app header: the
 * question "show me only what a human did in the Goetz fonds" is asked halfway
 * down a fortnight, not at the top of it.
 */
export function TrailFilters({
  filters,
  onChange,
  shown,
  total,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  shown: number;
  total: number;
}) {
  const t = useTranslations("history");
  const dirty =
    filters.preset !== "all" ||
    filters.actor !== "all" ||
    filters.collection !== "all" ||
    filters.query !== "" ||
    filters.day !== null;

  return (
    <div // Sticky only where it stays one row. Below `lg` the controls wrap to three
    // or four rows, and pinning 150 px of chrome to the top of a phone costs
    // more of the trail than the filter is worth.
    className="z-20 -mx-4 flex flex-col gap-3 border-b border-line bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:sticky lg:top-14">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* kind presets */}
        <div
          role="group"
          aria-label={t("presets.all")}
          className="scrollbar-none -mx-1 flex max-w-full gap-1 overflow-x-auto px-1"
        >
          {PRESETS.map((preset: Preset) => {
            const active = filters.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ ...filters, preset })}
                aria-pressed={active}
                className={cn(
                  "h-8 shrink-0 rounded-lg border px-2.5 text-[0.75rem] font-medium transition-colors duration-150",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-line-strong text-muted hover:border-muted-2 hover:text-foreground",
                )}
              >
                {t(`presets.${preset}`)}
              </button>
            );
          })}
        </div>

        <label className="relative flex h-9 min-w-0 flex-1 basis-48 items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-2"
            strokeWidth={2}
          />
          <span className="sr-only">{t("filter.searchLabel")}</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder={t("filter.searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-2.5 text-[0.8125rem] text-foreground outline-none transition-colors placeholder:text-muted-2 focus-visible:border-evidence"
          />
        </label>

        <Select
          label={t("filter.actorLabel")}
          hideLabel
          className="w-[9.5rem] shrink-0"
          value={filters.actor}
          onChange={(event) => onChange({ ...filters, actor: event.target.value as Actor | "all" })}
          options={[
            { value: "all", label: t("filter.actorAll") },
            { value: "machine", label: t("filter.actorMachine") },
            { value: "human", label: t("filter.actorHuman") },
          ]}
        />

        <Select
          label={t("filter.collectionLabel")}
          hideLabel
          className="w-[11rem] shrink-0"
          value={filters.collection}
          onChange={(event) => onChange({ ...filters, collection: event.target.value })}
          options={[
            { value: "all", label: t("filter.collectionAll") },
            ...COLLECTIONS.map((name) => ({ value: name, label: name })),
          ]}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem] text-muted-2">
        <span aria-live="polite">{t("filter.showing", { shown, total })}</span>
        {dirty && (
          <button
            type="button"
            onClick={() => onChange({ preset: "all", actor: "all", collection: "all", query: "", day: null })}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X aria-hidden className="size-3" strokeWidth={2.2} />
            {t("filter.clear")}
          </button>
        )}
      </p>
    </div>
  );
}
