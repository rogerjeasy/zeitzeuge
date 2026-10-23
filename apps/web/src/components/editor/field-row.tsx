"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X, Pencil, ChevronDown, MinusCircle, UserPen } from "lucide-react";
import { ConfidenceMeter, DecisionPill } from "@/components/ui/confidence";
import type { EditorField } from "@/lib/data/editor";
import { ProvenancePanel } from "./provenance-panel";
import { cn } from "@/lib/cn";

export type Verdict = "pending" | "accepted" | "rejected";

export interface FieldState {
  verdict: Verdict;
  value: string;
  edited: boolean;
}

/**
 * One catalogue field, decided in place.
 *
 * Pointing at the row lights up the pixels the claim rests on (§8.2): the link
 * between a sentence in a catalogue and a region of a scan is the product's
 * entire argument, so it costs a hover, not a click.
 */
export function FieldRow({
  field,
  state,
  onChange,
  activeEvidence,
  onHoverEvidence,
}: {
  field: EditorField;
  state: FieldState;
  onChange: (next: FieldState) => void;
  activeEvidence: string[];
  onHoverEvidence: (ids: string[]) => void;
}) {
  const t = useTranslations("editor");
  const tFields = useTranslations("ledger.fields");
  const tDecisions = useTranslations("ledger.decisions");
  const tCommon = useTranslations("common");

  const [showProvenance, setShowProvenance] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.value);
  const panelId = useId();
  const inputId = useId();

  const abstained = field.decision === "abstain" && !state.edited;
  const evidence = field.provenance.evidence;

  function startEdit() {
    setDraft(state.value);
    setEditing(true);
  }

  function apply() {
    const value = draft.trim();
    setEditing(false);
    if (!value || value === state.value) return;
    onChange({ verdict: "accepted", value, edited: true });
  }

  return (
    <li
      onMouseEnter={() => onHoverEvidence(evidence)}
      onMouseLeave={() => onHoverEvidence([])}
      className={cn(
        "flex flex-col gap-2 px-3 py-3 transition-colors duration-200 sm:px-4",
        state.verdict === "accepted" && "bg-corroborated-soft/40",
        state.verdict === "rejected" && "bg-refuted-soft/35",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
          {field.isadTag}
        </span>
        <span className="text-[0.75rem] text-muted">{tFields(field.key)}</span>
        {state.edited && (
          <span className="rounded-full bg-evidence-soft px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-evidence">
            {t("editedBy")}
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            {tFields(field.key)}
          </label>
          <input
            id={inputId}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
              if (event.key === "Escape") setEditing(false);
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-evidence bg-background px-2.5 text-[0.875rem] text-foreground-strong outline-none"
          />
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-9 rounded-lg px-2.5 text-[0.75rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-9 rounded-lg bg-foreground px-3 text-[0.75rem] font-medium text-background transition-colors hover:bg-foreground-strong"
            >
              {t("apply")}
            </button>
          </span>
        </div>
      ) : abstained ? (
        <AbstainBlock reason={t(`abstainReasons.${field.abstainReasonKey}`)} title={t("abstainTitle")} />
      ) : (
        <p
          className={cn(
            "text-[0.9375rem] leading-snug text-foreground-strong",
            state.verdict === "rejected" && "text-muted line-through decoration-refuted/60",
          )}
        >
          {state.value}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {state.edited ? (
          <DecisionPill decision="emit" label={tDecisions("emit")} />
        ) : (
          <DecisionPill decision={field.decision} label={tDecisions(field.decision)} />
        )}

        {field.confidence !== undefined && !state.edited && (
          <ConfidenceMeter
            value={field.confidence}
            decision={field.decision}
            label={tCommon("confidence")}
          />
        )}

        <button
          type="button"
          onClick={() => setShowProvenance((v) => !v)}
          aria-expanded={showProvenance}
          aria-controls={panelId}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {t("provenanceTitle")}
          <ChevronDown
            aria-hidden
            className={cn("size-3 transition-transform duration-200", showProvenance && "rotate-180")}
            strokeWidth={2}
          />
        </button>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {abstained ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[0.75rem] text-foreground transition-colors hover:bg-surface-2"
            >
              <UserPen aria-hidden className="size-3.5" strokeWidth={1.9} />
              {t("abstainFill")}
            </button>
          ) : (
            <>
              <RowAction
                label={t("edit")}
                icon={<Pencil className="size-3.5" strokeWidth={1.9} />}
                onClick={startEdit}
              />
              <RowAction
                label={t("reject")}
                icon={<X className="size-4" strokeWidth={2.2} />}
                active={state.verdict === "rejected"}
                tone="reject"
                onClick={() =>
                  onChange({
                    ...state,
                    verdict: state.verdict === "rejected" ? "pending" : "rejected",
                  })
                }
              />
              <RowAction
                label={t("accept")}
                icon={<Check className="size-4" strokeWidth={2.4} />}
                active={state.verdict === "accepted"}
                tone="accept"
                onClick={() =>
                  onChange({
                    ...state,
                    verdict: state.verdict === "accepted" ? "pending" : "accepted",
                  })
                }
              />
            </>
          )}
        </span>
      </div>

      {showProvenance && (
        <ProvenancePanel
          id={panelId}
          provenance={field.provenance}
          activeEvidence={activeEvidence}
          onHoverEvidence={onHoverEvidence}
        />
      )}
    </li>
  );
}

/**
 * An abstention is a result, not a gap — §5.3. It is given the same visual
 * weight as an answer and states why, or archivists learn to read it as
 * a failure and stop trusting the confident rows too.
 */
function AbstainBlock({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-dashed border-abstain/40 bg-abstain-soft/50 px-3 py-2.5">
      <MinusCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-abstain" strokeWidth={1.9} />
      <div className="min-w-0">
        <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-abstain">{title}</p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{reason}</p>
      </div>
    </div>
  );
}

function RowAction({
  label,
  icon,
  onClick,
  active,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: "accept" | "reject";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={tone ? active : undefined}
      className={cn(
        "grid size-8 place-items-center rounded-lg border transition-colors duration-150",
        active && tone === "accept" && "border-corroborated bg-corroborated text-background",
        active && tone === "reject" && "border-refuted bg-refuted text-background",
        !active && "border-line text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}
