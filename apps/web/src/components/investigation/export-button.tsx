"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Fetches the workbook through the same-origin proxy (which adds the bearer
 * server-side) and saves it under the API's own filename. A fetch rather than
 * a bare link, so a failure is shown on the screen instead of as a JSON page
 * in a new tab. With `assetIds`, only those photos (spec §3, `asset_ids`).
 */
export function useExport(batchId: string) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const download = useCallback(
    /** Resolves to null on success, else the problem code (also kept in `failed`). */
    async (assetIds: readonly string[] = []): Promise<string | null> => {
      setBusy(true);
      setFailed(null);
      try {
        const query = assetIds.length ? `?asset_ids=${assetIds.map(encodeURIComponent).join(",")}` : "";
        const response = await fetch(`/bff/batches/${encodeURIComponent(batchId)}/export${query}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null;
          const code = body?.code ?? String(response.status);
          setFailed(code);
          return code;
        }
        const disposition = response.headers.get("content-disposition") ?? "";
        const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
        const filename = match ? decodeURIComponent(match[1]) : "zeitzeuge.xlsx";
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        return null;
      } catch {
        setFailed("network");
        return "network";
      } finally {
        setBusy(false);
      }
    },
    [batchId],
  );

  return { download, busy, failed, clearFailed: () => setFailed(null) };
}

/** «Excel exportieren» for the whole batch. */
export function ExportButton({
  batchId,
  className,
  compact = false,
}: {
  batchId: string;
  className?: string;
  /** The header's secondary style, next to the other batch actions. */
  compact?: boolean;
}) {
  const t = useTranslations("investigation.batch");
  const { download, busy, failed } = useExport(batchId);

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        aria-busy={busy}
        className={cn(
          "inline-flex items-center gap-2 font-semibold transition-colors disabled:opacity-60",
          compact
            ? "h-10 rounded-lg bg-corroborated px-3.5 text-[0.8125rem] text-background hover:opacity-90"
            : "h-11 rounded-xl bg-corroborated px-5 text-[0.875rem] text-background shadow-[0_1px_2px_rgb(7_20_34/0.18)] hover:opacity-90",
        )}
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <FileSpreadsheet aria-hidden className="size-4" strokeWidth={2} />
        )}
        {busy ? t("exporting") : t("export")}
      </button>
      {failed && (
        <p role="alert" className="text-[0.75rem] text-refuted">
          {t("exportFailed", { code: failed })}
        </p>
      )}
    </div>
  );
}
