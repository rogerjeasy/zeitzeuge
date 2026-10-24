"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  Info,
  Keyboard,
  Loader2,
  Maximize2,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSessionUser } from "@/components/auth/session-provider";
import {
  FINISHED_RUN_STATUSES,
  RANKED_FIELD_KEYS,
  type CaseFile,
  type ReviewAction,
} from "@/lib/api/investigation-types";
import {
  bulkAssetsAction,
  getCaseFileAction,
  rerunAction,
  restoreAssetAction,
  reviewFieldAction,
} from "@/lib/investigation/actions";
import { BULK_DETAILS } from "@/lib/investigation/bulk";
import { capabilitiesFor } from "@/lib/investigation/permissions";
import { originListHref, reviewHref, type ReviewNav } from "@/lib/investigation/review-nav";
import { SHORTCUT_HELP, shortcutFor } from "@/lib/investigation/shortcuts";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { QcPill, StatusPill } from "./pills";
import { StageTrack } from "./stage-track";
import { ApiNotice } from "./api-notice";
import { CaseFieldRow, type FieldRowHandle } from "./case-field-row";
import { EvidenceCard } from "./evidence-card";
import { PhotoLightbox } from "./photo-lightbox";
import { SubjectMap } from "./subject-map";
import { StageTimeline } from "./stage-timeline";
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
 *
 * Batch management (spec 2026-10-24 §4): previous / next within the list the
 * archivist came from (`nav`, resolved on the server), the keyboard (J/K,
 * A/C/R, ↑/↓, ?), «Alle offenen Felder übernehmen», the subject point on the
 * swisstopo map, the photo full screen, and the banner for a withdrawn photo.
 */
export function CaseScreen({ initial, nav = null }: { initial: CaseFile; nav?: ReviewNav | null }) {
  const t = useTranslations("investigation.case");
  const tr = useTranslations("investigation.review");
  const tm = useTranslations("investigation.manage");
  const locale = useLocale();
  const intl = intlLocale(locale);
  const user = useSessionUser();
  const can = capabilitiesFor(user.role);
  const router = useRouter();

  const [record, setRecord] = useState(initial);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ code: string } | { conflict: true } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const rowRefs = useRef(new Map<string, FieldRowHandle>());
  const withdrawn = Boolean(record.deleted_at);

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

  const subjectPoint = useMemo(() => record.fields.find((f) => f.key === "subject_point"), [record.fields]);
  const openFields = ranked.filter((f) => f.decision !== "abstain" && f.value && f.review_action === null);

  const prevHref = nav?.prevId ? reviewHref(nav.prevId, nav.origin, nav.filter) : null;
  const nextHref = nav?.nextId ? reviewHref(nav.nextId, nav.origin, nav.filter) : null;

  useEffect(() => {
    if (nextHref) router.prefetch(nextHref);
  }, [nextHref, router]);

  // After a decision the rows remount (new version); keep the keyboard's place.
  useEffect(() => {
    if (focusIndex === null) return;
    const field = ranked[focusIndex];
    if (field) rowRefs.current.get(field.key)?.focus();
    // Only on a new version, not on every focus move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.version]);

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
      // A 409 on a withdrawn photo is not a conflict: the banner says what happened.
      setNotice(fresh.ok && fresh.data.deleted_at ? null : { conflict: true });
      return false;
    }
    setNotice({ code: result.code });
    return false;
  }

  async function acceptAll() {
    setAcceptingAll(true);
    setNotice(null);
    setFlash(null);
    const result = await bulkAssetsAction({ action: "accept", assetIds: [record.asset_id] });
    if (result.ok) {
      const item = result.data.results[0];
      const fresh = await getCaseFileAction(record.asset_id);
      if (fresh.ok) setRecord(fresh.data);
      setFlash(
        item?.ok
          ? tr("acceptAllDone", { count: openFields.length })
          : tm(`detail.${(BULK_DETAILS as readonly string[]).includes(String(item?.detail)) ? item!.detail : "other"}`, {
              count: 1,
            }),
      );
    } else {
      setNotice({ code: result.code });
    }
    setAcceptingAll(false);
  }

  async function restore() {
    setRestoring(true);
    setNotice(null);
    const result = await restoreAssetAction(record.asset_id);
    if (result.ok) {
      const fresh = await getCaseFileAction(record.asset_id);
      if (fresh.ok) setRecord(fresh.data);
      else setRecord((r) => ({ ...r, deleted_at: null, deletion_reason: null }));
      setFlash(tm("result.restore", { ok: 1, n: 1 }));
    } else {
      setNotice({ code: result.code });
    }
    setRestoring(false);
  }

  function moveFocus(delta: number) {
    if (ranked.length === 0) return;
    const next =
      focusIndex === null ? (delta > 0 ? 0 : ranked.length - 1) : Math.min(ranked.length - 1, Math.max(0, focusIndex + delta));
    setFocusIndex(next);
    rowRefs.current.get(ranked[next].key)?.focus();
  }

  // The review keyboard. Off while typing, while a dialog is open, and with modifiers.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      const el = event.target as HTMLElement | null;
      const action = shortcutFor(event, el ? { tagName: el.tagName, isContentEditable: el.isContentEditable, type: (el as HTMLInputElement).type, role: el.getAttribute("role") } : null);
      if (!action || action === "close") return;
      if (action === "next" || action === "prev") {
        const href = action === "next" ? nextHref : prevHref;
        if (!href) return;
        event.preventDefault();
        router.push(href);
        return;
      }
      if (action === "help") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (ranked.length === 0) return;
      event.preventDefault();
      if (action === "fieldUp") return moveFocus(-1);
      if (action === "fieldDown") return moveFocus(1);
      // A / C / R act on the focused field; the first press only picks one.
      if (focusIndex === null) return moveFocus(1);
      const handle = rowRefs.current.get(ranked[focusIndex].key);
      if (action === "accept") handle?.accept();
      else if (action === "correct") handle?.startCorrect();
      else if (action === "reject") handle?.startReject();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
  // Accept / correct / reject: admin, archivist, reviewer — and never on a withdrawn photo.
  const canReview = Boolean(record.record_id) && can.canReview && !withdrawn;
  const backHref = nav ? originListHref(nav.origin, nav.filter) : record.batch_id ? `/batches/${record.batch_id}` : "/batches";

  return (
    <div className="mx-auto flex w-full max-w-[104rem] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg py-1 text-[0.75rem] text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-3.5" strokeWidth={2} />
            {nav?.origin.kind === "queue" ? tr("backToQueue") : t("back")}
          </Link>
          <nav aria-label={tr("navLabel")} className="flex flex-wrap items-center gap-1.5">
            {nav && (
              <>
                <StepLink href={prevHref} label={tr("prev")} keys="K">
                  <ChevronLeft aria-hidden className="size-4" strokeWidth={2} />
                </StepLink>
                <p className="min-w-[5.5rem] px-1 text-center font-mono text-[0.75rem] tabular-nums text-muted">
                  {nav.position !== null
                    ? tr("position", { n: nav.position, total: nav.total })
                    : tr("notInList", { total: nav.total })}
                </p>
                <StepLink href={nextHref} label={tr("next")} keys="J" next>
                  <ChevronRight aria-hidden className="size-4" strokeWidth={2} />
                </StepLink>
              </>
            )}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-keyshortcuts="?"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[0.75rem] text-muted transition-colors hover:border-evidence hover:text-evidence"
            >
              <Keyboard aria-hidden className="size-3.5" strokeWidth={2} />
              {tr("shortcuts")}
            </button>
          </nav>
        </div>
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

      {withdrawn && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-refuted/35 bg-refuted-soft px-3.5 py-3"
        >
          <Trash2 aria-hidden className="size-4 shrink-0 text-refuted" strokeWidth={2} />
          <p className="min-w-0 flex-[1_1_18rem] text-[0.8125rem] text-refuted">
            <span className="font-semibold">{tr("withdrawnTitle")}</span>{" "}
            {record.deleted_at && tm("withdrawnAt", { time: time(record.deleted_at) })}
            {record.deletion_reason && <> · «{record.deletion_reason}»</>} {tm("masterKept", { count: 1 })}
          </p>
          {can.canApprove && (
            <button
              type="button"
              onClick={() => void restore()}
              disabled={restoring}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[0.75rem] font-medium text-background transition-colors hover:bg-foreground-strong disabled:opacity-60"
            >
              {restoring ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
              )}
              {tm("restore")}
            </button>
          )}
        </div>
      )}
      <p role="status" className={cn("text-[0.8125rem] text-corroborated", !flash && "sr-only")}>
        {flash}
      </p>
      {notice && "conflict" in notice && <ApiNotice code="version_conflict" />}
      {notice && "code" in notice && <ApiNotice code={notice.code} />}
      {(readOnly || (!can.canReview && !withdrawn)) && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[0.75rem] text-muted">
          <Info aria-hidden className="mt-px size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
          {readOnly ? t("guestReadOnly") : can.canWrite ? tr("operatorNoReview") : tr("readerNoReview")}
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
        <div className="flex min-w-0 flex-col gap-5 2xl:order-1">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <div className="grid aspect-[4/3] place-items-center bg-surface-2">
            {record.preview_url ? (
              <button
                type="button"
                onClick={() => setLightbox(true)}
                aria-label={tr("enlarge", { name: record.external_ref })}
                className="group relative size-full cursor-zoom-in"
              >
                {/* A presigned S3 URL that expires: not for the image optimiser. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={record.preview_url}
                  alt={t("photoAlt", { name: record.external_ref })}
                  loading="eager"
                  fetchPriority="high"
                  className={cn("size-full object-contain", withdrawn && "grayscale")}
                />
                <span
                  aria-hidden
                  className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-lg bg-ink-panel/75 text-ink-panel-fg opacity-80 transition-opacity group-hover:opacity-100"
                >
                  <Maximize2 className="size-4" strokeWidth={2} />
                </span>
              </button>
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
          {can.canWrite && !withdrawn && (
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
        {record.run && <StageTimeline run={record.run} />}
        <SubjectMap field={subjectPoint} />
        </div>

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
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h2 id="case-fields-heading" className="font-display text-[1.0625rem] text-foreground-strong">
                {t("fieldsTitle")}
              </h2>
              {canReview && (
                <button
                  type="button"
                  onClick={() => void acceptAll()}
                  disabled={acceptingAll || busyField !== null || openFields.length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-corroborated/50 px-2.5 text-[0.75rem] font-medium text-corroborated transition-colors hover:bg-corroborated hover:text-background disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-corroborated"
                >
                  {acceptingAll ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
                  ) : (
                    <CheckCheck aria-hidden className="size-3.5" strokeWidth={2.2} />
                  )}
                  {tr("acceptAll", { count: openFields.length })}
                </button>
              )}
            </div>
            <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{t("fieldsHint")}</p>
          </header>
          {ranked.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.8125rem] text-muted">
              {running ? t("stillRunning") : t("noFields")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {ranked.map((field, index) => (
                <CaseFieldRow
                  key={`${field.key}-${record.version}`}
                  ref={(handle) => {
                    if (handle) rowRefs.current.set(field.key, handle);
                    else rowRefs.current.delete(field.key);
                  }}
                  focused={focusIndex === index}
                  onFocusRow={() => setFocusIndex(index)}
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

      {record.preview_url && (
        <PhotoLightbox
          src={record.preview_url}
          alt={t("photoAlt", { name: record.external_ref })}
          open={lightbox}
          onClose={() => setLightbox(false)}
        />
      )}

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={tr("helpTitle")}
        description={<p>{tr("helpBody")}</p>}
        footer={
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
          >
            {tr("helpClose")}
          </button>
        }
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[0.8125rem]">
          {SHORTCUT_HELP.map((item) => (
            <div key={item.id} className="contents">
              <dt className="flex gap-1">
                {item.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-7 rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 text-center font-mono text-[0.75rem] text-foreground-strong"
                  >
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="text-foreground">{tr(`keys.${item.id}`)}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}

function StepLink({
  href,
  label,
  keys,
  next = false,
  children,
}: {
  href: string | null;
  label: string;
  keys: string;
  next?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[0.75rem] font-medium transition-colors";
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(className, "border-line text-muted-2")}>
        {!next && children}
        {label}
        {next && children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-keyshortcuts={keys}
      className={cn(className, "border-line-strong bg-surface text-foreground hover:border-evidence hover:text-evidence")}
    >
      {!next && children}
      {label}
      {next && children}
    </Link>
  );
}
