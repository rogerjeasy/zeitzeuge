import { useTranslations } from "next-intl";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { PERSONAS } from "@/lib/data/capabilities";
import { cn } from "@/lib/cn";

const ACCENT: Record<string, { chip: string; text: string }> = {
  evidence: { chip: "bg-evidence-soft", text: "text-evidence" },
  review: { chip: "bg-review-soft", text: "text-review" },
  sepia: { chip: "bg-sepia-soft", text: "text-sepia" },
  corroborated: { chip: "bg-corroborated-soft", text: "text-corroborated" },
};

export function PersonasSection() {
  const t = useTranslations("personas");

  return (
    <Section id="personas" tone="raised">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
      />

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 sm:mt-14 xl:grid-cols-4">
        {PERSONAS.map((persona, i) => {
          const accent = ACCENT[persona.accent];
          return (
            <Reveal key={persona.id} delay={i * 80} as="li">
              <article className="flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-colors duration-300 hover:border-line-strong sm:p-6">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full font-mono text-[0.75rem] font-semibold tracking-[0.04em]",
                      accent.chip,
                      accent.text,
                    )}
                    aria-hidden
                  >
                    {persona.initials}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold leading-tight tracking-[-0.015em] text-foreground-strong">
                      {t(`items.${persona.id}.name`)}
                    </h3>
                    <p className="truncate text-[0.6875rem] leading-snug text-muted-2">
                      {t(`items.${persona.id}.role`)}
                    </p>
                  </div>
                </div>

                <dl className="flex flex-col gap-3 border-t border-line pt-4">
                  <div>
                    <dt className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-muted-2">
                      {t("jobLabel")}
                    </dt>
                    <dd className="mt-1 text-[0.8125rem] leading-snug text-foreground">
                      {t(`items.${persona.id}.job`)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-muted-2">
                      {t("successLabel")}
                    </dt>
                    <dd className="mt-1 text-[0.8125rem] leading-[1.65] text-muted">
                      {t(`items.${persona.id}.success`)}
                    </dd>
                  </div>
                </dl>
              </article>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}
