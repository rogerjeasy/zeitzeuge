"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FilterX } from "lucide-react";
import type { BatchAsset } from "@/lib/api/investigation-types";
import {
  QUEUE_DEFAULT_FILTER,
  applyFilter,
  facetCounts,
  filterParams,
  type BatchFilter,
} from "@/lib/investigation/batch-filter";
import { reviewHref } from "@/lib/investigation/review-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { BatchAssetRow } from "./batch-asset-row";
import { BatchFilterBar } from "./batch-filter-bar";

export type QueueItem = { asset: BatchAsset; batchId: string; batchLabel: string | null };

/**
 * The review list with the batch view's Status / QC / search filters, kept
 * in the URL. «Prüfen» carries `from=queue` and the filter, so J/K on the
 * review screen walks exactly this list.
 */
export function QueueView({
  items,
  initialFilter,
  heading,
}: {
  items: QueueItem[];
  initialFilter: BatchFilter;
  heading: string;
}) {
  const t = useTranslations("queue");
  const tm = useTranslations("investigation.manage");
  const [filter, setFilter] = useState(initialFilter);

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = filterParams(filter, QUEUE_DEFAULT_FILTER).toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
      if (next !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [filter]);

  const labels = useMemo(() => new Map(items.map((i) => [i.asset.asset_id, i.batchLabel])), [items]);
  const assets = useMemo(() => items.map((i) => i.asset), [items]);
  const visible = useMemo(() => applyFilter(assets, filter), [assets, filter]);
  const counts = useMemo(() => facetCounts(assets, filter), [assets, filter]);
  const batchCount = new Set(items.map((i) => i.batchId)).size;
  const reset = () => setFilter(QUEUE_DEFAULT_FILTER);

  return (
    <>
      <BatchFilterBar filter={filter} counts={counts} onChange={setFilter} onReset={reset} shown={visible.length} />
      {visible.length === 0 ? (
        <EmptyState icon={FilterX} title={tm("emptyFilterTitle")} body={tm("emptyFilterBody")}>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
          >
            <FilterX aria-hidden className="size-3.5" strokeWidth={2} />
            {tm("resetFilter")}
          </button>
        </EmptyState>
      ) : (
        <section aria-label={heading} className="rounded-[var(--radius-card)] border border-line bg-surface">
          <p className="rounded-t-[var(--radius-card)] border-b border-line bg-surface-2/50 px-4 py-2.5 text-[0.75rem] text-muted">
            {t("count", { count: items.length, batches: batchCount })}
          </p>
          <ul className="flex flex-col divide-y divide-line">
            {visible.map((asset) => (
              <BatchAssetRow
                key={asset.asset_id}
                asset={asset}
                batchLabel={labels.get(asset.asset_id) ?? undefined}
                reviewHref={reviewHref(asset.asset_id, { kind: "queue" }, filter)}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
