import { useTranslations } from "next-intl";

const ITEMS = [
  "schwyz",
  "stasz",
  "swisstopo",
  "isad",
  "iiif",
  "dc",
  "bedrock",
  "oai",
] as const;

/**
 * A wordmark strip, not a logo wall. These are data sources and standards, and
 * setting them as type keeps them honest: we are not implying a partnership
 * badge, we are naming what the system is built on.
 */
export function TrustBar() {
  const t = useTranslations("trust");

  return (
    <section className="relative border-y border-line bg-surface-2/50">
      <div className="mx-auto w-full max-w-[84rem] px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-10">
          <p className="max-w-[26ch] shrink-0 font-mono text-[0.6875rem] uppercase leading-relaxed tracking-[0.12em] text-muted-2">
            {t("heading")}
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:gap-x-8">
            {ITEMS.map((item) => (
              <li
                key={item}
                className="font-display text-[0.8125rem] font-medium tracking-[0.02em] text-muted transition-colors duration-200 hover:text-foreground sm:text-sm"
              >
                {t(`items.${item}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
