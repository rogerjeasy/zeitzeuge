"use client";

import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { cn } from "@/lib/cn";

export const EXPORT_FORMATS = [
  "isadCsv",
  "ead",
  "dc",
  "iiif",
  "ricoXml",
  "xmpJpeg",
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * The commit bar (§9.2 #6).
 *
 * Save and approve are two different acts and the bar keeps them apart: saving
 * records what a human said, approving releases the record to the archive.
 * Nothing is written back automatically — §8.3 makes that a governance feature,
 * so the button that does it is the one that stays disabled until the record is
 * clean and every field has been decided.
 */
export function EditorFooter({
  decided,
  total,
  dirty,
  saving,
  saved,
  approved,
  steerOpen,
  exporting,
  exported,
  onToggleSteer,
  onSave,
  onApprove,
  onExport,
}: {
  decided: number;
  total: number;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  approved: boolean;
  steerOpen: boolean;
  exporting: boolean;
  exported: ExportFormat | null;
  onToggleSteer: () => void;
  onSave: () => void;
  onApprove: () => void;
  onExport: (format: ExportFormat) => void;
}) {
  const t = useTranslations("editor");
  const tFooter = useTranslations("editor.footer");
  const tFormats = useTranslations("editor.exportFormats");

  const complete = decided === total;
  const canApprove = complete && !dirty && !approved;

  return (
    <div className="sticky bottom-3 z-30 sm:bottom-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl border border-line bg-surface/95 px-3 py-2.5 shadow-lift backdrop-blur-md sm:px-4">
        <p aria-live="polite" className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
          {approved ? (
            <>
              <ShieldCheck aria-hidden className="size-4 shrink-0 text-corroborated" strokeWidth={2.2} />
              <span className="text-corroborated">{tFooter("approved")}</span>
            </>
          ) : dirty ? (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-review" />
              <span className="text-muted">{t("unsaved")}</span>
            </>
          ) : saved ? (
            <>
              <Check aria-hidden className="size-4 shrink-0 text-corroborated" strokeWidth={2.4} />
              <span className="text-corroborated">{tFooter("saved")}</span>
            </>
          ) : (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-line-strong" />
              <span className="text-muted">{t("progress", { done: decided, total })}</span>
            </>
          )}

          {exported && !exporting && (
            <span className="hidden text-muted-2 sm:inline">
              · {tFooter("exported", { format: tFormats(exported) })}
            </span>
          )}

          {!approved && (
            <span className="hidden text-[0.6875rem] text-muted-2 xl:inline">
              · {tFooter("approveHint")}
            </span>
          )}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSteer}
            aria-expanded={steerOpen}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[0.8125rem] transition-colors duration-150",
              steerOpen
                ? "border-evidence bg-evidence-soft text-evidence"
                : "border-line-strong text-foreground hover:border-evidence hover:text-evidence",
            )}
          >
            <RefreshCw aria-hidden className="size-3.5" strokeWidth={1.9} />
            <span className="hidden sm:inline">{t("steer.title")}</span>
            <span className="sm:hidden">{t("steer.start")}</span>
          </button>

          <Menu
            label={t("exportLabel")}
            panelClassName="min-w-[13rem]"
            trigger={({ toggle, open, ...aria }) => (
              <button
                type="button"
                data-menu-trigger
                onClick={toggle}
                {...aria}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[0.8125rem] text-foreground transition-colors duration-150 hover:border-evidence hover:text-evidence"
              >
                {exporting ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                ) : (
                  <Download aria-hidden className="size-3.5" strokeWidth={1.9} />
                )}
                {exporting ? tFooter("exporting") : tFooter("export")}
                <ChevronDown
                  aria-hidden
                  className={cn("size-3 transition-transform duration-200", open && "rotate-180")}
                  strokeWidth={2}
                />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>{t("exportLabel")}</MenuLabel>
                {EXPORT_FORMATS.map((format) => (
                  <MenuItem
                    key={format}
                    onClick={() => {
                      onExport(format);
                      close();
                    }}
                  >
                    <span className="font-mono text-[0.75rem]">{tFormats(format)}</span>
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>

          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving || approved}
            aria-busy={saving}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong disabled:pointer-events-none disabled:opacity-45"
          >
            {saving && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
            {tFooter("save")}
          </button>

          <button
            type="button"
            onClick={onApprove}
            disabled={!canApprove}
            title={canApprove ? undefined : tFooter("approveHint")}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-corroborated px-4 text-[0.8125rem] font-medium text-background transition-colors hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
          >
            {canApprove ? (
              <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.2} />
            ) : (
              <Lock aria-hidden className="size-3.5" strokeWidth={2} />
            )}
            <span className="hidden sm:inline">{tFooter("approve")}</span>
            <span className="sr-only sm:hidden">{tFooter("approve")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
