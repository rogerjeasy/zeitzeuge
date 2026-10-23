import { useTranslations } from "next-intl";
import { Section, SectionHeading } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { CALIBRATION_STATS } from "@/lib/data/calibration";
import { ReliabilityChart } from "./calibration/reliability-chart";
import { AblationBars } from "./calibration/ablation-bars";

export function CalibrationSection() {
  const t = useTranslations("calibration");

  return (
    <Section id="calibration">
      <SectionHeading
        eyebrow={<Eyebrow>{t("eyebrow")}</Eyebrow>}
        title={t("title")}
        body={t("body")}
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 sm:mt-14">
        <Reveal>
          <ReliabilityChart />
        </Reveal>

        <div className="flex flex-col gap-8">
          <Reveal delay={80}>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line">
              {CALIBRATION_STATS.map((stat) => (
                <div key={stat} className="bg-surface p-4 sm:p-5">
                  <dt className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-foreground-strong">
                    {t(`stats.${stat}.value`)}
                  </dt>
                  <dd className="mt-2 text-[0.75rem] leading-snug text-muted">
                    {t(`stats.${stat}.label`)}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={140}>
            <h3 className="font-display text-lg font-semibold leading-snug tracking-[-0.015em] text-foreground-strong">
              {t("ablationTitle")}
            </h3>
            <p className="mt-2.5 max-w-[56ch] text-[0.8125rem] leading-[1.75] text-muted">
              {t("ablationBody")}
            </p>
            <div className="mt-5">
              <AblationBars />
            </div>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
