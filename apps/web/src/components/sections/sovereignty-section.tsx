import { useTranslations } from "next-intl";
import { ShieldCheck, Database, History, Download } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";

const ITEMS = [
  { id: "residency", Icon: ShieldCheck },
  { id: "rls", Icon: Database },
  { id: "audit", Icon: History },
  { id: "export", Icon: Download },
] as const;

export function SovereigntySection() {
  const t = useTranslations("sovereignty");

  return (
    <Section id="governance">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
        body={t("body")}
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14 sm:mt-14">
        <ul className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2">
          {ITEMS.map(({ id, Icon }, i) => (
            <Reveal key={id} delay={i * 70} as="li" className="flex flex-col gap-3 bg-background p-5 sm:p-6">
              <span className="grid size-9 place-items-center rounded-lg bg-evidence-soft text-evidence">
                <Icon aria-hidden className="size-4" strokeWidth={1.9} />
              </span>
              <h3 className="font-display text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] text-foreground-strong">
                {t(`items.${id}.title`)}
              </h3>
              <p className="text-[0.8125rem] leading-[1.7] text-muted">
                {t(`items.${id}.body`)}
              </p>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={120}>
          <figure className="relative flex h-full flex-col justify-center overflow-hidden rounded-[var(--radius-card)] bg-ink-panel p-6 text-ink-panel-fg sm:p-9">
            <div
              aria-hidden
              className="texture-halftone pointer-events-none absolute -bottom-10 -right-10 size-64 text-ink-panel-muted/15"
            />
            <blockquote className="relative font-display text-[clamp(1.125rem,0.95rem+0.8vw,1.5rem)] font-semibold leading-[1.35] tracking-[-0.02em]">
              {t("quote")}
            </blockquote>
            <figcaption className="relative mt-5 flex items-center gap-2.5 border-t border-ink-panel-line pt-4 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-panel-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-corroborated" />
              {t("quoteAttribution")}
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </Section>
  );
}
