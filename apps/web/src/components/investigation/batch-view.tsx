"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCheck,
  FileSpreadsheet,
  FilterX,
  ImageOff,
  Loader2,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Share2,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLiveBatch } from "@/hooks/use-live-batch";
import {
  EXPORT_IDS_MAX,
  REASON_MAX,
  type BatchAsset,
  type BatchOut,
  type BulkResult,
  type InvestigationResult,
} from "@/lib/api/investigation-types";
import {
  bulkAssetsAction,
  restoreAssetAction,
  restoreBatchAction,
  withdrawAssetAction,
  withdrawBatchAction,
  purgeFailedRunsAction,
  mirrorBatchAction,
} from "@/lib/investigation/actions";
import {
  DEFAULT_FILTER,
  applyFilter,
  facetCounts,
  filterParams,
  isFinished,
  naturalCompare,
  statusBucket,
  type BatchFilter,
} from "@/lib/investigation/batch-filter";
import { summariseBulk, type BulkSummary } from "@/lib/investigation/bulk";
import { capabilitiesFor } from "@/lib/investigation/permissions";
import { reviewHref } from "@/lib/investigation/review-nav";
import { useSessionUser } from "@/components/auth/session-provider";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ToastRegion, useToasts } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ApiNotice } from "./api-notice";
import { AssetActionsMenu, type AssetAction } from "./asset-actions-menu";
import { BatchAssetRow } from "./batch-asset-row";
import { BatchFilterBar } from "./batch-filter-bar";
import { ExportButton, useExport } from "./export-button";
import { BATCH_STATUS_KEYS, intlLocale, ARCHIVE_TZ } from "./labels";
import { BatchTimingCard } from "./timing";

export { BatchAssetRow } from "./batch-asset-row";

type Pending =
  | { kind: "withdraw"; ids: string[] }
  | { kind: "accept"; ids: string[]; skipped: number }
  | { kind: "rerun"; ids: string[] }
  | { kind: "batchDelete" }
  | { kind: "purgeFailed" }
  | { kind: "publish" };

/** An optimistic overlay: what the screen shows before the API has confirmed it. */
type Overlay = Map<string, { state: "withdrawn" | "restored"; asset: BatchAsset }>;

const URL_DEBOUNCE_MS = 250;

/**
 * One batch, one row per photograph, kept live (§2.4, D8), now with the
 * batch-management surface (spec 2026-10-24 §4): filter, selection and bulk
 * actions, the per-row menu, the Papierkorb, and removing the whole batch.
 *
 * The counts header is the API's own `counts`, never recomputed here, so this
 * screen and the workbook cannot disagree about how many rows are
 * übernahmefähig. The chips' counts are the rows on screen, by facet.
 */
export function BatchView({
  initial,
  initialFilter = DEFAULT_FILTER,
  initialTrash = false,
}: {
  initial: BatchOut;
  initialFilter?: BatchFilter;
  initialTrash?: boolean;
}) {
  const t = useTranslations("investigation.batch");
  const tm = useTranslations("investigation.manage");
  const locale = useLocale();
  const intl = intlLocale(locale);
  const sessionUser = useSessionUser();
  const can = capabilitiesFor(sessionUser.role);

  const [filter, setFilter] = useState<BatchFilter>(initialFilter);
  const [trash, setTrash] = useState(initialTrash && can.canApprove);
  const { batch: live, mode, error, updatedAt, refreshing, refresh } = useLiveBatch(initial.id, initial, {
    includeDeleted: trash,
  });
  const batch = live ?? initial;
  const c = batch.counts;
  const router = useRouter();

  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [overlay, setOverlay] = useState<Overlay>(() => new Map());
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [removedOverride, setRemovedOverride] = useState<boolean | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const listRef = useRef<HTMLElement>(null);
  const exporter = useExport(batch.id);

  const removed = removedOverride ?? Boolean(batch.deleted_at);

  // The filter lives in the URL, so a view can be shared and survives a reload.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = filterParams(filter);
      if (trash) params.set("trash", "1");
      const query = params.toString();
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filter, trash]);

  // What is withdrawn right now: the API's word, unless an action is in flight.
  const { liveAssets, trashAssets } = useMemo(() => {
    const byId = new Map(batch.assets.map((a) => [a.asset_id, a]));
    const all = [...batch.assets];
    // A row the latest fetch no longer lists (withdrawn, then undone) comes back from its snapshot.
    for (const [id, entry] of overlay) if (!byId.has(id)) all.push(entry.asset);
    const liveList: BatchAsset[] = [];
    const trashList: BatchAsset[] = [];
    for (const asset of all) {
      const state = overlay.get(asset.asset_id)?.state;
      const withdrawn = state === "withdrawn" ? true : state === "restored" ? false : Boolean(asset.deleted_at);
      if (withdrawn) trashList.push(asset);
      else liveList.push(asset.deleted_at ? { ...asset, deleted_at: null } : asset);
    }
    return { liveAssets: liveList, trashAssets: trashList };
  }, [batch.assets, overlay]);

  const visible = useMemo(() => applyFilter(liveAssets, filter), [liveAssets, filter]);
  const counts = useMemo(() => facetCounts(liveAssets, filter), [liveAssets, filter]);
  const trashVisible = useMemo(() => {
    const q = filter.q.trim().toLocaleLowerCase("de-CH");
    return trashAssets
      .filter((a) => !q || a.external_ref.toLocaleLowerCase("de-CH").includes(q))
      .sort((a, b) => naturalCompare(a.external_ref, b.external_ref));
  }, [trashAssets, filter.q]);

  let pendingOverlay = 0;
  for (const { state } of overlay.values()) pendingOverlay += state === "withdrawn" ? 1 : -1;
  const trashCount = trash ? trashAssets.length : Math.max(0, (c.deleted ?? 0) + pendingOverlay);

  // Still to finish, for «Restzeit ca. …»: queued, uploading or running, whatever the filter shows.
  const openCount = useMemo(() => liveAssets.filter((a) => statusBucket(a) === "working").length, [liveAssets]);

  const selected = useMemo(() => visible.filter((a) => selection.has(a.asset_id)), [visible, selection]);
  const selectedIds = selected.map((a) => a.asset_id);
  const finishedSelected = selected.filter(isFinished);
  const canSelect = !trash && !removed && (can.canWrite || can.canApprove);
  const allSelected = visible.length > 0 && selected.length === visible.length;

  const time = (iso: string | number) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(
      new Date(iso),
    );

  const describe = useCallback(
    (action: "accept" | "rerun" | "delete" | "restore", summary: BulkSummary) => {
      const skipped = Object.entries(summary.skipped)
        .map(([detail, count]) => tm(`detail.${detail}`, { count: count ?? 0 }))
        .join(" · ");
      const head = tm(`result.${action}`, { ok: summary.succeeded, n: summary.requested });
      return skipped ? `${head} ${tm("skipped", { reasons: skipped })}` : head;
    },
    [tm],
  );

  const failToast = useCallback(
    (code: string) => push({ tone: "error", message: tm("failed", { code: errorText(code, tm) }) }),
    [push, tm],
  );

  const setOverlayFor = (ids: string[], state: "withdrawn" | "restored" | null) => {
    const known = new Map([...liveAssets, ...trashAssets].map((a) => [a.asset_id, a]));
    setOverlay((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const asset = known.get(id) ?? prev.get(id)?.asset;
        if (state && asset) next.set(id, { state, asset });
        else next.delete(id);
      }
      return next;
    });
  };

  /** When the control that opened a dialog has gone (its row was withdrawn), focus the list. */
  const keepFocus = () =>
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) listRef.current?.focus();
      // After the dialog has closed and the withdrawn rows have left the DOM.
    }, 80);

  async function restore(ids: string[]) {
    if (ids.length === 0) return;
    setOverlayFor(ids, "restored");
    const result: InvestigationResult<BulkResult> =
      ids.length === 1 ? await restoreAssetAction(ids[0]) : await bulkAssetsAction({ action: "restore", assetIds: ids });
    if (!result.ok) {
      setOverlayFor(ids, null);
      failToast(result.code);
      return;
    }
    push({ tone: "success", message: describe("restore", summariseBulk(result.data)) });
    await refresh();
    setOverlayFor(ids, null);
  }

  async function withdraw(ids: string[], why: string) {
    // Optimistic: the rows go at once; the API's answer follows.
    setOverlayFor(ids, "withdrawn");
    setSelection((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    setPending(null);
    setReason("");
    keepFocus();

    const reasonText = why.trim() || undefined;
    const result: InvestigationResult<BulkResult> =
      ids.length === 1
        ? await withdrawAssetAction(ids[0], reasonText)
        : await bulkAssetsAction({ action: "delete", assetIds: ids, reason: reasonText });
    if (!result.ok) {
      setOverlayFor(ids, null);
      failToast(result.code);
      return;
    }
    const summary = summariseBulk(result.data);
    const failed = result.data.results.filter((r) => !r.ok && r.detail !== "already_withdrawn").map((r) => r.asset_id);
    if (failed.length) setOverlayFor(failed, null);
    push({
      tone: summary.succeeded ? "success" : "error",
      message: `${describe("delete", summary)} ${tm("masterKept", { count: summary.succeeded })}`,
      action: summary.okIds.length
        ? { label: tm("undo"), onClick: () => void restore(summary.okIds) }
        : undefined,
      durationMs: 12_000,
    });
    await refresh();
    setOverlayFor(ids, null);
  }

  async function runBulk(action: "accept" | "rerun", ids: string[]) {
    setBusy(true);
    const result = await bulkAssetsAction({ action, assetIds: ids });
    setBusy(false);
    setPending(null);
    if (!result.ok) {
      failToast(result.code);
      return;
    }
    const summary = summariseBulk(result.data);
    push({ tone: summary.succeeded ? "success" : "info", message: describe(action, summary) });
    setSelection(new Set());
    keepFocus();
    void refresh();
  }

  async function exportIds(ids: string[]) {
    if (ids.length > EXPORT_IDS_MAX) {
      push({ tone: "error", message: tm("exportTooMany", { max: EXPORT_IDS_MAX }) });
      return;
    }
    // The whole batch selected: export it as such, without a long query.
    const whole = ids.length === liveAssets.length;
    const code = await exporter.download(whole ? [] : ids);
    if (code) failToast(code);
  }

  async function purgeFailed() {
    setBusy(true);
    const result = await purgeFailedRunsAction(batch.id);
    setBusy(false);
    setPending(null);
    if (!result.ok) {
      failToast(result.code);
      return;
    }
    push({ tone: "success", message: tm("purgedFailed", { count: result.data.purged }) });
    router.refresh();
  }

  async function publish() {
    setBusy(true);
    const result = await mirrorBatchAction(batch.id);
    setBusy(false);
    setPending(null);
    if (!result.ok) {
      failToast(result.code);
      return;
    }
    push({ tone: "success", message: tm("published", { assets: result.data.assets }) });
  }

  async function deleteBatch(why: string) {
    setBusy(true);
    const result = await withdrawBatchAction(batch.id, why.trim() || undefined);
    setBusy(false);
    if (!result.ok) {
      failToast(result.code);
      return;
    }
    setPending(null);
    setReason("");
    setRemovedOverride(true);
    setSelection(new Set());
    push({
      tone: "success",
      message: `${tm("batchRemoved", { count: result.data.assets })} ${tm("masterKept", { count: result.data.assets })}`,
      action: { label: tm("undo"), onClick: () => void restoreBatch() },
      durationMs: 12_000,
    });
    void refresh();
  }

  async function restoreBatch() {
    setBusy(true);
    const result = await restoreBatchAction(batch.id);
    setBusy(false);
    if (!result.ok) {
      failToast(result.code);
      return;
    }
    setRemovedOverride(false);
    push({ tone: "success", message: tm("batchRestored", { count: result.data.assets }) });
    void refresh();
  }

  function onRowAction(asset: BatchAsset, action: AssetAction) {
    const ids = [asset.asset_id];
    if (action === "withdraw") setPending({ kind: "withdraw", ids });
    else if (action === "accept") setPending({ kind: "accept", ids, skipped: 0 });
    else if (action === "rerun") setPending({ kind: "rerun", ids });
    else if (action === "export") void exportIds(ids);
    else if (action === "restore") void restore(ids);
  }

  const toggleAll = (checked: boolean) =>
    setSelection((prev) => {
      const next = new Set(prev);
      for (const a of visible) {
        if (checked) next.add(a.asset_id);
        else next.delete(a.asset_id);
      }
      return next;
    });

  const headerCounts: { key: string; value: number; tone?: string }[] = [
    { key: "total", value: c.total },
    { key: "uploaded", value: c.uploaded },
    { key: "queued", value: c.queued },
    { key: "running", value: c.running, tone: c.running ? "text-evidence" : undefined },
    { key: "done", value: c.done },
    { key: "failed", value: c.failed, tone: c.failed ? "text-refuted" : undefined },
    { key: "accepted", value: c.accepted, tone: "text-corroborated" },
    { key: "review", value: c.review, tone: "text-review" },
    { key: "undetermined", value: c.undetermined, tone: "text-abstain" },
  ];

  const resetFilter = () => setFilter(DEFAULT_FILTER);
  const origin = { kind: "batch" as const, batchId: batch.id };
  const rows = trash ? trashVisible : visible;
  const hideError = removed && error === "not_found";

  return (
    <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/batches"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-[0.75rem] text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
        {t("back")}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-2">{t("eyebrow")}</p>
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong [overflow-wrap:anywhere]">
            {batch.label ?? t("unlabelled")}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
            <span>{t("created", { time: time(batch.created_at) })}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span>{BATCH_STATUS_KEYS.has(batch.status) ? t(`batchStatus.${batch.status}`) : batch.status}</span>
          </p>
          {batch.mirrored_from && (
            <p className="w-fit rounded-full border border-evidence/35 bg-evidence-soft px-2.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-evidence">
              {t("mirrored", { time: batch.mirrored_at ? time(batch.mirrored_at) : "—" })}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-start gap-2">
          {!removed && <ExportButton batchId={batch.id} compact />}
          {can.canApprove && !removed && (
            <>
              <button
                type="button"
                aria-pressed={trash}
                onClick={() => {
                  setTrash((v) => !v);
                  setSelection(new Set());
                }}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[0.8125rem] font-medium transition-colors",
                  trash
                    ? "border-foreground bg-foreground text-background"
                    : "border-line-strong bg-surface text-foreground hover:border-evidence hover:text-evidence",
                )}
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={2} />
                {tm("trash")}
                <span className={cn("font-mono text-[0.6875rem] tabular-nums", trash ? "text-background/80" : "text-muted")}>
                  {trashCount}
                </span>
              </button>
              {sessionUser.canPublishDemo && !batch.mirrored_from && (
                <button
                  type="button"
                  onClick={() => setPending({ kind: "publish" })}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
                >
                  <Share2 aria-hidden className="size-4" strokeWidth={2} />
                  {tm("publish")}
                </button>
              )}
              {c.failed > 0 && (
                <button
                  type="button"
                  onClick={() => setPending({ kind: "purgeFailed" })}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-refuted/45 bg-surface px-3.5 text-[0.8125rem] font-medium text-refuted transition-colors hover:bg-refuted-soft"
                >
                  <Trash2 aria-hidden className="size-4" strokeWidth={2} />
                  {tm("purgeFailed", { count: c.failed })}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPending({ kind: "batchDelete" })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-refuted/45 bg-surface px-3.5 text-[0.8125rem] font-medium text-refuted transition-colors hover:bg-refuted-soft"
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={2} />
                {tm("removeBatch")}
              </button>
            </>
          )}
        </div>
      </header>

      {removed && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-refuted/35 bg-refuted-soft px-3.5 py-3"
        >
          <Trash2 aria-hidden className="size-4 shrink-0 text-refuted" strokeWidth={2} />
          <p className="min-w-0 flex-[1_1_16rem] text-[0.8125rem] text-refuted">
            <span className="font-semibold">{tm("batchRemovedTitle")}</span> {tm("batchRemovedBody")}
          </p>
          {can.canApprove && (
            <button
              type="button"
              onClick={() => void restoreBatch()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[0.75rem] font-medium text-background transition-colors hover:bg-foreground-strong disabled:opacity-60"
            >
              {busy ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
              )}
              {tm("restore")}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
        <LiveBadge mode={mode} />
        <p className="min-w-0 flex-1 text-[0.75rem] text-muted">
          {t(`liveHint.${mode}`)}
          {updatedAt && (
            <span className="ml-1.5 font-mono text-[0.6875rem] text-muted-2">{t("updated", { time: time(updatedAt) })}</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] text-foreground transition-colors hover:border-evidence hover:text-evidence disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={cn("size-3.5", refreshing && "animate-spin")} strokeWidth={2} />
          {t("refresh")}
        </button>
      </div>

      {error && !hideError && <ApiNotice code={error} />}

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line 2xl:grid-cols-9">
        {headerCounts.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col justify-between gap-1 bg-surface px-3 py-3">
            <dt className="text-[0.6875rem] leading-tight text-muted [overflow-wrap:anywhere]">{t(`counts.${item.key}`)}</dt>
            <dd
              className={cn(
                "font-display text-[1.375rem] font-semibold leading-none tabular-nums tracking-[-0.02em]",
                item.tone ?? "text-foreground-strong",
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <BatchTimingCard timing={batch.timing} open={openCount} />

      {trash ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[0.75rem] text-muted">
          <Trash2 aria-hidden className="mt-px size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          <span className="min-w-0">
            <span className="font-medium text-foreground">{tm("trashTitle")}</span> {tm("trashHint")}
          </span>
        </p>
      ) : (
        liveAssets.length > 0 && (
          <BatchFilterBar
            filter={filter}
            counts={counts}
            onChange={setFilter}
            onReset={resetFilter}
            shown={visible.length}
          />
        )
      )}

      {batch.assets.length === 0 && overlay.size === 0 && !trash ? (
        <EmptyState
          icon={ImageOff}
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={{ href: "/upload", label: t("emptyCta") }}
        />
      ) : rows.length === 0 ? (
        trash ? (
          <EmptyState icon={Trash2} title={tm("trashEmptyTitle")} body={tm("trashEmptyBody")} />
        ) : (
          <EmptyState icon={FilterX} title={tm("emptyFilterTitle")} body={tm("emptyFilterBody")}>
            <button
              type="button"
              onClick={resetFilter}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
            >
              <FilterX aria-hidden className="size-3.5" strokeWidth={2} />
              {tm("resetFilter")}
            </button>
          </EmptyState>
        )
      ) : (
        <section
          ref={listRef}
          tabIndex={-1}
          aria-label={trash ? tm("trashTitle") : t("rowsLabel")}
          className="rounded-[var(--radius-card)] border border-line bg-surface outline-none"
        >
          <div className="flex items-center gap-3 rounded-t-[var(--radius-card)] border-b border-line bg-surface-2/50 px-4 py-2">
            {canSelect && (
              <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] text-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selected.length > 0 && !allSelected;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="size-[1.125rem] cursor-pointer accent-[var(--evidence)]"
                />
                {tm("selectAllFiltered", { count: visible.length })}
              </label>
            )}
            <div
              aria-hidden
              className="hidden min-w-0 flex-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2 xl:grid xl:grid-cols-[4rem_minmax(0,13rem)_minmax(0,1fr)_10.5rem] xl:gap-4"
            >
              <span>{t("colPhoto")}</span>
              <span>{t("colFile")}</span>
              <span>{t("colFields")}</span>
              <span>{t("colStatus")}</span>
            </div>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((asset) => (
              <BatchAssetRow
                key={asset.asset_id}
                asset={asset}
                withdrawn={trash}
                reviewHref={reviewHref(asset.asset_id, trash ? null : origin, filter)}
                select={
                  canSelect
                    ? {
                        checked: selection.has(asset.asset_id),
                        onChange: (checked) =>
                          setSelection((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(asset.asset_id);
                            else next.delete(asset.asset_id);
                            return next;
                          }),
                      }
                    : undefined
                }
                actions={
                  removed ? undefined : (
                    <AssetActionsMenu
                      name={asset.external_ref}
                      can={can}
                      finished={isFinished(asset)}
                      withdrawn={trash}
                      onAction={(action) => onRowAction(asset, action)}
                    />
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {canSelect && selected.length > 0 && (
        <div
          role="region"
          aria-label={tm("bulkLabel")}
          className="sticky bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-surface-raised px-3 py-2.5 shadow-lift"
        >
          <p aria-live="polite" className="mr-auto min-w-0 text-[0.8125rem] font-medium text-foreground-strong">
            {tm("selected", { count: selected.length })}
          </p>
          {can.canReview && (
            <BulkButton
              icon={<CheckCheck aria-hidden className="size-4" strokeWidth={2} />}
              disabled={finishedSelected.length === 0}
              onClick={() =>
                setPending({
                  kind: "accept",
                  ids: finishedSelected.map((a) => a.asset_id),
                  skipped: selected.length - finishedSelected.length,
                })
              }
            >
              {tm("accept")}
            </BulkButton>
          )}
          {can.canWrite && (
            <BulkButton
              icon={<RotateCw aria-hidden className="size-4" strokeWidth={2} />}
              onClick={() => setPending({ kind: "rerun", ids: selectedIds })}
            >
              {tm("rerun")}
            </BulkButton>
          )}
          <BulkButton
            icon={
              exporter.busy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                <FileSpreadsheet aria-hidden className="size-4" strokeWidth={2} />
              )
            }
            disabled={exporter.busy}
            onClick={() => void exportIds(selectedIds)}
          >
            {tm("exportSelection")}
          </BulkButton>
          {can.canApprove && (
            <BulkButton
              tone="danger"
              icon={<Trash2 aria-hidden className="size-4" strokeWidth={2} />}
              onClick={() => setPending({ kind: "withdraw", ids: selectedIds })}
            >
              {tm("withdraw")}
            </BulkButton>
          )}
          <button
            type="button"
            onClick={() => setSelection(new Set())}
            aria-label={tm("clearSelection")}
            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={pending?.kind === "withdraw"}
        onClose={() => setPending(null)}
        onConfirm={() => pending?.kind === "withdraw" && void withdraw(pending.ids, reason)}
        tone="danger"
        title={tm("withdrawTitle", { count: pending?.kind === "withdraw" ? pending.ids.length : 0 })}
        description={
          <>
            <p>{tm("withdrawBody")}</p>
            <p className="font-medium text-foreground">{tm("masterKept", { count: pending?.kind === "withdraw" ? pending.ids.length : 1 })}</p>
          </>
        }
        confirmLabel={tm("withdrawConfirm")}
        cancelLabel={tm("cancel")}
      >
        <ReasonField value={reason} onChange={setReason} label={tm("reasonLabel")} />
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === "accept"}
        onClose={() => setPending(null)}
        onConfirm={() => pending?.kind === "accept" && void runBulk("accept", pending.ids)}
        busy={busy}
        title={tm("acceptTitle", { count: pending?.kind === "accept" ? pending.ids.length : 0 })}
        description={
          <>
            <p>{tm("acceptBody")}</p>
            {pending?.kind === "accept" && pending.skipped > 0 && (
              <p>{tm("acceptSkipped", { count: pending.skipped })}</p>
            )}
          </>
        }
        confirmLabel={tm("acceptConfirm")}
        cancelLabel={tm("cancel")}
      />

      <ConfirmDialog
        open={pending?.kind === "rerun"}
        onClose={() => setPending(null)}
        onConfirm={() => pending?.kind === "rerun" && void runBulk("rerun", pending.ids)}
        busy={busy}
        title={tm("rerunTitle", { count: pending?.kind === "rerun" ? pending.ids.length : 0 })}
        description={<p>{tm("rerunBody")}</p>}
        confirmLabel={tm("rerunConfirm")}
        cancelLabel={tm("cancel")}
      />

      <ConfirmDialog
        open={pending?.kind === "publish"}
        onClose={() => setPending(null)}
        onConfirm={() => void publish()}
        busy={busy}
        title={tm("publishTitle")}
        description={
          <>
            <p>{tm("publishBody")}</p>
            <p className="font-medium text-foreground">{tm("publishReplace")}</p>
          </>
        }
        confirmLabel={tm("publishConfirm")}
        cancelLabel={tm("cancel")}
      />

      <ConfirmDialog
        open={pending?.kind === "purgeFailed"}
        onClose={() => setPending(null)}
        onConfirm={() => void purgeFailed()}
        busy={busy}
        tone="danger"
        title={tm("purgeFailedTitle", { count: c.failed })}
        description={
          <>
            <p>{tm("purgeFailedBody")}</p>
            <p className="font-medium text-foreground">{tm("purgeFailedKept")}</p>
          </>
        }
        confirmLabel={tm("purgeFailedConfirm")}
        cancelLabel={tm("cancel")}
      />

      <ConfirmDialog
        open={pending?.kind === "batchDelete"}
        onClose={() => setPending(null)}
        onConfirm={() => void deleteBatch(reason)}
        busy={busy}
        tone="danger"
        title={tm("removeBatchTitle", { label: batch.label ?? t("unlabelled") })}
        description={
          <>
            <p>{tm("removeBatchBody", { count: liveAssets.length })}</p>
            <p className="font-medium text-foreground">{tm("masterKept", { count: liveAssets.length })}</p>
          </>
        }
        confirmLabel={tm("removeBatchConfirm")}
        cancelLabel={tm("cancel")}
      >
        <ReasonField value={reason} onChange={setReason} label={tm("reasonLabel")} />
      </ConfirmDialog>

      <ToastRegion toasts={toasts} dismiss={dismiss} label={tm("toastRegion")} closeLabel={tm("dismiss")} />
    </div>
  );
}

function errorText(code: string, tm: ReturnType<typeof useTranslations>): string {
  return ["forbidden", "network", "unauthenticated", "not_found", "conflict"].includes(code)
    ? tm(`errors.${code}`)
    : code;
}

function ReasonField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-[0.6875rem] text-muted">
      {label}
      <textarea
        value={value}
        maxLength={REASON_MAX}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-16 w-full min-w-0 resize-y rounded-lg border border-line-strong bg-background px-2.5 py-2 text-[0.8125rem] text-foreground outline-none focus-visible:border-evidence"
      />
    </label>
  );
}

function BulkButton({
  children,
  icon,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[0.75rem] font-medium transition-colors disabled:opacity-50",
        tone === "danger"
          ? "border-refuted/45 text-refuted hover:bg-refuted-soft"
          : "border-line-strong bg-surface text-foreground hover:border-evidence hover:text-evidence",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function LiveBadge({ mode }: { mode: "connecting" | "live" | "polling" | "off" }) {
  const t = useTranslations("investigation.batch");
  if (mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-corroborated-soft px-2.5 py-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.08em] text-corroborated">
        <Radio aria-hidden className="size-3" strokeWidth={2.2} />
        {t("live.live")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted">
      <TimerReset aria-hidden className="size-3" strokeWidth={2.2} />
      {t(`live.${mode}`)}
    </span>
  );
}
