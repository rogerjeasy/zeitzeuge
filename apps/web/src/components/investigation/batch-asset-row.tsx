"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ImageOff, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RANKED_FIELD_KEYS, type BatchAsset } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";
import { ConfidenceFigure, QcPill, StatusPill } from "./pills";
import { StageTrack } from "./stage-track";
import { ARCHIVE_TZ, intlLocale } from "./labels";

/**
 * One photograph's row. `batchLabel` names its batch where rows from several
 * batches mix (the queue); `select` adds the selection checkbox; `actions` is
 * the overflow menu; `withdrawn` greys the row for the Papierkorb.
 */
export function BatchAssetRow({
  asset,
  batchLabel,
  reviewHref,
  select,
  actions,
  withdrawn = false,
}: {
  asset: BatchAsset;
  batchLabel?: string;
  reviewHref?: string;
  select?: { checked: boolean; onChange: (checked: boolean) => void };
  actions?: React.ReactNode;
  withdrawn?: boolean;
}) {
  const t = useTranslations("investigation");
  const tb = useTranslations("investigation.batch");
  const tm = useTranslations("investigation.manage");
  const intl = intlLocale(useLocale());
  const href = reviewHref ?? `/records/${asset.asset_id}`;

  return (
    <li
      className={cn(
        "flex min-w-0 gap-3 px-4 py-3.5 last:rounded-b-[var(--radius-card)]",
        select?.checked && "bg-evidence-soft/60",
        withdrawn && "bg-surface-2/60",
      )}
    >
      {select && (
        <span className="relative mt-0.5 flex size-[1.125rem] shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={select.checked}
            onChange={(e) => select.onChange(e.target.checked)}
            aria-label={tm("selectOne", { name: asset.external_ref })}
            className="peer size-full cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors checked:border-evidence checked:bg-evidence"
          />
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute size-3 fill-none stroke-background stroke-[3.2] opacity-0 peer-checked:opacity-100"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      )}

      <div
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 xl:grid-cols-[4rem_minmax(0,13rem)_minmax(0,1fr)_10.5rem] xl:items-center",
          // Greyed per cell, not on the grid: opacity would trap the row menu in a stacking context.
          withdrawn && "[&>*:not(:last-child)]:opacity-70",
        )}
      >
        <div className="row-span-2 xl:row-span-1">
          <div className="grid size-16 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2">
            {asset.preview_url ? (
              // A presigned S3 URL that expires: not for the image optimiser.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.preview_url}
                alt=""
                loading="lazy"
                className={cn("size-full object-cover", withdrawn && "grayscale")}
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
          {batchLabel && (
            <p className="truncate text-[0.6875rem] text-muted">{tb("inBatch", { label: batchLabel })}</p>
          )}
          {withdrawn ? (
            <p className="flex min-w-0 items-start gap-1.5 text-[0.6875rem] leading-snug text-muted">
              <Trash2 aria-hidden className="mt-px size-3 shrink-0" strokeWidth={2} />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {asset.deleted_at
                  ? tm("withdrawnAt", {
                      time: new Intl.DateTimeFormat(intl, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: ARCHIVE_TZ,
                      }).format(new Date(asset.deleted_at)),
                    })
                  : tm("withdrawnJustNow")}
                {asset.deleted_by_name && <> · {tm("withdrawnBy", { name: asset.deleted_by_name })}</>}
                {asset.deletion_reason && <> · «{asset.deletion_reason}»</>}
              </span>
            </p>
          ) : (
            <StageTrack stage={asset.stage} runStatus={asset.run_status} />
          )}
          {asset.error && !withdrawn && (
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

        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 xl:col-span-1 xl:flex-col xl:items-start">
          <StatusPill label={asset.status_label} />
          <QcPill status={asset.qc_status} />
          <span className="ml-auto flex items-center gap-1.5 xl:ml-0">
            <Link
              href={href}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
            >
              {tb("review")}
              <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
            </Link>
            {actions}
          </span>
        </div>
      </div>
    </li>
  );
}
