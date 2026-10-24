"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * «Excel exportieren»: fetches the workbook through the same-origin proxy
 * (which adds the bearer server-side) and saves it under the API's own
 * filename. A fetch rather than a bare link, so a failure is shown here
 * instead of as a JSON page in a new tab.
 */
export function ExportButton({ batchId, className }: { batchId: string; className?: string }) {
  const t = useTranslations("investigation.batch");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch(`/bff/batches/${encodeURIComponent(batchId)}/export`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        setFailed(body?.code ?? String(response.status));
        return;
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
    } catch {
      setFailed("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-corroborated px-5 text-[0.875rem] font-semibold text-background shadow-[0_1px_2px_rgb(7_20_34/0.18)] transition-colors hover:opacity-90 disabled:opacity-60"
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
