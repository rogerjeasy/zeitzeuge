import { setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";

/**
 * The layout renders *around* the page, so it resolves the locale before any
 * page's own `setRequestLocale` runs. Without this call next-intl falls back to
 * reading request headers and every route under /auth becomes dynamic.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AuthShell>{children}</AuthShell>;
}
