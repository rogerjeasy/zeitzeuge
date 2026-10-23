"use client";

import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Appears only when something has changed. Sticky at the bottom of the content
 * column so the reader never has to scroll to find out how to commit an edit.
 */
export function SaveBar({
  dirty,
  saving,
  saved,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <div
      aria-live="polite"
      className={cn(
        "sticky bottom-4 z-20 transition-[opacity,transform] duration-200 [transition-timing-function:var(--ease-archival)]",
        dirty || saved ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-lift backdrop-blur-md">
        {saved && !dirty ? (
          <p className="flex items-center gap-2 text-[0.8125rem] text-corroborated">
            <Check aria-hidden className="size-4" strokeWidth={2.4} />
            {t("saved")}
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-[0.8125rem] text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-review" />
              {t("unsaved")}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={saving}
                className="h-9 rounded-lg px-3 text-[0.8125rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
              >
                {t("discard")}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                aria-busy={saving}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong disabled:opacity-60"
              >
                {saving && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
                {t("save")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
