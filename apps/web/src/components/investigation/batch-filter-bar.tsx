"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import {
  QC_FILTERS,
  SORT_KEYS,
  STATUS_FILTERS,
  isDefaultFilter,
  type BatchFilter,
  type FacetCounts,
  type QcFilter,
  type SortKey,
  type StatusFilter,
} from "@/lib/investigation/batch-filter";
import { cn } from "@/lib/cn";

/**
 * Status and QC chips with live counts, a file-name search and the sort
 * (spec §4). Stateless: the screen owns the filter and mirrors it into the
 * URL. Chips are toggle buttons (`aria-pressed`) in a labelled group, so a
 * screen reader hears «Prüfbedarf, 12, gedrückt».
 */
export function BatchFilterBar({
  filter,
  counts,
  onChange,
  onReset,
  shown,
  className,
}: {
  filter: BatchFilter;
  counts: FacetCounts;
  onChange: (next: BatchFilter) => void;
  onReset: () => void;
  /** How many rows the filter shows, announced politely. */
  shown: number;
  className?: string;
}) {
  const t = useTranslations("investigation.filter");
  const searchId = useId();
  const sortId = useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface px-3.5 py-3", className)}>
      <ChipGroup
        label={t("statusLabel")}
        options={STATUS_FILTERS}
        value={filter.status}
        counts={counts.status}
        text={(k) => t(`status.${k}`)}
        onSelect={(status) => onChange({ ...filter, status: status as StatusFilter })}
      />
      <ChipGroup
        label={t("qcLabel")}
        options={QC_FILTERS}
        value={filter.qc}
        counts={counts.qc}
        text={(k) => t(`qc.${k}`)}
        onSelect={(qc) => onChange({ ...filter, qc: qc as QcFilter })}
      />
      <div className="flex min-w-0 flex-wrap items-end gap-2.5">
        <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1">
          <label htmlFor={searchId} className="text-[0.6875rem] text-muted">
            {t("searchLabel")}
          </label>
          <span className="relative flex min-w-0 items-center">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-muted-2" strokeWidth={2} />
            <input
              id={searchId}
              type="search"
              value={filter.q}
              maxLength={120}
              placeholder={t("searchPlaceholder")}
              onChange={(e) => onChange({ ...filter, q: e.target.value })}
              className="h-9 w-full min-w-0 rounded-lg border border-line-strong bg-background pl-8 pr-2.5 font-mono text-[0.8125rem] text-foreground outline-none placeholder:text-muted-2 focus-visible:border-evidence"
            />
          </span>
        </div>
        <div className="flex min-w-0 flex-[0_1_13rem] flex-col gap-1">
          <label htmlFor={sortId} className="text-[0.6875rem] text-muted">
            {t("sortLabel")}
          </label>
          <select
            id={sortId}
            value={filter.sort}
            onChange={(e) => onChange({ ...filter, sort: e.target.value as SortKey })}
            className="h-9 w-full min-w-0 rounded-lg border border-line-strong bg-background px-2 text-[0.8125rem] text-foreground focus-visible:border-evidence"
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`sort.${k}`)}
              </option>
            ))}
          </select>
        </div>
        {!isDefaultFilter(filter) && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2} />
            {t("reset")}
          </button>
        )}
        <p aria-live="polite" className="ml-auto self-center font-mono text-[0.6875rem] tabular-nums text-muted">
          {t("shown", { count: shown })}
        </p>
      </div>
    </div>
  );
}

function ChipGroup<K extends string>({
  label,
  options,
  value,
  counts,
  text,
  onSelect,
}: {
  label: string;
  options: readonly K[];
  value: K;
  counts: Record<K, number>;
  text: (key: K) => string;
  onSelect: (key: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span aria-hidden className="mr-1 w-full font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2 sm:w-auto">
        {label}
      </span>
      {options.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(key)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-line-strong bg-surface text-foreground hover:border-evidence hover:text-evidence",
            )}
          >
            {text(key)}
            <span
              className={cn(
                "font-mono text-[0.625rem] tabular-nums",
                active ? "text-background/80" : "text-muted",
              )}
            >
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
