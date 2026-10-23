import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { AuthHeading } from "@/components/auth/auth-heading";
import { LoginForm } from "@/components/auth/login-form";
import { GuestCard } from "@/components/auth/guest-card";
import { SsoButton } from "@/components/auth/sso-button";
import { OrDivider } from "@/components/auth/or-divider";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    // A sign-in screen has nothing to offer an index.
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LoginScreen />;
}

function LoginScreen() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("auth.common");

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />
      <SsoButton />
      <OrDivider label={tc("or")} />
      <LoginForm />
      <GuestCard />
    </div>
  );
}
