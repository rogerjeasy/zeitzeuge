"use client";

import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { OPEN_CASES, PUBLIC_URL, TIPS, assistTotals } from "@/lib/data/assist";
import { LoopStrip } from "./loop-strip";
import { OpenCaseCard } from "./open-case-card";
import { TipCard } from "./tip-card";

const STAT_IDS = ["published", "views", "tips", "corroborated"] as const;

/**
 * Public assist (§9.2 #10) — the console behind the public page.
 *
 * The residue goes out to the canton; what comes back arrives as a claim with a
 * name on it and leaves as a verdict. Both halves live on one screen because
 * the loop is the product: crowd knowledge is only worth having if it is held
 * to the same standard as the machine's, and that is only credible if the
 * refusals are as visible as the successes.
 */
export function AssistScreen() {
  const t = useTranslations("assist");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;

  const totals = assistTotals();

  return (
    <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("title")}
          </h1>
          <p className="max-w-[80ch] text-[0.875rem] leading-relaxed text-muted">
            {t("subtitle")}
          </p>
        </div>

        <p className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[0.6875rem] text-muted">
          <ExternalLink aria-hidden className="size-3.5 text-muted-2" strokeWidth={1.9} />
          {t("publicPage")}: {PUBLIC_URL}
        </p>
      </header>

      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {STAT_IDS.map((id) => (
          <div key={id} className="flex flex-col gap-1.5 bg-background p-4 sm:p-5">
            <dt className="text-[0.75rem] font-medium text-muted">{t(`stats.${id}`)}</dt>
            <dd className="flex flex-col gap-1">
              <span className="font-display text-[1.625rem] font-semibold leading-none tracking-[-0.025em] text-foreground-strong">
                {new Intl.NumberFormat(intl).format(totals[id])}
              </span>
              <span className="text-[0.6875rem] leading-snug text-muted-2">
                {t(`stats.${id}Hint`)}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <LoopStrip />

      {/*
        The tips come before the gallery on a wide screen: an archivist opens
        this page to see what arrived overnight, not to re-read what they
        published last week. Below xl the order reverses back, because on a
        phone the photographs are what make the page make sense.
      */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-start">
        <section
          aria-labelledby="tips-heading"
          className="order-2 flex flex-col gap-3 xl:order-1"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="tips-heading"
              className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground-strong"
            >
              {t("tipsTitle")}
            </h2>
            <p className="max-w-[70ch] text-[0.8125rem] leading-relaxed text-muted">
              {t("tipsHint")}
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {TIPS.map((tip) => (
              <TipCard key={tip.id} tip={tip} />
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="open-heading"
          className="order-1 flex flex-col gap-3 xl:order-2"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="open-heading"
              className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground-strong"
            >
              {t("openTitle")}
            </h2>
            <p className="max-w-[70ch] text-[0.8125rem] leading-relaxed text-muted">
              {t("openHint")}
            </p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {OPEN_CASES.map((item) => (
              <OpenCaseCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
