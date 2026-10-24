"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ExternalLink, ImageOff, RotateCw, Loader2, Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSessionUser } from "@/components/auth/session-provider";
import {
  FINISHED_RUN_STATUSES,
  RANKED_FIELD_KEYS,
  type CaseFile,
  type ReviewAction,
} from "@/lib/api/investigation-types";
import { getCaseFileAction, rerunAction, reviewFieldAction } from "@/lib/investigation/actions";
import { cn } from "@/lib/cn";
import { QcPill, StatusPill } from "./pills";
import { StageTrack } from "./stage-track";
import { ApiNotice } from "./api-notice";
import { CaseFieldRow } from "./case-field-row";
import { EvidenceCard } from "./evidence-card";
import { intlLocale, ARCHIVE_TZ } from "./labels";

const POLL_MS = 15_000;

/**
 * The Case File on a real investigation (`GET /assets/{id}/case`).
 *
 * Same three-pane reading order as the demo editor — photograph, record,
 * context — but every value, number, reason and source on it comes from the
 * API, and every decision is written back as a new record version with
 * `If-Match`. A stale version is a 409: the screen reloads and says so rather
 * than overwriting someone else's review.
 */
export function CaseScreen({ initial }: { initial: CaseFile }) {
  const t = useTranslations("investigation.case");
  const locale = useLocale();
  const intl = intlLocale(locale);
  const user = useSessionUser();

  const [record, setRecord] = useState(initial);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ code: string } | { conflict: true } | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const running = record.run !== null && !FINISHED_RUN_STATUSES.has(record.run.status) && record.run.status !== "failed";

  // While the run is still going, look again every 15 s.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const next = await getCaseFileAction(record.asset_id);
      if (next.ok) setRecord(next.data);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, record.asset_id]);

  const ranked = useMemo(() => {
    const byKey = new Map(record.fields.map((f) => [f.key, f]));
    return RANKED_FIELD_KEYS.map((key) => byKey.get(key)).filter((f) => f !== undefined);
  }, [record.fields]);

  const evidenceById = useMemo(
    () => new Map(record.evidence.map((e) => [e.id, e])),
    [record.evidence],
  );

  async function review(fieldKey: string, action: ReviewAction, value?: string, reason?: string) {
    if (!record.record_id) return false;
    setBusyField(fieldKey);
    setNotice(null);
    const result = await reviewFieldAction({
      recordId: record.record_id,
      fieldKey,
      action,
      value,
      reason,
      version: record.version,
    });
    setBusyField(null);
    if (result.ok) {
      setRecord(result.data);
      return true;
    }
    if (result.status === 409 || result.code === "version_conflict") {
      const fresh = await getCaseFileAction(record.asset_id);
      if (fresh.ok) setRecord(fresh.data);
      setNotice({ conflict: true });
      return false;
    }
    setNotice({ code: result.code });
    return false;
  }

  async function rerun() {
    setRerunning(true);
    setNotice(null);
    const result = await rerunAction(record.asset_id);
    if (result.ok) {
      const fresh = await getCaseFileAction(record.asset_id);
      if (fresh.ok) setRecord(fresh.data);
    } else {
      setNotice({ code: result.code });
    }
    setRerunning(false);
  }

  const time = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(new Date(iso));
  const cost = record.run
    ? new Intl.NumberFormat(intl, { style: "currency", currency: "USD", maximumFractionDigits: 3 }).format(
        record.run.cost_usd,
      )
    : "—";

  const readOnly = user.isGuest;
  const canReview = Boolean(record.record_id) && !readOnly;

  return (
    <div className="mx-auto flex w-full max-w-[104rem] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3">
        <Link
          href={record.batch_id ? `/batches/${record.batch_id}` : "/batches"}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-[0.75rem] text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="break-all font-mono text-[clamp(1.0625rem,0.95rem+0.5vw,1.375rem)] font-medium leading-tight tracking-[-0.01em] text-foreground-strong">
              {record.external_ref}
            </h1>
            <p className="text-[0.8125rem] text-muted">
              {record.priority !== null && <>{t("priority", { n: record.priority })} · </>}
              {record.version !== null ? t("version", { n: record.version }) : t("noRecord")}
              {record.row_confidence !== null && (
                <> · {t("rowConfidence", { value: record.row_confidence.toFixed(2) })}</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={record.status_label} />
            <QcPill status={record.qc_status} />
          </div>
        </div>
      </header>

      {notice && "conflict" in notice && <ApiNotice code="version_conflict" />}
      {notice && "code" in notice && <ApiNotice code={notice.code} />}
      {readOnly && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[0.75rem] text-muted">
          <Info aria-hidden className="mt-px size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          {t("guestReadOnly")}
        </p>
      )}

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]">
        {/*
          Photo and ledger share the left column up to 1536 px, so the tall
          record beside them never leaves a hole under the photo; from 2xl the
          wrapper dissolves (`contents`) and they become columns one and three.
        */}
        <div className="flex min-w-0 flex-col gap-5 2xl:contents">
        {/* the photograph and what produced this record */}
        <section className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface 2xl:order-1 2xl:sticky 2xl:top-[4.5rem]">
          <div className="grid aspect-[4/3] place-items-center bg-surface-2">
            {record.preview_url ? (
              // A presigned S3 URL that expires: not for the image optimiser.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={record.preview_url}
                alt={t("photoAlt", { name: record.external_ref })}
                loading="eager"
                fetchPriority="high"
                className="size-full object-contain"
              />
            ) : (
              <span className="flex flex-col items-center gap-2 text-[0.75rem] text-muted-2">
                <ImageOff aria-hidden className="size-6" strokeWidth={1.6} />
                {t("noPreview")}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-line px-4 py-3.5 text-[0.75rem]">
            <dt className="text-muted">{t("exifDate")}</dt>
            <dd className="font-mono text-foreground">
              {record.captured_at ? time(record.captured_at) : t("unknown")}
            </dd>
            <dt className="text-muted">{t("camera")}</dt>
            <dd className="text-foreground">{record.camera ?? t("unknown")}</dd>
            <dt className="text-muted">{t("run")}</dt>
            <dd className="break-all font-mono text-foreground">{record.run?.id ?? "—"}</dd>
            {record.run && (
              <>
                <dt className="text-muted">{t("progress")}</dt>
                <dd>
                  <StageTrack stage={record.run.stage} runStatus={record.run.status} />
                </dd>
                <dt className="text-muted">{t("models")}</dt>
                <dd className="flex flex-wrap gap-1">
                  {record.run.models.length === 0
                    ? "—"
                    : record.run.models.map((m) => (
                        <span
                          key={m}
                          className="max-w-full truncate rounded-md border border-line bg-surface-2/60 px-1.5 py-0.5 font-mono text-[0.625rem] text-foreground"
                          title={m}
                        >
                          {m}
                        </span>
                      ))}
                </dd>
                <dt className="text-muted">{t("cost")}</dt>
                <dd className="font-mono tabular-nums text-foreground">{cost}</dd>
                {record.run.finished_at && (
                  <>
                    <dt className="text-muted">{t("finished")}</dt>
                    <dd className="font-mono text-foreground">{time(record.run.finished_at)}</dd>
                  </>
                )}
              </>
            )}
          </dl>
          {record.run?.error && (
            <p className="border-t border-line px-4 py-2.5 text-[0.75rem] text-refuted">{record.run.error}</p>
          )}
          {!readOnly && (
            <div className="border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={rerun}
                disabled={rerunning || running}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] text-foreground transition-colors hover:border-evidence hover:text-evidence disabled:opacity-50"
              >
                {rerunning ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                ) : (
                  <RotateCw aria-hidden className="size-3.5" strokeWidth={2} />
                )}
                {t("rerun")}
              </button>
              <p className="mt-1.5 text-[0.6875rem] text-muted-2">{t("rerunHint")}</p>
            </div>
          )}
        </section>

        {/* the whole ledger: every evidence item and what the run did */}
        <section className="flex min-w-0 flex-col gap-5 2xl:order-3 2xl:sticky 2xl:top-[4.5rem]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <h2 className="font-display text-[1.0625rem] text-foreground-strong">
                {t("evidenceTitle", { count: record.evidence.length })}
              </h2>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{t("evidenceHint")}</p>
            </header>
            {record.evidence.length === 0 ? (
              <p className="px-4 py-6 text-[0.8125rem] text-muted">{t("noEvidence")}</p>
            ) : (
              <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto p-3">
                {record.evidence.map((e) => (
                  <li key={e.id}>
                    <EvidenceCard evidence={e} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {record.events.length > 0 && (
            <details className="group min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <summary className="cursor-pointer list-none px-4 py-3 font-display text-[0.9375rem] text-foreground-strong">
                {t("eventsTitle", { count: record.events.length })}
              </summary>
              <ol className="flex max-h-[24rem] flex-col divide-y divide-line overflow-y-auto border-t border-line">
                {record.events.map((ev) => (
                  <li key={ev.seq} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-4 py-2 text-[0.75rem]">
                    <span className="font-mono tabular-nums text-muted-2">
                      {(ev.t_ms / 1000).toFixed(1)} s
                    </span>
                    <span className="min-w-0">
                      <span className="font-mono text-[0.625rem] uppercase tracking-[0.06em] text-evidence">
                        {ev.agent}
                      </span>{" "}
                      <span className="text-foreground">{ev.summary}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {record.evidence.some((e) => e.source_uri) && (
            <p className="flex items-center gap-1.5 px-1 text-[0.6875rem] text-muted-2">
              <ExternalLink aria-hidden className="size-3" strokeWidth={2} />
              {t("linksHint")}
            </p>
          )}
        </section>
        </div>

        {/* the five ranked fields */}
        <section
          aria-labelledby="case-fields-heading"
          className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface 2xl:order-2"
        >
          <header className="border-b border-line px-4 py-3">
            <h2 id="case-fields-heading" className="font-display text-[1.0625rem] text-foreground-strong">
              {t("fieldsTitle")}
            </h2>
            <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{t("fieldsHint")}</p>
          </header>
          {ranked.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.8125rem] text-muted">
              {running ? t("stillRunning") : t("noFields")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {ranked.map((field) => (
                <CaseFieldRow
                  key={`${field.key}-${record.version}`}
                  field={field}
                  evidence={field.evidence.map((id) => evidenceById.get(id)).filter((e) => e !== undefined)}
                  hypotheses={record.hypotheses.filter((h) => h.field === field.key)}
                  objections={record.objections.filter((o) =>
                    record.hypotheses.some((h) => h.field === field.key && h.id === o.hypothesis),
                  )}
                  canReview={canReview}
                  busy={busyField === field.key}
                  disabled={busyField !== null}
                  onReview={(action, value, reason) => review(field.key, action, value, reason)}
                />
              ))}
            </ul>
          )}
        </section>

      </div>

      {!record.record_id && !running && (
        <p className={cn("text-center text-[0.8125rem] text-muted")}>{t("noRecordHint")}</p>
      )}
    </div>
  );
}
