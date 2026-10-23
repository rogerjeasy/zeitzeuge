import { useTranslations } from "next-intl";
import { Quote } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { GALLERY } from "@/lib/data/archive";
import { UncataloguedStrip } from "./uncatalogued-strip";

const STATS = ["manual", "unknown", "backlog"] as const;
const PRINCIPLES = ["p1", "p2", "p3"] as const;

export function ProblemSection() {
  const t = useTranslations("problem");

  return (
    <Section id="problem">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
        body={t("body")}
      />

      <Reveal className="mt-12 sm:mt-14">
        <UncataloguedStrip photos={GALLERY.slice(0, 5)} />
      </Reveal>

      <dl className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:mt-14 sm:grid-cols-3">
        {STATS.map((stat, i) => (
          <Reveal key={stat} delay={i * 90} className="bg-background p-6 sm:p-7">
            <dt className="font-display text-[clamp(1.5rem,1.1rem+1.4vw,2rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground-strong">
              {t(`stats.${stat}.value`)}
            </dt>
            <dd className="mt-2 max-w-[28ch] text-[0.8125rem] leading-relaxed text-muted">
              {t(`stats.${stat}.label`)}
            </dd>
          </Reveal>
        ))}
      </dl>

      {/* The objection a judge is already forming, answered before they raise it. */}
      <Reveal className="mt-12 sm:mt-14">
        <figure className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-plate sm:p-9 lg:p-11">
          <div
            aria-hidden
            className="texture-halftone pointer-events-none absolute -right-8 -top-8 size-56 text-sepia/25 mask-fade-b"
          />
          <Quote
            aria-hidden
            className="size-6 text-sepia sm:size-7"
            strokeWidth={1.6}
          />
          <blockquote className="relative mt-4 max-w-[42ch] font-display text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground-strong">
            {t("objectionTitle")}
          </blockquote>
          <p className="relative mt-4 max-w-[62ch] text-[0.9375rem] leading-[1.75] text-muted">
            {t("objectionBody")}
          </p>
        </figure>
      </Reveal>

      <div className="mt-14 sm:mt-16">
        <h3 className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted">
          {t("principlesTitle")}
        </h3>
        <ol className="mt-6 grid gap-5 lg:grid-cols-3 lg:gap-6">
          {PRINCIPLES.map((key, i) => (
            <Reveal key={key} delay={i * 100} as="li">
              <article className="group relative flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface/60 p-6 transition-colors duration-300 hover:border-evidence/40 hover:bg-surface">
                <span className="font-mono text-[0.6875rem] font-semibold tracking-[0.1em] text-evidence">
                  {t(`principles.${key}.tag`)}
                </span>
                <h4 className="font-display text-lg font-semibold leading-snug tracking-[-0.015em] text-foreground-strong">
                  {t(`principles.${key}.title`)}
                </h4>
                <p className="text-[0.8125rem] leading-[1.7] text-muted">
                  {t(`principles.${key}.body`)}
                </p>
                <span
                  aria-hidden
                  className="mt-auto h-px w-10 bg-line-strong transition-[width,background-color] duration-500 group-hover:w-20 group-hover:bg-evidence"
                />
              </article>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
