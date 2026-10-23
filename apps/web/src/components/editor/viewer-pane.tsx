"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut, Maximize2, SquareDashed, Waves, Info } from "lucide-react";
import { HORIZON_CURVE, SUMMITS } from "@/lib/data/horizon";
import { smoothPath } from "@/lib/path";
import type { CaseFile } from "@/lib/data/editor";
import { cn } from "@/lib/cn";

const HORIZON_PATH = smoothPath(HORIZON_CURVE);
const ZOOMS = [1, 1.5, 2, 3];

/**
 * The photograph, with the evidence drawn onto it.
 *
 * Hovering a field in the record lights up the pixels that field rests on —
 * that link is the whole argument of the product made physical, so it is the
 * one interaction this pane exists for. (OpenSeadragon/IIIF replaces the plain
 * image once tiles exist; the overlay geometry is already normalised for it.)
 *
 * Both overlays are geometry measured on one scan, so both are offered only on
 * the scan they were measured on. A record whose falsification never converged
 * shows the photograph and no boxes, rather than boxes drawn where they would
 * look convincing.
 */
export function ViewerPane({
  record,
  activeEvidence,
  onHoverEvidence,
  showHorizon,
  onToggleHorizon,
  className,
}: {
  record: CaseFile;
  activeEvidence: string[];
  onHoverEvidence: (id: string | null) => void;
  showHorizon: boolean;
  onToggleHorizon: (next: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("editor");
  const tPhotos = useTranslations("archive.photos");

  const [side, setSide] = useState<"recto" | "verso">("recto");
  const [zoomStep, setZoomStep] = useState(0);
  const [showRegions, setShowRegions] = useState(true);
  const zoom = ZOOMS[zoomStep];

  const hasVerso = Boolean(record.verso);
  const isRecto = side === "recto" || !hasVerso;
  const hasRegions = record.evidence.length > 0;
  const hasHorizon = record.camera !== null;

  const overlaysOn = isRecto && showRegions && hasRegions;
  const horizonOn = isRecto && showHorizon && hasHorizon;

  return (
    <section
      aria-labelledby="viewer-pane-heading"
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <h2 id="viewer-pane-heading" className="sr-only">
        {t("viewerTitle")}
      </h2>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasVerso ? (
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {(["recto", "verso"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                aria-pressed={side === option}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[0.75rem] font-medium transition-colors duration-150",
                  side === option
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground",
                )}
              >
                {t(option)}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("recto")}
          </span>
        )}

        <div className="flex items-center gap-1">
          <IconToggle
            active={showRegions && hasRegions}
            onClick={() => setShowRegions((v) => !v)}
            label={t("showRegions")}
            icon={<SquareDashed className="size-3.5" strokeWidth={1.9} />}
            disabled={!isRecto || !hasRegions}
          />
          <IconToggle
            active={showHorizon && hasHorizon}
            onClick={() => onToggleHorizon(!showHorizon)}
            label={t("showHorizon")}
            icon={<Waves className="size-3.5" strokeWidth={1.9} />}
            disabled={!isRecto || !hasHorizon}
          />
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          <IconToggle
            onClick={() => setZoomStep((z) => Math.max(0, z - 1))}
            label={t("zoomOut")}
            icon={<ZoomOut className="size-3.5" strokeWidth={1.9} />}
            disabled={zoomStep === 0}
          />
          <span className="w-9 text-center font-mono text-[0.625rem] tabular-nums text-muted-2">
            {zoom}×
          </span>
          <IconToggle
            onClick={() => setZoomStep((z) => Math.min(ZOOMS.length - 1, z + 1))}
            label={t("zoomIn")}
            icon={<ZoomIn className="size-3.5" strokeWidth={1.9} />}
            disabled={zoomStep === ZOOMS.length - 1}
          />
          <IconToggle
            onClick={() => setZoomStep(0)}
            label={t("zoomReset")}
            icon={<Maximize2 className="size-3.5" strokeWidth={1.9} />}
            disabled={zoomStep === 0}
          />
        </div>
      </div>

      <div className="overflow-auto rounded-[var(--radius-card)] border border-line-strong bg-surface-2/60 p-2">
        <div
          className="relative mx-auto aspect-[1700/1267] origin-top-left transition-[width] duration-300"
          style={{ width: `${zoom * 100}%` }}
        >
          <Image
            src={isRecto ? record.recto : record.verso!}
            alt={tPhotos(record.photoKey)}
            fill
            sizes="(max-width: 1023px) 100vw, (max-width: 1535px) 50vw, 38vw"
            priority
            className={cn("photo-archival object-cover", !isRecto && "-scale-x-100")}
          />

          {horizonOn && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full"
            >
              <path
                d={HORIZON_PATH}
                fill="none"
                stroke="var(--evidence-bright)"
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 4px rgb(23 162 222 / 0.65))" }}
              />
            </svg>
          )}

          {horizonOn &&
            SUMMITS.map((summit) => (
              <span
                key={summit.id}
                className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${summit.x * 100}%`, top: `${summit.y * 100}%` }}
              >
                <span className="size-1.5 rounded-full bg-evidence-bright ring-2 ring-evidence-bright/30" />
                <span className="mt-1 whitespace-nowrap rounded-[4px] border border-evidence-bright/50 bg-[#061320]/85 px-1 py-px font-mono text-[0.5rem] text-[#d8f2ff]">
                  {summit.name} {summit.elevation} m
                </span>
              </span>
            ))}

          {overlaysOn &&
            record.evidence.map((item) => {
              if (!item.region) return null;
              const active = activeEvidence.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => onHoverEvidence(item.id)}
                  onMouseLeave={() => onHoverEvidence(null)}
                  onFocus={() => onHoverEvidence(item.id)}
                  onBlur={() => onHoverEvidence(null)}
                  aria-label={`${item.id} — ${t(`evidence.${item.key}`)}`}
                  style={{
                    left: `${item.region.x * 100}%`,
                    top: `${item.region.y * 100}%`,
                    width: `${item.region.w * 100}%`,
                    height: `${item.region.h * 100}%`,
                  }}
                  className={cn(
                    "absolute rounded-[3px] border transition-all duration-300",
                    active
                      ? "border-evidence-bright bg-evidence-bright/15 shadow-[0_0_0_1px_rgb(6_19_32/0.5),0_0_18px_rgb(23_162_222/0.55)]"
                      : "border-dashed border-white/35 hover:border-evidence-bright hover:bg-evidence-bright/10",
                  )}
                >
                  <span
                    className={cn(
                      "absolute -top-px left-0 -translate-y-full rounded-t-[3px] bg-evidence-bright px-1 py-px font-mono text-[0.5rem] text-[#061320] transition-opacity duration-200",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {item.id}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[0.6875rem] leading-snug text-muted-2">
        <Info aria-hidden className="mt-px size-3 shrink-0" strokeWidth={2} />
        {!isRecto ? t("versoNote") : hasRegions ? t("regionHint") : t("noRegionsHint")}
      </p>
    </section>
  );
}

function IconToggle({
  active,
  onClick,
  label,
  icon,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-pressed={active}
      className={cn(
        "grid size-8 place-items-center rounded-lg border transition-colors duration-150 disabled:opacity-35",
        active
          ? "border-evidence bg-evidence-soft text-evidence"
          : "border-transparent text-muted-2 hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}
