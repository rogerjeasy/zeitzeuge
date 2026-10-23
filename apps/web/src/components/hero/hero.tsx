import { useTranslations } from "next-intl";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AGENT_COUNT, FAMILY_COUNT } from "@/lib/data/agents";
import { FalsificationViewer } from "./falsification-viewer";
import { HeroMetrics } from "./hero-metrics";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32 lg:pt-36">
      <HeroBackdrop />

      <div className="relative mx-auto grid w-full max-w-[84rem] grid-cols-1 items-center gap-12 px-5 pb-16 sm:px-8 sm:pb-20 lg:px-12 lg:pb-28 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-16 2xl:gap-20">
        <div className="flex flex-col gap-7">
          <Eyebrow>{t("eyebrow")}</Eyebrow>

          <div className="flex flex-col gap-5">
            <h1 className="font-display text-[clamp(2.35rem,1.3rem+4.1vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-balance-tight text-foreground-strong">
              {t("titleLine1")}
              <br />
              <span className="relative inline-block">
                {t("titleLine2")}
                <svg
                  aria-hidden
                  viewBox="0 0 200 8"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 left-0 h-2 w-full text-evidence"
                >
                  <path
                    d="M1 5.4C34 2.2 78 1.4 119 2.6c26 .8 54 2.4 80 4.1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity="0.55"
                  />
                </svg>
              </span>
            </h1>

            <p className="max-w-[46ch] text-[0.9375rem] leading-[1.75] text-muted sm:text-[1.0625rem]">
              {t("subtitle")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button as={Link} href="/auth/signup" size="lg" className="w-full sm:w-auto">
                <Play className="size-4" strokeWidth={2.2} />
                {t("primaryCta")}
              </Button>
              <Button
                as={Link}
                href="/auth/login"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                {t("secondaryCta")}
                <ArrowRight className="size-4" strokeWidth={2} />
              </Button>
            </div>
            <p className="text-xs leading-snug text-muted-2">{t("ctaNote")}</p>
          </div>

          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-2">
            <span className="text-foreground">{AGENT_COUNT}</span>
            <span>{t("agentsLabel")}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span className="text-foreground">{FAMILY_COUNT}</span>
            <span>{t("familiesLabel")}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span className="italic text-sepia">{t("motto")}</span>
          </p>

          <HeroMetrics />
        </div>

        <div className="relative xl:pl-4">
          <FalsificationViewer />
        </div>
      </div>
    </section>
  );
}

/** Ambient background: a contour-map field and a paper grain, nothing else. */
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-surface-2/70 via-background to-background" />
      <svg
        className="absolute -right-24 -top-32 h-[46rem] w-[64rem] text-evidence/[0.07] dark:text-evidence/[0.09]"
        viewBox="0 0 800 560"
        fill="none"
        aria-hidden
      >
        {Array.from({ length: 13 }, (_, i) => (
          <path
            key={i}
            d={`M-40 ${150 + i * 30} C 120 ${90 + i * 30}, 210 ${215 + i * 26}, 330 ${170 + i * 28} S 540 ${60 + i * 32}, 700 ${140 + i * 29} S 830 ${210 + i * 27}, 900 ${180 + i * 28}`}
            stroke="currentColor"
            strokeWidth="1.15"
          />
        ))}
      </svg>
      <div className="texture-grain absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
