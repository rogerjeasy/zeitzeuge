"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { auth, AUTH_LANDING, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { isPlausibleEmail } from "@/lib/auth/password";
import { PasswordField } from "./password-field";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

type FieldErrors = { email?: string; password?: string };

export function LoginForm() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("auth.common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, startTransition] = useTransition();

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = te("emailRequired");
    else if (!isPlausibleEmail(email)) next.email = te("emailInvalid");
    if (!password) next.password = te("passwordRequired");
    return next;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const result = await auth.signIn({ email, password, remember });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.code);
      return;
    }
    startTransition(() => router.push(AUTH_LANDING));
  }

  const busy = submitting || navigating;

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
        error={errors.email}
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
        error={errors.password}
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
