"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { CaseFile } from "@/lib/data/editor";

/**
 * Collection memory (§5.2 #8) — "have we seen this before?".
 *
 * Each hit is a link, because the answer to a hard record is very often the
 * record next to it: one identified series resolves the twelve photographs
 * that were shot the same afternoon.
 */
export function SimilarTab({ record }: { record: CaseFile }) {
  const t = useTranslations("editor.similar");
  const tPhotos = useTranslations("archive.photos");

  if (record.similar.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-[0.8125rem] text-muted">{t("empty")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-[0.8125rem] leading-relaxed text-muted">{t("hint")}</p>

      <ul className="grid gap-2.5 @lg:grid-cols-2">
        {record.similar.map((hit) => (
          <li key={hit.id}>
            <Link
              href={`/records/${hit.id}`}
              className="group flex gap-3 rounded-lg border border-line bg-surface-2/40 p-2 transition-colors duration-200 hover:border-evidence/50 hover:bg-surface-2"
            >
              <figure className="relative size-16 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                <Image
                  src={hit.src}
                  alt={tPhotos(hit.photoKey)}
                  fill
                  sizes="64px"
                  className="photo-archival object-cover"
                />
              </figure>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all font-mono text-[0.6875rem] text-foreground-strong">
                    {hit.signature}
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-2 transition-colors group-hover:text-evidence"
                    strokeWidth={2}
                  />
                </span>

                <span className="text-[0.6875rem] leading-snug text-muted">
                  {t(`notes.${hit.noteKey}`)}
                </span>

                <span className="mt-auto flex items-center gap-2">
                  <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong/40">
                    <span
                      className="block h-full rounded-full bg-evidence"
                      style={{ width: `${hit.similarity * 100}%` }}
                    />
                  </span>
                  <span className="font-mono text-[0.625rem] tabular-nums text-evidence">
                    {hit.similarity.toFixed(2)}
                  </span>
                  <span className="sr-only">
                    {t("match")} {(hit.similarity * 100).toFixed(0)} %
                  </span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
