"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2Off, Plus, Trash2, Check, Loader2, AlertTriangle } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { COLLECTIONS } from "@/lib/data/settings";
import type { Issue, QueuedAsset } from "@/lib/upload/types";
import { cn } from "@/lib/cn";

const STATUS_TONE = {
  queued: "bg-surface-2 text-muted",
  uploading: "bg-evidence-soft text-evidence",
  uploaded: "bg-evidence-soft text-evidence",
  analysing: "bg-review-soft text-review",
  done: "bg-corroborated-soft text-corroborated",
  error: "bg-refuted-soft text-refuted",
} as const;

/**
 * One photograph: its two sides, how they came to be paired, and the two pieces
 * of metadata the archive needs before anything is sent.
 */
export function AssetRow({
  asset,
  issues,
  onChange,
  onRemove,
  onUnpair,
  onPairInto,
  locked,
}: {
  asset: QueuedAsset;
  issues: Issue[];
  onChange: (patch: Partial<QueuedAsset>) => void;
  onRemove: () => void;
  onUnpair: () => void;
  onPairInto: (sourceId: string) => void;
  locked: boolean;
}) {
  const t = useTranslations("upload");
  const [dropTarget, setDropTarget] = useState(false);

  const blocking = issues.filter((i) => i.blocking);
  const markers = asset.pairMarkers;
  const ruleLabel = !asset.pairedBy
    ? null
    : markers?.recto && markers?.verso
      ? `${markers.recto} / ${markers.verso}`
      : t(`rules.${asset.pairedBy}`);

  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-4 transition-colors duration-200 sm:px-5",
        blocking.length > 0 && "bg-refuted-soft/35",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
        {/* the two sides */}
        <div className="flex shrink-0 items-center gap-2">
          <Side file={asset.recto} label={t("recto")} />

          {asset.verso ? (
            <Side file={asset.verso} label={t("verso")} />
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(true);
              }}
              onDragLeave={() => setDropTarget(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(false);
                const sourceId = e.dataTransfer.getData("application/x-zeitzeuge-asset");
                if (sourceId) onPairInto(sourceId);
              }}
              title={t("dropVersoHere")}
              className={cn(
                "grid size-16 shrink-0 place-items-center rounded-lg border-2 border-dashed transition-colors duration-200",
                dropTarget
                  ? "border-evidence bg-evidence-soft text-evidence"
                  : "border-line-strong text-muted-2",
              )}
            >
              <Plus aria-hidden className="size-4" strokeWidth={2} />
              <span className="sr-only">{t("dropVersoHere")}</span>
            </div>
          )}
        </div>

        {/* identity + metadata */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span
              // The whole asset is the drag source, so a single-sided one can be
              // dropped onto another asset's empty verso slot.
              draggable={!locked && !asset.verso}
              onDragStart={(e) =>
                e.dataTransfer.setData("application/x-zeitzeuge-asset", asset.id)
              }
              className={cn(
                "truncate font-mono text-[0.75rem] text-foreground",
                !locked && !asset.verso && "cursor-grab active:cursor-grabbing",
              )}
            >
              {asset.recto?.file.name ?? asset.verso?.file.name}
            </span>

            {asset.verso && ruleLabel && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-corroborated-soft px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-corroborated">
                <Check aria-hidden className="size-2.5" strokeWidth={3} />
                {asset.pairedBy === "manual"
                  ? t("pairedManually")
                  : t("pairedBy", { rule: ruleLabel })}
              </span>
            )}
            {!asset.verso && asset.recto && (
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted-2">
                {t("noVerso")}
              </span>
            )}
            {!asset.recto && (
              <span className="shrink-0 rounded-full bg-refuted-soft px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-refuted">
                {t("noRecto")}
              </span>
            )}

            <span
              className={cn(
                "ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
                STATUS_TONE[asset.status],
              )}
            >
              {asset.status === "uploading" && (
                <Loader2 aria-hidden className="mr-1 inline size-2.5 animate-spin" strokeWidth={2.5} />
              )}
              {t(`status${asset.status[0].toUpperCase()}${asset.status.slice(1)}`)}
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Field
              label={t("signatureLabel")}
              placeholder={t("signaturePlaceholder")}
              value={asset.signature}
              disabled={locked}
              onChange={(e) => onChange({ signature: e.target.value })}
            />
            <Select
              label={t("collectionLabel")}
              value={asset.collection}
              disabled={locked}
              onChange={(e) => onChange({ collection: e.target.value })}
              options={COLLECTIONS.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          {blocking.length > 0 && (
            <ul className="flex flex-col gap-1">
              {blocking.map((issue, i) => (
                <li
                  key={`${issue.code}-${i}`}
                  className="flex items-start gap-1.5 text-[0.6875rem] leading-snug text-refuted"
                >
                  <AlertTriangle aria-hidden className="mt-px size-3 shrink-0" strokeWidth={2} />
                  {t(`issues.${issue.code}`, { detail: issue.detail ?? "" })}
                </li>
              ))}
            </ul>
          )}

          {asset.status === "uploading" && (
            <span className="h-1 overflow-hidden rounded-full bg-line-strong/30">
              <span
                className="block h-full rounded-full bg-evidence transition-[width] duration-150"
                style={{ width: `${asset.progress}%` }}
              />
            </span>
          )}
        </div>

        {/* row actions */}
        <div className="flex shrink-0 items-center gap-1 lg:pt-0.5">
          {asset.verso && !locked && (
            <button
              type="button"
              onClick={onUnpair}
              title={t("unpair")}
              className="grid size-8 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Link2Off aria-hidden className="size-3.5" strokeWidth={1.9} />
              <span className="sr-only">{t("unpair")}</span>
            </button>
          )}
          {!locked && (
            <button
              type="button"
              onClick={onRemove}
              title={t("removeAsset")}
              className="grid size-8 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-refuted-soft hover:text-refuted"
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={1.9} />
              <span className="sr-only">{t("removeAsset")}</span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function Side({
  file,
  label,
}: {
  file?: { preview: string; file: File };
  label: string;
}) {
  if (!file) {
    return (
      <div
        className="grid size-16 shrink-0 place-items-center rounded-lg border-2 border-dashed border-refuted/40 bg-refuted-soft/40"
        title={label}
      >
        <AlertTriangle aria-hidden className="size-4 text-refuted" strokeWidth={2} />
      </div>
    );
  }

  return (
    <figure className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
      {/* Object URLs of user files: next/image would only add a proxy hop. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.preview}
        alt={file.file.name}
        className="size-full object-cover"
        loading="lazy"
      />
      <figcaption className="absolute inset-x-0 bottom-0 bg-[#061320]/75 py-0.5 text-center font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[#cfe3f2]">
        {label}
      </figcaption>
    </figure>
  );
}
