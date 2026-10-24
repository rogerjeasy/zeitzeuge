"use client";

import { useId, useImperativeHandle, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Loader2, MinusCircle, Pencil, ShieldAlert, X } from "lucide-react";
import { ConfidenceMeter, DecisionPill } from "@/components/ui/confidence";
import type {
  CaseField,
  EvidenceOut,
  HypothesisOut,
  ObjectionOut,
  ReviewAction,
} from "@/lib/api/investigation-types";
import type { Decision } from "@/lib/data/record";
import { cn } from "@/lib/cn";
import { EvidenceCard } from "./evidence-card";
import { ABSTAIN_KEYS, intlLocale, ARCHIVE_TZ } from "./labels";

const DECISIONS: ReadonlySet<string> = new Set(["emit", "emit_with_review", "abstain"]);
const REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  "accepted_unchanged",
  "edited",
  "rejected",
  "filled",
  "constraint_disabled",
]);

/** What the review screen's keyboard can ask of a row (A / C / R, ↑ / ↓). */
export type FieldRowHandle = {
  focus: () => void;
  accept: () => void;
  startCorrect: () => void;
  startReject: () => void;
};

/**
 * One of the five ranked fields, decided in place.
 *
 * The number never stands alone: the rule's one-line reason sits beside it,
 * the adjudicator's rationale under it, and the evidence it cites is one click
 * away. An empty field is shown as a decision («bewusst leer gelassen») with
 * its reason, never as a blank.
 */
export function CaseFieldRow({
  field,
  evidence,
  hypotheses,
  objections,
  canReview,
  busy,
  disabled,
  onReview,
  focused = false,
  onFocusRow,
  ref,
}: {
  field: CaseField;
  evidence: EvidenceOut[];
  hypotheses: HypothesisOut[];
  objections: ObjectionOut[];
  canReview: boolean;
  busy: boolean;
  disabled: boolean;
  onReview: (action: ReviewAction, value?: string, reason?: string) => Promise<boolean>;
  /** The keyboard's current field: ringed, and the target of A / C / R. */
  focused?: boolean;
  onFocusRow?: () => void;
  ref?: React.Ref<FieldRowHandle>;
}) {
  const t = useTranslations("investigation");
  const tc = useTranslations("investigation.case");
  const tCommon = useTranslations("common");
  const intl = intlLocale(useLocale());

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "correct" | "reject">("idle");
  const [draft, setDraft] = useState(field.value ?? "");
  const [reason, setReason] = useState("");
  const panelId = useId();
  const inputId = useId();
  const reasonId = useId();

  const decision: Decision = DECISIONS.has(field.decision) ? (field.decision as Decision) : "abstain";
  const abstained = decision === "abstain" || !field.value;
  const label = (RANKED_LABEL_KEYS as readonly string[]).includes(field.key)
    ? t(`fields.${field.key}`)
    : field.label;
  const reviewed = field.review_action !== null;
  const rowRef = useRef<HTMLLIElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        rowRef.current?.focus({ preventScroll: true });
        rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
      accept: () => {
        if (canReview && !abstained && !disabled && mode === "idle") void submit("accept");
      },
      startCorrect: () => {
        if (!canReview || disabled) return;
        setDraft(field.value ?? "");
        setMode("correct");
      },
      startReject: () => {
        if (canReview && !abstained && !disabled) setMode("reject");
      },
    }),
  );

  async function submit(action: ReviewAction) {
    const ok = await onReview(
      action,
      action === "correct" ? draft.trim() : undefined,
      reason.trim() || undefined,
    );
    if (ok) {
      setMode("idle");
      setReason("");
    }
  }

  return (
    <li
      ref={rowRef}
      tabIndex={-1}
      aria-label={label}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusRow?.();
      }}
      className={cn(
        "flex scroll-mt-24 flex-col gap-2.5 px-3 py-3.5 outline-none sm:px-4",
        focused && "relative z-[1] shadow-[inset_3px_0_0_var(--evidence)] ring-2 ring-inset ring-evidence/40",
        field.review_action === "accepted_unchanged" && "bg-corroborated-soft/40",
        field.review_action === "rejected" && "bg-refuted-soft/35",
        (field.review_action === "edited" || field.review_action === "filled") && "bg-evidence-soft/40",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {field.rank !== null && (
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
            {tc("rank", { n: field.rank })}
          </span>
        )}
        <span className="text-[0.8125rem] font-medium text-foreground">{label}</span>
        {reviewed && (
          <span className="rounded-full bg-evidence-soft px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-evidence">
            {field.review_action && REVIEW_ACTIONS.has(field.review_action)
              ? tc(`reviewAction.${field.review_action}`)
              : field.review_action}
            {field.reviewed_by && ` · ${field.reviewed_by}`}
            {field.reviewed_at &&
              ` · ${new Intl.DateTimeFormat(intl, { dateStyle: "short", timeStyle: "short", timeZone: ARCHIVE_TZ }).format(new Date(field.reviewed_at))}`}
          </span>
        )}
      </div>

      {abstained ? (
        <div className="flex gap-2 rounded-lg border border-dashed border-abstain/40 bg-abstain-soft/50 px-3 py-2.5">
          <MinusCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-abstain" strokeWidth={1.9} />
          <div className="min-w-0">
            <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-abstain">
              {tc("leftEmpty")}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              {field.abstain_reason && ABSTAIN_KEYS.has(field.abstain_reason)
                ? tc(`abstainReasons.${field.abstain_reason}`)
                : (field.abstain_reason ?? tc("abstainReasons.unknown"))}
            </p>
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "text-[1rem] leading-snug text-foreground-strong [overflow-wrap:anywhere]",
            field.review_action === "rejected" && "text-muted line-through decoration-refuted/60",
          )}
        >
          {field.value}
        </p>
      )}

      {/* the verdict, the number, and the rule's reason for the number */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <DecisionPill decision={decision} label={t(`decision.${decision}`)} />
        {field.confidence !== null && (
          <ConfidenceMeter value={field.confidence} decision={decision} label={tCommon("confidence")} />
        )}
        {field.explanation && (
          <span className="min-w-0 basis-full text-[0.75rem] leading-snug text-muted sm:basis-auto sm:flex-1">
            {field.explanation}
          </span>
        )}
      </div>

      {field.rationale && (
        <div className="rounded-lg border-l-2 border-line-strong bg-surface-2/50 px-3 py-2">
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
            {tc("rationale")}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {field.rationale}
          </p>
        </div>
      )}

      {objections.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {objections.map((o, i) => (
            <li
              key={`${o.hypothesis}-${i}`}
              className="flex gap-2 rounded-lg border border-review/30 bg-review-soft/60 px-3 py-2 text-[0.75rem]"
            >
              <ShieldAlert aria-hidden className="mt-px size-3.5 shrink-0 text-review" strokeWidth={2} />
              <span className="min-w-0">
                <span className="font-medium text-review">
                  {tc("objection", { severity: o.severity.toFixed(2), resolution: o.resolution })}
                </span>{" "}
                <span className="text-foreground [overflow-wrap:anywhere]">{o.claim}</span>
                {o.model && <span className="ml-1 font-mono text-[0.625rem] text-muted-2">{o.model}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {tc("sources", { count: evidence.length })}
          {field.source_classes.length > 0 && ` · ${tc("classes", { count: field.source_classes.length })}`}
          <ChevronDown aria-hidden className={cn("size-3 transition-transform", open && "rotate-180")} strokeWidth={2} />
        </button>

        {canReview && mode === "idle" && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {busy && <Loader2 aria-hidden className="size-4 animate-spin text-muted" strokeWidth={2} />}
            {!abstained && (
              <ActionButton tone="accept" disabled={disabled} onClick={() => submit("accept")}>
                <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
                {tc("accept")}
              </ActionButton>
            )}
            <ActionButton
              disabled={disabled}
              onClick={() => {
                setDraft(field.value ?? "");
                setMode("correct");
              }}
            >
              <Pencil aria-hidden className="size-3.5" strokeWidth={1.9} />
              {abstained ? tc("fill") : tc("correct")}
            </ActionButton>
            {!abstained && (
              <ActionButton tone="reject" disabled={disabled} onClick={() => setMode("reject")}>
                <X aria-hidden className="size-3.5" strokeWidth={2.2} />
                {tc("reject")}
              </ActionButton>
            )}
          </span>
        )}
      </div>

      {canReview && mode !== "idle" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(mode === "correct" ? "correct" : "reject");
          }}
          className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2/50 p-3"
        >
          {mode === "correct" && (
            <>
              <label htmlFor={inputId} className="text-[0.6875rem] text-muted">
                {tc("correctLabel", { field: label })}
              </label>
              <input
                id={inputId}
                autoFocus
                required
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setMode("idle")}
                className="h-9 min-w-0 rounded-lg border border-evidence bg-background px-2.5 text-[0.875rem] text-foreground-strong outline-none"
              />
            </>
          )}
          {mode === "reject" && <p className="text-[0.75rem] text-foreground">{tc("rejectConfirm")}</p>}
          <label htmlFor={reasonId} className="text-[0.6875rem] text-muted">
            {tc("reasonLabel")}
          </label>
          <input
            id={reasonId}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 min-w-0 rounded-lg border border-line-strong bg-background px-2.5 text-[0.8125rem] text-foreground outline-none focus:border-evidence"
          />
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="h-9 rounded-lg px-3 text-[0.75rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={busy || (mode === "correct" && !draft.trim())}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.75rem] font-medium text-background transition-colors disabled:opacity-50",
                mode === "reject" ? "bg-refuted" : "bg-foreground hover:bg-foreground-strong",
              )}
            >
              {busy && <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />}
              {mode === "reject" ? tc("rejectSubmit") : tc("correctSubmit")}
            </button>
          </span>
        </form>
      )}

      {open && (
        <div id={panelId} className="flex flex-col gap-2">
          {evidence.length === 0 ? (
            <p className="text-[0.75rem] text-muted">{tc("noCited")}</p>
          ) : (
            evidence.map((e) => <EvidenceCard key={e.id} evidence={e} compact />)
          )}
          {hypotheses.length > 0 && (
            <div className="rounded-lg border border-line px-3 py-2">
              <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                {tc("hypotheses")}
              </p>
              <ul className="mt-1 flex flex-col gap-1 text-[0.75rem]">
                {hypotheses.map((h) => (
                  <li key={h.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[0.625rem] text-muted-2">{h.id}</span>
                    <span className="min-w-0 text-foreground [overflow-wrap:anywhere]">{h.value}</span>
                    <span className="font-mono text-[0.625rem] tabular-nums text-muted">
                      {h.posterior !== null ? h.posterior.toFixed(2) : h.prior.toFixed(2)} · {h.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const RANKED_LABEL_KEYS = ["locality", "municipality", "building", "landscape_feature", "street"] as const;

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "accept" | "reject";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.75rem] font-medium transition-colors disabled:opacity-50",
        tone === "accept" && "border-corroborated/50 text-corroborated hover:bg-corroborated hover:text-background",
        tone === "reject" && "border-refuted/45 text-refuted hover:bg-refuted hover:text-background",
        !tone && "border-line-strong text-foreground hover:border-evidence hover:text-evidence",
      )}
    >
      {children}
    </button>
  );
}
