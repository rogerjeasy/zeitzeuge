"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check, X, ArrowRight, Clock, MinusCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ConfidenceMeter, EvidenceRef } from "@/components/ui/confidence";
import type { QueueItem } from "@/lib/data/queue";
import { GainBadge } from "./gain-badge";
import { cn } from "@/lib/cn";

export type FieldVerdict = "pending" | "accepted" | "rejected";

/**
 * One entry, decided in place.
 *
 * The dashboard promises ~40 seconds per entry; that budget only survives if
 * the decision happens where the item already is. The editor (§9.2 #6) stays
 * the place you go when an entry needs real work.
 */
export function QueueRow({
  item,
  verdicts,
  onVerdict,
  onAccept,
  swept,
}: {
  item: QueueItem;
  verdicts: Record<string, FieldVerdict>;
  onVerdict: (fieldKey: string, verdict: FieldVerdict) => void;
  onAccept: () => void;
  swept: boolean;
}) {
  const t = useTranslations("queue");
  const tFields = useTranslations("ledger.fields");
  const tDecisions = useTranslations("ledger.decisions");
  const tCommon = useTranslations("common");
  const tPhotos = useTranslations("archive.photos");

  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-4 py-4 transition-colors duration-300 sm:px-5",
        swept && "bg-corroborated-soft/40",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
        <figure className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 sm:h-28 sm:w-28">
          <Image
            src={item.src}
            alt={tPhotos(item.photoKey)}
            fill
            sizes="112px"
            className="photo-archival object-cover"
          />
        </figure>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="font-mono text-[0.8125rem] text-foreground-strong">
                  {item.signature}
                </span>
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-2">
                  {item.collection}
                </span>
              </span>
              <GainBadge
                gain={item.gain}
                reason={item.reason}
                reasonCount={item.reasonCount}
                waitingDays={item.waitingDays}
              />
            </div>

            <span className="flex shrink-0 items-center gap-2 font-mono text-[0.625rem] text-muted-2">
              <Clock aria-hidden className="size-3" strokeWidth={2} />
              {t("estimatedItem", { seconds: item.estimatedSeconds })}
              {swept && (
                <span className="rounded-full bg-corroborated-soft px-2 py-0.5 uppercase tracking-[0.08em] text-corroborated">
                  {t("sweptHighlight")}
                </span>
              )}
            </span>
          </div>

          {/* the proposed record, decided field by field */}
          <ul className="flex flex-col divide-y divide-line/70 rounded-lg border border-line">
            {item.fields.map((field) => {
              const verdict = verdicts[field.key] ?? "pending";
              const abstained = field.decision === "abstain";

              return (
                <li
                  key={field.key}
                  className={cn(
                    // Stacked on a phone: at 390 px a single row crushed the
                    // value to "Brunne…", and the value is the thing being
                    // judged. It gets its own line before anything else gives.
                    "flex flex-col gap-2 px-3 py-2.5 transition-colors duration-200",
                    "sm:flex-row sm:items-center sm:gap-3",
                    verdict === "accepted" && "bg-corroborated-soft/50",
                    verdict === "rejected" && "bg-refuted-soft/40",
                  )}
                >
                  <span className="text-[0.75rem] text-muted sm:w-[7.5rem] sm:shrink-0">
                    {tFields(field.key)}
                  </span>

                  {abstained ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-abstain sm:flex-1">
                      <MinusCircle aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
                      {tDecisions("abstain")}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "min-w-0 text-[0.8125rem] text-foreground sm:flex-1 sm:truncate",
                        verdict === "rejected" && "text-muted line-through decoration-refuted/60",
                      )}
                    >
                      {field.value}
                    </span>
                  )}

                  <span className="flex items-center justify-between gap-3 sm:justify-end">
                    {field.confidence !== undefined && (
                      <ConfidenceMeter
                        value={field.confidence}
                        decision={field.decision}
                        label={tCommon("confidence")}
                      />
                    )}

                    {!abstained && (
                      <span className="flex shrink-0 items-center gap-1">
                        <VerdictButton
                          active={verdict === "accepted"}
                          tone="accept"
                          label={t("acceptField")}
                          onClick={() =>
                            onVerdict(field.key, verdict === "accepted" ? "pending" : "accepted")
                          }
                        />
                        <VerdictButton
                          active={verdict === "rejected"}
                          tone="reject"
                          label={t("rejectField")}
                          onClick={() =>
                            onVerdict(field.key, verdict === "rejected" ? "pending" : "rejected")
                          }
                        />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex flex-wrap items-center gap-1">
              <span className="mr-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                {t("evidenceLabel")}
              </span>
              {item.evidence.map((id) => (
                <EvidenceRef key={id} id={id} />
              ))}
            </span>

            <span className="ml-auto flex items-center gap-2">
              <Link
                href={`/records/${item.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.75rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {t("openItem")}
                <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
              </Link>
              <button
                type="button"
                onClick={onAccept}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[0.8125rem] font-medium text-background transition-colors hover:bg-foreground-strong"
              >
                <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
                {t("acceptItem")}
              </button>
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function VerdictButton({
  active,
  tone,
  label,
  onClick,
}: {
  active: boolean;
  tone: "accept" | "reject";
  label: string;
  onClick: () => void;
}) {
  const Icon = tone === "accept" ? Check : X;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-md border transition-colors duration-150",
        active
          ? tone === "accept"
            ? "border-corroborated bg-corroborated text-background"
            : "border-refuted bg-refuted text-background"
          : "border-line-strong text-muted-2 hover:border-muted-2 hover:text-foreground",
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.6} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
