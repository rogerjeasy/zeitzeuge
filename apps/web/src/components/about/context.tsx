import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CONTEXT } from "@/lib/data/about";
import { DemoEntry } from "@/components/auth/demo-entry";

const FACTS = [
  { key: "contextEvent", value: CONTEXT.event },
  { key: "contextTrack", value: CONTEXT.track },
  { key: "contextChallenge", value: CONTEXT.challenge },
  { key: "contextPartner", value: CONTEXT.partner },
] as const;

/** Where it was built, for whom, and the way out of the page. */
export function AboutContext() {
  const t = useTranslations("about");

  return (
    <section>
      <div className="mx-auto grid w-full max-w-[84rem] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 lg:px-12">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-[clamp(1.5rem,1.2rem+1.4vw,2.25rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("contextTitle")}
          </h2>
          <p className="max-w-[62ch] text-[0.9375rem] leading-[1.75] text-muted">
            {t("contextBody", {
              challenge: CONTEXT.challenge,
              track: CONTEXT.track,
              event: CONTEXT.event,
              partner: CONTEXT.partner,
            })}
          </p>

          <dl className="mt-2 flex flex-col divide-y divide-line border-y border-line">
            {FACTS.map((fact) => (
              <div
                key={fact.key}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
                  {t(fact.key)}
                </dt>
                <dd className="text-[0.8125rem] text-foreground-strong">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col justify-center gap-4 rounded-[var(--radius-card)] border border-line bg-ink-panel p-6 sm:p-8">
          <h3 className="font-display text-[clamp(1.25rem,1.1rem+0.8vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] text-ink-panel-fg">
            {t("ctaTitle")}
          </h3>
          <p className="max-w-[46ch] text-[0.875rem] leading-relaxed text-ink-panel-body">
            {t("ctaBody")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <DemoEntry>
              {t("ctaPrimary")}
              <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
            </DemoEntry>
            <Link
              href="/runs/run_01JBQ7"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-panel-line px-4 text-sm font-medium text-ink-panel-body transition-colors hover:border-evidence hover:text-ink-panel-fg"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
