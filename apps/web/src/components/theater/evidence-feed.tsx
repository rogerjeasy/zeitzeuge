"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, FileText, Gavel, MinusCircle } from "lucide-react";
import { EvidenceRef } from "@/components/ui/confidence";
import { eventsAt, type EventKind } from "@/lib/data/theater";
import { cn } from "@/lib/cn";

const KIND: Record<EventKind, { icon: typeof Check; tone: string; rail: string }> = {
  note: { icon: FileText, tone: "text-muted-2", rail: "border-l-line-strong" },
  evidence: { icon: Check, tone: "text-evidence", rail: "border-l-evidence" },
  objection: { icon: AlertTriangle, tone: "text-refuted", rail: "border-l-refuted" },
  abstain: { icon: MinusCircle, tone: "text-abstain", rail: "border-l-abstain" },
  verdict: { icon: Gavel, tone: "text-corroborated", rail: "border-l-corroborated" },
};

/**
 * The ledger, filling as the run goes.
 *
 * Newest first, because the question a viewer has is always "what just
 * happened". A note that produced no evidence row is still shown and still
 * says so — an agent that looked and found nothing is doing its job, and
 * hiding those would make the pipeline look luckier than it is.
 */
export function EvidenceFeed({ t }: { t: number }) {
  const tr = useTranslations("theater");
  const tAgents = useTranslations("orchestra.agents");

  const events = eventsAt(t);

  return (
    <section
      aria-labelledby="feed-heading"
      className="flex min-h-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="feed-heading"
          className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong"
        >
          {tr("feedTitle")}
        </h2>
        <p className="text-[0.75rem] leading-relaxed text-muted">{tr("feedHint")}</p>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface-2/40 px-3 py-8 text-center text-[0.8125rem] text-muted-2">
          {tr("waiting")}
        </p>
      ) : (
        <ol
          aria-live="polite"
          className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto pr-1 xl:max-h-[46rem]"
        >
          {events.map((event) => {
            const { icon: Icon, tone, rail } = KIND[event.kind];
            return (
              <li
                key={event.id}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border border-l-2 border-line bg-surface-2/40 px-3 py-2.5",
                  rail,
                  "[animation:rise-in_200ms_var(--ease-archival)_both]",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[0.625rem] tabular-nums text-muted-2">
                    {String(event.t).padStart(2, "0")}s
                  </span>
                  <Icon aria-hidden className={cn("size-3 shrink-0", tone)} strokeWidth={2.2} />
                  <span className={cn("font-mono text-[0.5625rem] uppercase tracking-[0.1em]", tone)}>
                    {tr(`kinds.${event.kind}`)}
                  </span>
                  <span className="min-w-0 text-[0.75rem] text-foreground-strong">
                    {tAgents(`${event.agent}.name`)}
                  </span>
                  {event.evidenceId && (
                    <span className="ml-auto shrink-0">
                      <EvidenceRef id={event.evidenceId} />
                    </span>
                  )}
                </div>

                <p className="text-[0.8125rem] leading-relaxed text-muted">
                  {tr(`events.${event.key}`)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
