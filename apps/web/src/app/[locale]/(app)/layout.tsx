import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell/app-shell";
import { SessionProvider } from "@/components/auth/session-provider";
import { requireUser } from "@/lib/auth/dal";

/**
 * Resolves the locale before the shell renders — the layout wraps the page, so
 * without this every route in the group falls back to header-reading and turns
 * dynamic.
 *
 * Then the authoritative session check. The proxy has already turned away
 * anyone without a cookie; this asks the API whether the token behind the
 * cookie is still good, and sends a revoked or forged one back to sign-in.
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
  const user = await requireUser(locale);

  return (
    <SessionProvider user={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
