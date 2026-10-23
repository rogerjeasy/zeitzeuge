"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { auth, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { evaluatePassword, isPlausibleEmail } from "@/lib/auth/password";
import { PasswordField } from "./password-field";
import { PasswordRequirements } from "./password-requirements";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";
import { LegalNote } from "./legal-note";
import { AuthHeading } from "./auth-heading";
import { SentTo } from "./sent-to";

type FieldErrors = { email?: string; password?: string };

export function SignupForm() {
  const t = useTranslations("auth.signup");
  const tc = useTranslations("auth.common");
  const te = useTranslations("auth.errors");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const next: FieldErrors = {};
    if (!email.trim()) next.email = te("emailRequired");
    else if (!isPlausibleEmail(email)) next.email = te("emailInvalid");
    if (!password) next.password = te("passwordRequired");
    else if (!evaluatePassword(password).satisfied) next.password = te("passwordWeak");

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    const result = await auth.signUp({ email, password });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.code);
      return;
    }
    setSent(true);
  }

  if (sent) return <VerifyNotice email={email} />;

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
        error={errors.email}
        disabled={submitting}
        onChange={(e) => {
          setEmail(e.target.value);
          if (errors.email) setErrors((s) => ({ ...s, email: undefined }));
        }}
      />

      <div className="flex flex-col gap-3">
        <PasswordField
          label={tc("passwordLabel")}
          name="password"
          autoComplete="new-password"
          placeholder={tc("passwordPlaceholder")}
          value={password}
          error={errors.password}
          disabled={submitting}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((s) => ({ ...s, password: undefined }));
          }}
        />
        <PasswordRequirements value={password} />
      </div>

      <SubmitButton label={t("submit")} loading={submitting} />

      <LegalNote />

      <p className="text-center text-[0.8125rem] text-muted">
        {t("haveAccount")}{" "}
        <Link
          href="/auth/login"
          className="font-medium text-foreground underline decoration-line-strong underline-offset-2 transition-colors hover:text-evidence hover:decoration-evidence"
        >
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}

/** Post-signup state. Kept in place rather than on its own route so the address
 *  just typed is still on screen and `resend` needs no round trip to recover it. */
function VerifyNotice({ email }: { email: string }) {
  const t = useTranslations("auth.signup");
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    await auth.resendVerification({ email });
    setBusy(false);
    setResent(true);
  }

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

      <p className="text-[0.75rem] leading-snug text-muted-2">{t("successHint")}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={busy || resent}
          className="h-10 rounded-lg border border-line-strong bg-surface px-4 text-[0.8125rem] font-medium text-foreground transition-colors duration-200 hover:border-evidence hover:text-evidence disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resent ? t("resent") : t("resend")}
        </button>
        <Link
          href="/auth/login"
          className="text-[0.8125rem] text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground"
        >
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  );
}
