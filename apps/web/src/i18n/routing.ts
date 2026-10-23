import { defineRouting } from "next-intl/routing";

/**
 * German is the default and unprefixed-by-choice locale: the primary audience is
 * the Staatsarchiv des Kantons Schwyz. French and English exist because a federal
 * archive tool has to be reachable in more than one national language.
 */
export const routing = defineRouting({
  locales: ["de", "en", "fr"] as const,
  defaultLocale: "de",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const localeLabels: Record<Locale, { short: string; long: string }> = {
  de: { short: "DE", long: "Deutsch" },
  en: { short: "EN", long: "English" },
  fr: { short: "FR", long: "Français" },
};
