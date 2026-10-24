"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { RECORD_PHOTO } from "@/lib/data/archive";
import type { EvidenceItem } from "@/lib/data/record";
import { cn } from "@/lib/cn";

/**
 * The scan with the evidence regions drawn on it. Hovering a field in the form
 * lights up the pixels that field rests on — the fastest way to make "every
 * claim points at something" felt rather than explained.
 */
export function EvidencePlate({
  items,
  activeIds,
  onHover,
}: {
  items: EvidenceItem[];
  activeIds: string[];
  onHover: (id: string | null) => void;
}) {
  const t = useTranslations("ledger");
  const tCommon = useTranslations("common");
  const tPhotos = useTranslations("archive.photos");
  const dimmed = activeIds.length > 0;

  return (
    <figure className="flex flex-col gap-2.5">
      <div className="relative overflow-hidden rounded-[0.625rem] border border-line-strong bg-surface shadow-plate">
        <div
          className="relative w-full"
          style={{ aspectRatio: `${RECORD_PHOTO.width} / ${RECORD_PHOTO.height}` }}
        >
          <Image
            src={RECORD_PHOTO.src}
            alt={tPhotos(RECORD_PHOTO.key)}
            fill
            sizes="(max-width: 1024px) 100vw, 42vw"
            className={cn(
              "object-cover transition-[filter] duration-500",
              dimmed && "brightness-[0.82]",
            )}
          />

          {items.map((item) => {
            if (!item.region) return null;
            const active = activeIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => onHover(item.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(item.id)}
                onBlur={() => onHover(null)}
                aria-label={`${item.id} — ${t(`evidence.${item.key}`)}`}
                style={{
                  left: `${item.region.x * 100}%`,
                  top: `${item.region.y * 100}%`,
                  width: `${item.region.w * 100}%`,
                  height: `${item.region.h * 100}%`,
                }}
                className={cn(
                  "absolute rounded-[3px] border transition-all duration-300 [transition-timing-function:var(--ease-archival)]",
                  active
                    ? "border-evidence-bright bg-evidence-bright/15 opacity-100 shadow-[0_0_0_1px_rgb(6_19_32/0.45),0_0_18px_rgb(23_162_222/0.5)]"
                    : dimmed
                      ? "border-transparent opacity-0"
                      : "border-dashed border-white/35 opacity-100 hover:border-evidence-bright hover:bg-evidence-bright/10",
                )}
              >
                <span
                  className={cn(
                    "absolute -top-px left-0 -translate-y-full rounded-t-[3px] bg-evidence-bright px-1 py-px font-mono text-[0.5rem] leading-tight text-[#061320] transition-opacity duration-300 sm:text-[0.5625rem]",
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

      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[0.625rem] text-muted-2">
        <span>
          {tCommon("signature")} {RECORD_PHOTO.signature}
        </span>
        <span>{t("evidenceHint")}</span>
      </figcaption>
    </figure>
  );
}
