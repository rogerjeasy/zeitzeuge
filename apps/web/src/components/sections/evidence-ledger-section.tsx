import { useTranslations } from "next-intl";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { CaseFile } from "./case-file/index";

export function EvidenceLedgerSection() {
  const t = useTranslations("ledger");

  return (
    <Section id="evidence" tone="raised">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
        body={t("body")}
      />

      <Reveal className="mt-12 sm:mt-14">
        <CaseFile />
      </Reveal>

      {/* The invariant, as the CI test asserts it. */}
      <Reveal className="mt-10" delay={80}>
        <figure className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-ink-panel text-ink-panel-fg">
          <figcaption className="flex items-center gap-2 border-b border-ink-panel-line px-4 py-2.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-panel-muted sm:px-6">
            <span aria-hidden className="size-1.5 rounded-full bg-corroborated" />
            {t("invariantLabel")}
          </figcaption>
          <pre
            tabIndex={0}
            className="overflow-x-auto px-4 py-5 font-mono text-[0.6875rem] leading-[1.9] text-ink-panel-fg sm:px-6 sm:text-[0.8125rem]">
{`∀ field f ∈ catalogue_record:
    f.decision == "emit"  ⟹  |f.evidence| ≥ 1
                          ∧  ∀ e ∈ f.evidence: e ∈ ledger.evidence`}
          </pre>
        </figure>
        <p className="mt-4 max-w-[64ch] text-[0.8125rem] leading-[1.75] text-muted">
          {t("invariantCaption")}
        </p>
      </Reveal>
    </Section>
  );
}
