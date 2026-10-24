"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import type { QcImportResult } from "@/lib/api/investigation-types";
import { importQcLabelsAction } from "@/lib/investigation/actions";
import { capabilitiesFor } from "@/lib/investigation/permissions";
import { useSessionUser } from "@/components/auth/session-provider";
import { ApiNotice } from "./api-notice";

/**
 * «Prüf-Excel importieren»: the team's labelled copy of the export (green cells
 * are the truth) becomes reviews — accepted, corrected or filled — exactly as
 * if each field had been decided on the review screen. Fields already reviewed
 * in the app are left alone, so importing twice changes nothing.
 */
export function QcImport({ batchId }: { batchId: string }) {
  const t = useTranslations("evaluation.import");
  const can = capabilitiesFor(useSessionUser().role);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QcImportResult | null>(null);

  if (!can.canReview) return null;

  async function upload(file: File) {
    setError(null);
    setResult(null);
    setBusy(true);
    const form = new FormData();
    form.set("batchId", batchId);
    form.set("file", file);
    const response = await importQcLabelsAction(form);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!response.ok) return setError(response.code);
    setResult(response.data);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{t("title")}</h2>
        <p className="max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">{t("body")}</p>
        {result && (
          <p role="status" className="text-[0.8125rem] font-medium text-foreground">
            {t("done", {
              photos: result.photos,
              accepted: result.accepted,
              edited: result.edited,
              filled: result.filled,
              skipped: result.already_reviewed,
            })}
            {result.unmatched.length > 0 && (
              <span className="block font-normal text-muted">
                {t("unmatched", { count: result.unmatched.length })}
              </span>
            )}
            {result.label_issues.length > 0 && (
              <span className="block font-normal text-muted">
                {t("labelIssues", { list: result.label_issues.join(" · ") })}
              </span>
            )}
          </p>
        )}
        {error && <ApiNotice code={error} className="mt-1" />}
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence disabled:opacity-60"
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <FileSpreadsheet aria-hidden className="size-4" strokeWidth={2} />
        )}
        {busy ? t("busy") : t("cta")}
      </button>
    </section>
  );
}
