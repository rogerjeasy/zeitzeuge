"use client";

import { useTranslations } from "next-intl";
import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The back of the photograph. Two readers work the same pencil annotation; the
 * line where they disagree is escalated rather than silently resolved, which is
 * the whole argument for running an ensemble instead of one OCR.
 *
 * The script is a rendering, not a scan — a real Kurrent hand would be an
 * archive's own material and is not ours to publish.
 */
const LINES = [
  { raw: "Brunnen a/ Vierwaldstättersee", reading: "Brunnen a/ Vierwaldstättersee", agree: true },
  { raw: "Gde. Ingenbohl, Kt. Schwyz", reading: "Gemeinde Ingenbohl, Kanton Schwyz", agree: true, normalised: true },
  { raw: "Aufn. Sommer 189?", reading: "Aufnahme Sommer 189[7|9]", agree: false },
];

export function VersoPanel() {
  const t = useTranslations("capabilities.versoDemo");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* the scan */}
      <figure className="relative overflow-hidden rounded-[0.625rem] border border-line-strong bg-[#e8dcc4] shadow-plate">
        <div aria-hidden className="texture-grain absolute inset-0" />
        <div className="relative flex aspect-[4/3] flex-col justify-center gap-4 p-5 sm:p-6">
          {LINES.map((line) => (
            <p
              key={line.raw}
              className="font-display text-[0.9375rem] italic leading-tight text-[#4a3c28] [text-shadow:0_1px_0_rgb(255_255_255/0.4)] sm:text-base"
              style={{ transform: "rotate(-1.2deg)" }}
            >
              {line.raw}
            </p>
          ))}
          <span className="absolute bottom-3 right-4 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-[#8a7350]">
            verso
          </span>
        </div>
        <figcaption className="relative border-t border-[#c4b393] bg-[#ddcfb2] px-3 py-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[#6b5940]">
          {t("original")} · {t("handwriting")}
        </figcaption>
      </figure>

      {/* the two readers */}
      <div className="flex flex-col gap-2.5 rounded-[0.625rem] border border-line bg-surface/70 p-3.5">
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
          {LINES.map((line) => (
            <li
              key={line.raw}
              className={cn(
                "rounded-lg border px-2.5 py-2",
                line.agree
                  ? "border-line bg-surface-2/50"
                  : "border-review/40 bg-review-soft",
              )}
            >
              <p className="font-mono text-[0.6875rem] leading-snug text-foreground">
                {line.reading}
              </p>
              <p
                className={cn(
                  "mt-1 flex items-center gap-1.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]",
                  line.agree ? "text-corroborated" : "text-review",
                )}
              >
                {line.agree ? (
                  <Check aria-hidden className="size-2.5" strokeWidth={3} />
                ) : (
                  <AlertTriangle aria-hidden className="size-2.5" strokeWidth={2.5} />
                )}
                {line.agree ? t("agreement") : t("conflict")}
                {line.normalised && (
                  <span className="text-muted-2">· {t("normalised")}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
