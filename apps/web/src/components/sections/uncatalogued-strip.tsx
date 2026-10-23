import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ArchivePhoto } from "@/lib/data/archive";

/**
 * The backlog, made concrete: real photographs with nothing but a reference
 * code under them. The point of the strip is the repeated «unbekannt» — the
 * emptiness is the content.
 */
export function UncataloguedStrip({ photos }: { photos: ArchivePhoto[] }) {
  const t = useTranslations("ledger");
  const tProblem = useTranslations("problem");
  const tCommon = useTranslations("common");
  const tPhotos = useTranslations("archive.photos");

  return (
    <div className="relative">
      <ul
        tabIndex={0}
        aria-label={tProblem("stripLabel")}
        className="scrollbar-none -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0"
      >
        {photos.map((photo, i) => (
          <li
            key={photo.key}
            className="w-[15rem] shrink-0 snap-start lg:w-auto"
          >
            <figure className="flex h-full flex-col overflow-hidden rounded-[0.5rem] border border-line bg-surface">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src={photo.src}
                  alt={tPhotos(photo.key)}
                  fill
                  loading={i < 3 ? "eager" : "lazy"}
                  sizes="(max-width: 1024px) 15rem, 16vw"
                  className="photo-archival object-cover grayscale-[0.55] transition-[filter] duration-500 hover:grayscale-0"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b1b2e]/35 to-transparent"
                />
              </div>
              <figcaption className="flex flex-col gap-1 p-2.5">
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted-2">
                  {tCommon("signature")} {photo.signature}
                </span>
                <span className="font-mono text-[0.6875rem] text-abstain">
                  {t("fields.place")}: {t("beforeValue")}
                </span>
                <span className="font-mono text-[0.6875rem] text-abstain">
                  {t("fields.date")}: {t("beforeValue")}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent lg:hidden"
      />
    </div>
  );
}
