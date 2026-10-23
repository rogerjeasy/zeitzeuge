"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { auth, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { hasErrors, validateSignIn, type FieldErrors } from "@/lib/auth/validation";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";
import { VerifyEmailStep } from "./verify-email-step";
import { useEnterApp } from "./use-enter-app";

type SignInField = "email" | "password";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("auth.common");
  const te = useTranslations("auth.errors");
  const { entering, enterApp } = useEnterApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors<SignInField>>({});
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unverified, setUnverified] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validateSignIn({ email, password });
    setErrors(found);
    if (hasErrors(found)) return;

    setSubmitting(true);
    const result = await auth.signIn({ email, password, remember });
    setSubmitting(false);

    if (result.ok) return enterApp();
    // Right password, unconfirmed address: offer the code step in place,
    // rather than an error the archivist cannot act on from here.
    if (result.code === "email_not_verified") return setUnverified(true);
    setFormError(result.code);
  }

  if (unverified) {
    return (
      <VerifyEmailStep
        email={email.trim()}
        password={password}
        remember={remember}
        reason="unverified"
        onBack={() => setUnverified(false)}
      />
    );
  }

  const busy = submitting || entering;
  const fieldError = (field: SignInField) => (errors[field] ? te(errors[field]) : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
        error={fieldError("email")}
        disabled={busy}
        onChange={(e) => {
          setEmail(e.target.value);
          if (errors.email) setErrors((s) => ({ ...s, email: undefined }));
        }}
      />

      <PasswordField
        label={tc("passwordLabel")}
        name="password"
        autoComplete="current-password"
        placeholder={tc("passwordPlaceholder")}
        value={password}
        error={fieldError("password")}
        disabled={busy}
        onChange={(e) => {
          setPassword(e.target.value);
          if (errors.password) setErrors((s) => ({ ...s, password: undefined }));
        }}
        action={
          <Link
            href="/auth/forgot-password"
            className="text-[0.75rem] text-muted transition-colors duration-200 hover:text-evidence"
          >
            {t("forgot")}
          </Link>
        }
      />

      <Checkbox
        name="remember"
        checked={remember}
        disabled={busy}
        onChange={(e) => setRemember(e.target.checked)}
        label={t("remember")}
      />

      <SubmitButton label={t("submit")} loading={busy} />

      <p className="text-center text-[0.8125rem] text-muted">
        {t("noAccount")}{" "}
        <Link
          href="/auth/signup"
          className="font-medium text-foreground underline decoration-line-strong underline-offset-2 transition-colors hover:text-evidence hover:decoration-evidence"
        >
          {t("signupLink")}
        </Link>
      </p>
    </form>
  );
}
