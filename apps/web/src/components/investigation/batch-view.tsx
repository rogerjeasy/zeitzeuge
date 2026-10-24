"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, ImageOff, Radio, RefreshCw, TimerReset } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLiveBatch } from "@/hooks/use-live-batch";
import {
  RANKED_FIELD_KEYS,
  type BatchAsset,
  type BatchOut,
} from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { ConfidenceFigure, QcPill, StatusPill } from "./pills";
import { StageTrack } from "./stage-track";
import { ExportButton } from "./export-button";
import { ApiNotice } from "./api-notice";
import { BATCH_STATUS_KEYS, intlLocale, ARCHIVE_TZ } from "./labels";

/**
 * One batch, one row per photograph, kept live (§2.4, D8).
 *
 * The counts header is the API's own `counts`, never recomputed here, so this
 * screen and the workbook cannot disagree about how many rows are
 * übernahmefähig.
 */
export function BatchView({ initial }: { initial: BatchOut }) {
  const t = useTranslations("investigation.batch");
  const locale = useLocale();
  const intl = intlLocale(locale);
  const { batch: live, mode, error, updatedAt, refreshing, refresh } = useLiveBatch(
    initial.id,
    initial,
  );
  const batch = live ?? initial;
  const c = batch.counts;

  const time = (iso: string | number) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(
      new Date(iso),
    );

  const counts: { key: string; value: number; tone?: string }[] = [
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
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-2">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {batch.label ?? t("unlabelled")}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
            <span>{t("created", { time: time(batch.created_at) })}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span>
              {BATCH_STATUS_KEYS.has(batch.status)
                ? t(`batchStatus.${batch.status}`)
                : batch.status}
            </span>
          </p>
          {batch.mirrored_from && (
            <p className="w-fit rounded-full border border-evidence/35 bg-evidence-soft px-2.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-evidence">
              {t("mirrored", { time: batch.mirrored_at ? time(batch.mirrored_at) : "—" })}
            </p>
          )}
        </div>

        <ExportButton batchId={batch.id} />
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
        <LiveBadge mode={mode} />
        <p className="min-w-0 flex-1 text-[0.75rem] text-muted">
          {t(`liveHint.${mode}`)}
          {updatedAt && (
            <span className="ml-1.5 font-mono text-[0.6875rem] text-muted-2">
              {t("updated", { time: time(updatedAt) })}
            </span>
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

      {error && <ApiNotice code={error} />}

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line 2xl:grid-cols-9">
        {counts.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col justify-between gap-1 bg-surface px-3 py-3">
            <dt className="text-[0.6875rem] leading-tight text-muted [overflow-wrap:anywhere]">
              {t(`counts.${item.key}`)}
            </dt>
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

      {batch.assets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2/40 px-6 py-12 text-center">
          <p className="font-medium text-foreground-strong">{t("emptyTitle")}</p>
          <p className="max-w-[52ch] text-[0.8125rem] text-muted">{t("emptyBody")}</p>
          <Link
            href="/upload"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background"
          >
            {t("emptyCta")}
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
          </Link>
        </div>
      ) : (
        <section
          aria-label={t("rowsLabel")}
          className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
        >
          <div
            aria-hidden
            className="hidden border-b border-line bg-surface-2/50 px-4 py-2 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2 xl:grid xl:grid-cols-[4rem_minmax(0,13rem)_minmax(0,1fr)_9.5rem] xl:gap-4"
          >
            <span>{t("colPhoto")}</span>
            <span>{t("colFile")}</span>
            <span>{t("colFields")}</span>
            <span>{t("colStatus")}</span>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {batch.assets.map((asset) => (
              <AssetRow key={asset.asset_id} asset={asset} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AssetRow({ asset }: { asset: BatchAsset }) {
  const t = useTranslations("investigation");
  const tb = useTranslations("investigation.batch");

  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-3.5 xl:grid-cols-[4rem_minmax(0,13rem)_minmax(0,1fr)_9.5rem] xl:items-center">
      <div className="row-span-2 xl:row-span-1">
        <div className="grid size-16 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2">
          {asset.preview_url ? (
            // A presigned S3 URL that expires: not for the image optimiser.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.preview_url}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <ImageOff aria-hidden className="size-4 text-muted-2" strokeWidth={1.8} />
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="truncate font-mono text-[0.8125rem] font-medium text-foreground-strong" title={asset.external_ref}>
          {asset.external_ref}
        </p>
        <StageTrack stage={asset.stage} runStatus={asset.run_status} />
        {asset.error && (
          <p className="line-clamp-2 text-[0.6875rem] text-refuted" title={asset.error}>
            {asset.error}
          </p>
        )}
      </div>

      <dl className="col-span-2 grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:col-span-1 xl:grid-cols-5">
        {RANKED_FIELD_KEYS.map((key) => {
          const field = asset.fields[key];
          const abstained = field?.decision === "abstain";
          return (
            <div key={key} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[0.625rem] uppercase leading-tight tracking-[0.06em] text-muted-2">
                {t(`fields.${key}`)}
              </dt>
              <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <span
                  className={cn(
                    "min-w-0 text-[0.8125rem] leading-snug [overflow-wrap:anywhere]",
                    field?.value && !abstained ? "text-foreground" : "italic text-muted-2",
                  )}
                  title={field?.value ?? undefined}
                >
                  {!field ? "—" : abstained || !field.value ? t("leftEmpty") : field.value}
                </span>
                {field && field.confidence !== null && (
                  <ConfidenceFigure value={field.confidence} decision={String(field.decision)} />
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="col-span-2 flex flex-wrap items-center gap-2 xl:col-span-1 xl:flex-col xl:items-start">
        <StatusPill label={asset.status_label} />
        <QcPill status={asset.qc_status} />
        <Link
          href={`/records/${asset.asset_id}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence xl:ml-0 ml-auto"
        >
          {tb("review")}
          <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </li>
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
