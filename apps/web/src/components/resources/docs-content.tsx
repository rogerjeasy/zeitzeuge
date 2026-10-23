"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TIERS } from "@/lib/data/agents";
import { DOC_CONCEPTS, DOC_GUIDES, DOC_LIMITS, DOC_STEPS } from "@/lib/data/reference";
import { ResourceLayout, ResourceSection } from "./resource-shell";

const TOC = ["start", "concepts", "pipeline", "guides", "limits"] as const;

export function DocsContent() {
  const t = useTranslations("docs");
  const tTiers = useTranslations("orchestra.tiers");

  return (
    <ResourceLayout toc={TOC.map((id) => ({ id, label: t(`toc.${id}`) }))}>
      <ResourceSection id="start" title={t("start.title")} lede={t("start.lede")}>
        <ol className="grid gap-3 sm:grid-cols-2">
          {DOC_STEPS.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className="group flex h-full flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors duration-200 hover:border-evidence/50 sm:p-5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground-strong">
                    {t(`steps.${step.id}.title`)}
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-2 transition-colors group-hover:text-evidence"
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[0.875rem] leading-relaxed text-muted">
                  {t(`steps.${step.id}.body`)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </ResourceSection>

      <ResourceSection id="concepts" title={t("concepts.title")} lede={t("concepts.lede")}>
        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line md:grid-cols-2">
          {DOC_CONCEPTS.map((id) => (
            <div key={id} className="flex flex-col gap-1.5 bg-background p-4 sm:p-5">
              <dt className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
                {t(`concepts.${id}.title`)}
              </dt>
              <dd className="text-[0.875rem] leading-[1.7] text-muted">
                {t(`concepts.${id}.body`)}
              </dd>
            </div>
          ))}
        </dl>
      </ResourceSection>

      <ResourceSection id="pipeline" title={t("pipeline.title")} lede={t("pipeline.lede")}>
        <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {TIERS.map(({ id }) => (
            <li key={id} className="flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-6 sm:p-5">
              <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-evidence sm:w-[11rem]">
                {tTiers(id)}
              </span>
              <span className="min-w-0 text-[0.875rem] leading-[1.7] text-muted">
                {t(`pipeline.${id}`)}
              </span>
            </li>
          ))}
        </ol>
      </ResourceSection>

      <ResourceSection id="guides" title={t("guides.title")} lede={t("guides.lede")}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {DOC_GUIDES.map((guide) => (
            <li key={guide.id}>
              <Link
                href={guide.href}
                className="group flex h-full flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 transition-colors duration-200 hover:border-evidence/50"
              >
                <span className="flex items-center gap-1.5 text-[0.875rem] font-medium text-foreground-strong">
                  {t(`guides.${guide.id}.title`)}
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-2 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-evidence"
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[0.8125rem] leading-relaxed text-muted">
                  {t(`guides.${guide.id}.body`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ResourceSection>

      {/* The section a procurement review would otherwise have to assemble
          itself. Putting it last is not burying it — it is where a reader who
          has understood the system arrives with exactly this question. */}
      <ResourceSection id="limits" title={t("limits.title")} lede={t("limits.lede")}>
        <ul className="flex flex-col gap-3">
          {DOC_LIMITS.map((id) => (
            <li
              key={id}
              className="flex gap-3 rounded-[var(--radius-card)] border border-review/30 bg-review-soft/40 p-4 sm:p-5"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-review" strokeWidth={2} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="text-[0.9375rem] font-medium text-foreground-strong">
                  {t(`limits.${id}.title`)}
                </h3>
                <p className="text-[0.875rem] leading-[1.7] text-muted">{t(`limits.${id}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </ResourceSection>
    </ResourceLayout>
  );
}
