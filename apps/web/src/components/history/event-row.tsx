"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  Cpu,
  Download,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { EventKind, HistoryEvent } from "@/lib/data/history";
import { cn } from "@/lib/cn";

/**
 * Kind carries the icon and the accent; the actor carries the shape.
 *
 * §8.2 requires a machine claim and a human claim to be distinguishable
 * forever. On this screen that is not a label you have to read: a machine event
 * wears a square node and its identifier in mono, a human event wears a round
 * node and a person's name. You can tell the two apart across the room, which
 * is the point — the archivist scanning a fortnight is not reading every line.
 */
const KIND: Record<EventKind, { icon: typeof Play; tone: string; dot: string }> = {
  run: { icon: Play, tone: "text-evidence", dot: "bg-evidence" },
  steered: { icon: RefreshCw, tone: "text-evidence", dot: "bg-evidence" },
  edited: { icon: Pencil, tone: "text-sepia", dot: "bg-sepia" },
  rejected: { icon: X, tone: "text-refuted", dot: "bg-refuted" },
  approved: { icon: Check, tone: "text-corroborated", dot: "bg-corroborated" },
  exported: { icon: Download, tone: "text-muted", dot: "bg-muted-2" },
  held: { icon: ShieldAlert, tone: "text-review", dot: "bg-review" },
  uploaded: { icon: Upload, tone: "text-muted", dot: "bg-muted-2" },
  reopened: { icon: RotateCcw, tone: "text-review", dot: "bg-review" },
};

export function EventRow({ event, last }: { event: HistoryEvent; last: boolean }) {
  const t = useTranslations("history");
  const tFields = useTranslations("ledger.fields");
  const tFormats = useTranslations("editor.exportFormats");
  const tAgents = useTranslations("orchestra.agents");
  const tPhotos = useTranslations("archive.photos");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const { icon: Icon, tone, dot } = KIND[event.kind];
  const machine = event.actor === "machine";

  const actorLabel = machine
    ? event.actorName === "guardrail"
      ? tAgents("sensitivity.name")
      : t("actors.pipeline")
    : event.actorName;

  const money = (value: number) =>
    new Intl.NumberFormat(intl, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

  return (
    <li className="relative flex gap-3 sm:gap-4">
      {/* the spine */}
      <div className="relative flex w-7 shrink-0 flex-col items-center sm:w-9">
        <span
          aria-hidden
          className={cn(
            "z-10 mt-1 grid size-7 place-items-center border bg-surface transition-colors",
            // square for a machine, round for a person — the shape is the tell
            machine ? "rounded-md border-line-strong" : "rounded-full border-line-strong",
            tone,
          )}
        >
          <Icon aria-hidden className="size-3.5" strokeWidth={2} />
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-line" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <time className="font-mono text-[0.6875rem] tabular-nums text-muted-2">
            {event.time}
          </time>
          <span
            className={cn(
              "font-mono text-[0.5625rem] font-medium uppercase tracking-[0.1em]",
              tone,
            )}
          >
            {t(`kinds.${event.kind}`)}
          </span>

          {event.signature && (
            <Link
              href={`/records/${event.recordId}`}
              title={t("openRecord")}
              className="min-w-0 break-all font-mono text-[0.75rem] text-foreground-strong underline-offset-4 transition-colors hover:text-evidence hover:underline"
            >
              {event.signature}
            </Link>
          )}

          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <span aria-hidden className={cn("size-1.5", machine ? "rounded-[1px]" : "rounded-full", dot)} />
            <span
              className={cn(
                "text-[0.6875rem]",
                machine ? "font-mono text-muted-2" : "text-muted",
              )}
            >
              {actorLabel}
            </span>
            {machine ? (
              <Cpu aria-hidden className="size-3 text-muted-2" strokeWidth={1.9} />
            ) : null}
          </span>
        </div>

        <Detail
          event={event}
          field={(key) => tFields(key)}
          format={(key) => tFormats(key)}
          money={money}
        />

        {event.src && event.kind === "held" && (
          <figure className="relative mt-1 h-14 w-20 overflow-hidden rounded-md border border-review/40">
            <Image
              src={event.src}
              alt={tPhotos(event.photoKey!)}
              fill
              sizes="80px"
              className="photo-archival object-cover blur-[3px]"
            />
          </figure>
        )}

      </div>
    </li>
  );
}

/** The kind-specific line. Data where data will do; prose only where it won't. */
function Detail({
  event,
  field,
  format,
  money,
}: {
  event: HistoryEvent;
  field: (key: string) => string;
  format: (key: string) => string;
  money: (value: number) => string;
}) {
  const t = useTranslations("history");

  switch (event.kind) {
    case "run":
      return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem] tabular-nums text-muted">
          {t("detail.run", {
            seconds: event.seconds,
            cost: money(event.costUsd),
            agents: event.agents,
          })}
          {event.confidence !== undefined && (
            <span className="text-muted-2">· {event.confidence.toFixed(2)}</span>
          )}
          {event.abstentions > 0 && (
            <span className="rounded-[4px] bg-abstain-soft px-1.5 py-px text-[0.625rem] text-abstain">
              {t("detail.abstentions", { count: event.abstentions })}
            </span>
          )}
        </p>
      );

    case "steered":
      return (
        <div className="flex flex-col gap-1">
          <p className="border-l-2 border-evidence/40 pl-2.5 text-[0.8125rem] italic leading-snug text-foreground">
            “{event.hint}”
          </p>
          <p className="font-mono text-[0.6875rem] tabular-nums text-muted">
            {t("detail.steered", {
              affected: event.affected,
              kept: event.kept,
              seconds: event.seconds,
            })}
          </p>
        </div>
      );

    /* The money shot: what the machine said, and what the human put instead. */
    case "edited":
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
            {event.isadTag}
          </span>
          <span className="text-[0.75rem] text-muted">{field(event.fieldKey)}</span>
          {event.from ? (
            <span className="text-muted line-through decoration-refuted/50">{event.from}</span>
          ) : (
            <span className="rounded-[4px] bg-abstain-soft px-1.5 py-px font-mono text-[0.625rem] uppercase tracking-[0.08em] text-abstain">
              {t("diff.abstained")}
            </span>
          )}
          <ArrowRight aria-hidden className="size-3 shrink-0 text-muted-2" strokeWidth={2} />
          <span className="font-medium text-foreground-strong">{event.to}</span>
          <span className="font-mono text-[0.625rem] tabular-nums text-muted-2">
            {event.overrode !== undefined
              ? t("diff.overrode", { value: event.overrode.toFixed(2) })
              : t("diff.filled")}
          </span>
        </div>
      );

    case "rejected":
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
            {event.isadTag}
          </span>
          <span className="text-[0.75rem] text-muted">{field(event.fieldKey)}</span>
          <span className="text-muted line-through decoration-refuted/60">{event.value}</span>
          <span className="font-mono text-[0.625rem] tabular-nums text-muted-2">
            {t("diff.overrode", { value: event.overrode.toFixed(2) })}
          </span>
        </div>
      );

    case "approved":
      return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
          {t("detail.approved", { version: event.version, fields: event.fields })}
          {event.abstentions > 0 && (
            <span className="rounded-[4px] bg-abstain-soft px-1.5 py-px font-mono text-[0.625rem] text-abstain">
              {t("detail.abstentions", { count: event.abstentions })}
            </span>
          )}
        </p>
      );

    case "exported":
      return (
        <p className="text-[0.8125rem] text-muted">
          {t("detail.exported", { records: event.records, format: format(event.format) })}
        </p>
      );

    case "held":
      return (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-review">
            {t("detail.held")}
          </p>
          <p className="text-[0.8125rem] leading-snug text-muted">
            {t(`holds.${event.reasonKey}`)}
          </p>
        </div>
      );

    case "uploaded":
      return (
        <p className="text-[0.8125rem] text-muted">{t("detail.uploaded", { count: event.count })}</p>
      );

    case "reopened":
      return (
        <p className="text-[0.8125rem] text-muted">
          {t("detail.reopened", { version: event.version })}
        </p>
      );
  }
}
