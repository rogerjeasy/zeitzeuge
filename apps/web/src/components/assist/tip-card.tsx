"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Loader2, MapPin, MinusCircle, Quote, User, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OPEN_CASES, type Tip, type TipVerdict } from "@/lib/data/assist";
import { cn } from "@/lib/cn";

const VERDICT: Record<TipVerdict, { icon: typeof Check; chip: string; rail: string }> = {
  corroborated: {
    icon: Check,
    chip: "bg-corroborated-soft text-corroborated",
    rail: "border-l-corroborated",
  },
  refuted: { icon: X, chip: "bg-refuted-soft text-refuted", rail: "border-l-refuted" },
  checking: { icon: Loader2, chip: "bg-evidence-soft text-evidence", rail: "border-l-evidence" },
  insufficient: {
    icon: MinusCircle,
    chip: "bg-abstain-soft text-abstain",
    rail: "border-l-abstain",
  },
};

/**
 * One tip, and what the cross-examination did with it.
 *
 * The claim is quoted in the contributor's own words and attributed, because
 * that is the deal (§17) — and because the refuted one has to be as legible as
 * the corroborated one. A page that shows only the tips that worked is a
 * testimonial wall, and an archive would be right not to trust it.
 */
export function TipCard({ tip }: { tip: Tip }) {
  const t = useTranslations("assist");
  const tAgents = useTranslations("orchestra.agents");
  const tPhotos = useTranslations("archive.photos");
  const [open, setOpen] = useState(tip.verdict === "corroborated");

  const { icon: Icon, chip, rail } = VERDICT[tip.verdict];
  const item = OPEN_CASES.find((c) => c.id === tip.caseId)!;
  const finding = t(`tips.${tip.key}.finding`);

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-card)] border border-l-2 border-line bg-surface p-4",
        rail,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-muted-2">
            <User aria-hidden className="size-3.5" strokeWidth={1.9} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[0.8125rem] font-medium text-foreground-strong">
              {tip.contributor ?? t("anonymous")}
            </span>
            <span className="flex items-center gap-1 font-mono text-[0.625rem] text-muted-2">
              {tip.place && (
                <>
                  <MapPin aria-hidden className="size-2.5" strokeWidth={2} />
                  {tip.place} ·{" "}
                </>
              )}
              {t("hoursAgo", { count: tip.hoursAgo })}
            </span>
          </span>
        </span>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em]",
            chip,
          )}
        >
          <Icon
            aria-hidden
            className={cn("size-3", tip.verdict === "checking" && "animate-spin")}
            strokeWidth={2.4}
          />
          {t(`verdicts.${tip.verdict}`)}
        </span>
      </div>

      {/* the claim, in their words */}
      <blockquote className="flex gap-2 border-l-2 border-line-strong pl-2.5">
        <Quote aria-hidden className="mt-0.5 size-3 shrink-0 text-muted-2" strokeWidth={2} />
        <p className="min-w-0 text-[0.875rem] italic leading-relaxed text-foreground">
          {t(`tips.${tip.key}.claim`)}
        </p>
      </blockquote>

      <Link
        href="/help-identify"
        className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/40 p-1.5 transition-colors hover:border-evidence/40"
      >
        <span className="relative size-9 shrink-0 overflow-hidden rounded-md border border-line">
          <Image
            src={item.src}
            alt={tPhotos(item.photoKey)}
            fill
            sizes="36px"
            className="photo-archival object-cover"
          />
        </span>
        <span className="min-w-0 truncate font-mono text-[0.6875rem] text-muted">
          {item.signature}
        </span>
      </Link>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex w-fit items-center gap-1 rounded-md py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted transition-colors hover:text-foreground"
      >
        {t("findingLabel")}
        <ChevronDown
          aria-hidden
          className={cn("size-3 transition-transform duration-200", open && "rotate-180")}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 [animation:rise-in_160ms_var(--ease-archival)_both]">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
              {t("hypothesisLabel")}
            </p>
            <p className="text-[0.8125rem] leading-relaxed text-foreground">
              {t(`tips.${tip.key}.hypothesis`)}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
              {t("agentsLabel")}
              {tip.seconds > 0 && (
                <span className="text-muted">· {t("rerunSeconds", { seconds: tip.seconds })}</span>
              )}
            </p>
            <ul className="flex flex-wrap gap-1">
              {tip.agents.map((agent) => (
                <li
                  key={agent}
                  className="rounded-[5px] border border-line bg-surface px-1.5 py-0.5 text-[0.6875rem] text-muted"
                >
                  {tAgents(`${agent}.name`)}
                </li>
              ))}
            </ul>
          </div>

          {finding && (
            <p className="border-t border-line pt-2.5 text-[0.8125rem] leading-relaxed text-muted">
              {finding}
            </p>
          )}

          {tip.posterior !== undefined && (
            <p className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted-2">
              {t("posteriorLabel")}
              <span
                className={cn(
                  "tabular-nums",
                  tip.verdict === "corroborated" ? "text-corroborated" : "text-refuted",
                )}
              >
                {tip.posterior.toFixed(2)}
              </span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
