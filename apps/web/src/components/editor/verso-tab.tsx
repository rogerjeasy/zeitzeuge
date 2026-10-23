"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, ScanLine } from "lucide-react";
import type { CaseFile } from "@/lib/data/editor";
import { cn } from "@/lib/cn";

/**
 * The back of the print, read twice.
 *
 * Two readers work the same annotation; the line where they disagree is
 * escalated rather than silently resolved, which is the whole argument for an
 * ensemble instead of one OCR pass. The script is a rendering, not a scan — a
 * real Kurrent hand is the archive's own material and not ours to publish.
 */
export function VersoTab({ record }: { record: CaseFile }) {
  const t = useTranslations("editor.versoTab");
  const lines = record.versoLines;

  if (!lines) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-abstain-soft text-abstain">
          <ScanLine aria-hidden className="size-5" strokeWidth={1.8} />
        </span>
        <p className="font-display text-[1rem] text-foreground-strong">{t("missingTitle")}</p>
        <p className="max-w-[44ch] text-[0.8125rem] leading-relaxed text-muted">
          {t("missingBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <figure className="relative overflow-hidden rounded-[0.625rem] border border-line-strong bg-[#e8dcc4] shadow-plate">
        <div aria-hidden className="texture-grain absolute inset-0" />
        <div className="relative flex flex-col justify-center gap-3.5 p-5">
          {lines.map((line) => (
            <p
              key={line.raw}
              className="font-display text-[0.9375rem] italic leading-tight text-[#4a3c28] [text-shadow:0_1px_0_rgb(255_255_255/0.4)]"
              style={{ transform: "rotate(-1.2deg)" }}
            >
              {line.raw}
            </p>
          ))}
        </div>
        <figcaption className="relative border-t border-[#c4b393] bg-[#ddcfb2] px-3 py-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[#6b5940]">
          {t("original")}
        </figcaption>
      </figure>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-evidence-bright" />
          {t("readerA")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-review" />
          {t("readerB")}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li
            key={line.raw}
            className={cn(
              "rounded-lg border px-2.5 py-2",
              line.agree ? "border-line bg-surface-2/50" : "border-review/40 bg-review-soft",
            )}
          >
            <p className="font-mono text-[0.6875rem] leading-snug text-foreground">
              {line.reading}
            </p>
            <p
              className={cn(
                "mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]",
                line.agree ? "text-corroborated" : "text-review",
              )}
            >
              {line.agree ? (
                <Check aria-hidden className="size-2.5" strokeWidth={3} />
              ) : (
                <AlertTriangle aria-hidden className="size-2.5" strokeWidth={2.5} />
              )}
              {line.agree ? t("agree") : t("conflict")}
              {line.normalised && <span className="text-muted-2">· {t("normalised")}</span>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
