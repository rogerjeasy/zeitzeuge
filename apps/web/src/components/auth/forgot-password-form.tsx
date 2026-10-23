"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { auth, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { isPlausibleEmail } from "@/lib/auth/password";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";
import { SentTo } from "./sent-to";
import { AuthHeading } from "./auth-heading";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const tc = useTranslations("auth.common");
  const te = useTranslations("auth.errors");

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!email.trim()) return setError(te("emailRequired"));
    if (!isPlausibleEmail(email)) return setError(te("emailInvalid"));
    setError(undefined);

    setSubmitting(true);
    const result = await auth.requestPasswordReset({ email });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.code);
      return;
    }
    // Success is shown whether or not the address exists — confirming it would
    // turn this form into an account-enumeration oracle.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <span className="grid size-11 place-items-center rounded-xl bg-corroborated-soft text-corroborated">
          <MailCheck aria-hidden className="size-5" strokeWidth={1.9} />
        </span>
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[clamp(1.5rem,1.2rem+1.2vw,2rem)] font-semibold leading-tight tracking-[-0.025em] text-foreground-strong">
            {t("successTitle")}
          </h1>
          <p className="text-[0.875rem] leading-[1.7] text-muted">
            {t("successBody")}
          </p>
        </div>

        <SentTo email={email} />
        <Link
          href="/auth/login"
          className="text-[0.8125rem] text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />

      {formError && (
        <FormAlert title={te("title")} message={te(AUTH_ERROR_KEY[formError])} />
      )}

      <Field
        label={tc("emailLabel")}
        type="email"
        name="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={tc("emailPlaceholder")}
        value={email}
        error={error}
        disabled={submitting}
        onChange={(e) => {
          setEmail(e.target.value);
          if (error) setError(undefined);
        }}
      />

      <SubmitButton label={t("submit")} loading={submitting} />

      <p className="text-center text-[0.8125rem] text-muted">
        <Link
          href="/auth/login"
          className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground"
        >
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
