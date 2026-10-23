import { useTranslations } from "next-intl";
import { Workflow } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { AgentGraph } from "./agent-graph";

export function AgentOrchestraSection() {
  const t = useTranslations("orchestra");

  return (
    <Section id="architecture">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
        body={t("body")}
      />

      <Reveal className="mt-12 sm:mt-14">
        <AgentGraph />
      </Reveal>

      {/* The governance sentence, given its own weight. */}
      <Reveal className="mt-12 sm:mt-14" delay={80}>
        <figure className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface-2/50 p-6 sm:flex-row sm:items-start sm:gap-6 sm:p-9">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-evidence-soft text-evidence">
            <Workflow aria-hidden className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="max-w-[34ch] font-display text-[clamp(1.125rem,0.95rem+0.7vw,1.5rem)] font-semibold leading-snug tracking-[-0.02em] text-foreground-strong">
              {t("spine.title")}
            </h3>
            <p className="mt-3 max-w-[68ch] text-[0.875rem] leading-[1.75] text-muted">
              {t("spine.body")}
            </p>
          </div>
        </figure>
      </Reveal>
    </Section>
  );
}
