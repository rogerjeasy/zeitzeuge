import { useTranslations } from "next-intl";
import { LogoLockup } from "@/components/ui/logo";
import { Eyebrow } from "@/components/ui/eyebrow";
import { CONTEXT, HEADLINE_FACTS } from "@/lib/data/about";

/**
 * The mark at the size it was drawn for, and the sentence it stands for.
 *
 * The lockup is artwork rather than the header's live type: this is the one
 * place in the product where the brand is the subject, so it gets the room to
 * be read as a picture — three photographic plates dissolving into a grid.
 */
export function AboutHero() {
  const t = useTranslations("about");

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="texture-grain absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-[84rem] gap-10 px-5 pb-14 pt-28 sm:px-8 sm:pb-16 sm:pt-32 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16 lg:px-12 lg:pb-20 lg:pt-36">
        <div className="flex justify-center lg:justify-start">
          <LogoLockup className="h-auto w-full max-w-[22rem] sm:max-w-[26rem] lg:max-w-none" />
        </div>

        <div className="flex flex-col gap-5">
          <Eyebrow>{t("eyebrow")}</Eyebrow>

          <h1 className="text-balance-tight font-display text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground-strong">
            {t("title")}
          </h1>

          <p className="max-w-[58ch] text-[1.0625rem] leading-relaxed text-muted">
            {t("lede", { partner: CONTEXT.partner })}
          </p>

          <p className="max-w-[62ch] text-[0.9375rem] leading-[1.75] text-muted">
            {t("body")}
          </p>
        </div>
      </div>

      {/* the four numbers the product is prepared to be measured on */}
      <div className="relative mx-auto w-full max-w-[84rem] px-5 pb-14 sm:px-8 lg:px-12 lg:pb-16">
        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {HEADLINE_FACTS.map((fact) => (
            <div key={fact.id} className="flex flex-col gap-1.5 bg-background p-5">
              <dt className="font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-foreground-strong">
                {fact.value}
              </dt>
              <dd className="flex flex-col gap-0.5">
                <span className="text-[0.8125rem] font-medium text-foreground">
                  {t(`facts.${fact.id}`)}
                </span>
                <span className="text-[0.75rem] leading-snug text-muted-2">
                  {t(`facts.${fact.id}Hint`)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
