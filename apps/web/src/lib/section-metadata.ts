import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Per-screen titles for the not-yet-built sections. A browser tab that just
 * says the product name for every route makes an app with ten screens
 * unnavigable once a few tabs are open.
 */
export async function sectionMetadata(
  locale: string,
  navKey: string,
): Promise<Metadata> {
  const tNav = await getTranslations({ locale, namespace: "app.nav" });
  return {
    title: `${tNav(navKey)} — ZEITZEUGE`,
    robots: { index: false, follow: false },
  };
}
