"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Layers, Check } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";

/**
 * §9.2 #7: bulk accept above a confidence threshold the archivist sets.
 *
 * The slider previews live — the matching rows highlight in the list behind it —
 * so nothing enters the catalogue without the archivist having seen the set
 * it would sweep up. Confirmation is a second, deliberate step.
 */
export function BulkAccept({
  threshold,
  onThreshold,
  matching,
  remaining,
  onAccept,
  disabled,
}: {
  threshold: number;
  onThreshold: (next: number) => void;
  matching: number;
  remaining: number;
  onAccept: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("queue");
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-evidence-soft text-evidence">
          <Layers aria-hidden className="size-4" strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[0.875rem] font-medium text-foreground-strong">{t("bulkTitle")}</h2>
          <p className="max-w-[72ch] text-[0.75rem] leading-snug text-muted">{t("bulkHint")}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <Slider
          label={t("bulkThreshold")}
          value={threshold}
          min={0.5}
          max={1}
          step={0.01}
          onChange={onThreshold}
          valueLabel={threshold.toFixed(2)}
          marks={[
            { value: 0.5, label: "0.50" },
            { value: 1, label: "1.00" },
          ]}
        />

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <p className="text-[0.75rem] text-muted">
            <span className={cn("font-medium", matching > 0 ? "text-corroborated" : "text-muted")}>
              {t("bulkPreview", { count: matching })}
            </span>
            {" · "}
            {t("bulkRemaining", { count: remaining })}
          </p>

          {confirming ? (
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <p className="max-w-[46ch] text-[0.75rem] leading-snug text-muted lg:text-right">
                <span className="font-medium text-foreground">
                  {t("bulkConfirmTitle", { count: matching })}
                </span>{" "}
                {t("bulkConfirmBody")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAccept();
                    setConfirming(false);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-corroborated px-3.5 text-[0.8125rem] font-medium text-background"
                >
                  <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
                  {t("bulkConfirmCta")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-9 rounded-lg px-3 text-[0.8125rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={disabled || matching === 0}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-corroborated hover:text-corroborated disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check aria-hidden className="size-3.5" strokeWidth={2.2} />
              {t("bulkCta", { count: matching })}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
