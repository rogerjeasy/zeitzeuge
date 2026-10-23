import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Resolves the locale before the shell renders — the layout wraps the page, so
 * without this every route in the group falls back to header-reading and turns
 * dynamic.
 */
export default async function AppGroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AppShell>{children}</AppShell>;
}
