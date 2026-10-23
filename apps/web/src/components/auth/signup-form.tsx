"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { auth, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { hasErrors, validateSignUp, type FieldErrors } from "@/lib/auth/validation";
import { PasswordField } from "./password-field";
import { PasswordRequirements } from "./password-requirements";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";
import { LegalNote } from "./legal-note";
import { AuthHeading } from "./auth-heading";
import { VerifyEmailStep } from "./verify-email-step";

type SignUpField = "email" | "password" | "passwordConfirmation";

/** Server-side refusals that belong to a field rather than to the whole form. */
const FIELD_FOR_ERROR: Partial<Record<AuthErrorCode, [SignUpField, string]>> = {
  weak_password: ["password", "passwordWeak"],
  password_mismatch: ["passwordConfirmation", "passwordMismatch"],
};

export function SignupForm() {
  const t = useTranslations("auth.signup");
  const tc = useTranslations("auth.common");
  const te = useTranslations("auth.errors");
  const locale = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<FieldErrors<SignUpField>>({});
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const values = { email, password, passwordConfirmation: confirmation };
  const confirmed = Boolean(confirmation) && confirmation === password;

  function clearError(field: SignUpField) {
    if (errors[field]) setErrors((s) => ({ ...s, [field]: undefined }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validateSignUp(values);
    setErrors(found);
    if (hasErrors(found)) return;

    setSubmitting(true);
    const result = await auth.signUp({ ...values, locale });
    setSubmitting(false);

    if (result.ok) return setRegistered(true);

    const field = FIELD_FOR_ERROR[result.code];
    if (field) setErrors({ [field[0]]: field[1] });
    else setFormError(result.code);
  }

  if (registered) {
    return <VerifyEmailStep email={email.trim()} password={password} reason="signup" />;
  }

  const fieldError = (field: SignUpField) => (errors[field] ? te(errors[field]) : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <AuthHeading title={t("title")} subtitle={t("subtitle")} />

      {formError && (
        <FormAlert title={te("signupTitle")} message={te(AUTH_ERROR_KEY[formError])} />
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
        disabled={submitting}
        onChange={(e) => {
          setEmail(e.target.value);
          clearError("email");
        }}
      />

      <div className="flex flex-col gap-3">
        <PasswordField
          label={tc("passwordLabel")}
          name="password"
          autoComplete="new-password"
          placeholder={tc("passwordPlaceholder")}
          value={password}
          error={fieldError("password")}
          disabled={submitting}
          onChange={(e) => {
            setPassword(e.target.value);
            clearError("password");
          }}
        />
        <PasswordRequirements value={password} />
      </div>

      <PasswordField
        label={tc("confirmPasswordLabel")}
        name="password-confirmation"
        autoComplete="new-password"
        placeholder={tc("confirmPasswordPlaceholder")}
        value={confirmation}
        error={fieldError("passwordConfirmation")}
        hint={confirmed ? tc("passwordsMatch") : undefined}
        disabled={submitting}
        onChange={(e) => {
          setConfirmation(e.target.value);
          clearError("passwordConfirmation");
        }}
        onBlur={() => {
          // Flag a mismatch as soon as the field is left, not only on submit —
          // but never while the archivist is still typing the second copy.
          const mismatch = validateSignUp(values).passwordConfirmation;
          if (confirmation && mismatch) setErrors((s) => ({ ...s, passwordConfirmation: mismatch }));
        }}
      />

      <SubmitButton label={t("submit")} loading={submitting} />

      <LegalNote />

      <p className="text-center text-[0.8125rem] text-muted">
        {t("haveAccount")}{" "}
        <Link
          href={LOGIN_PATH}
          className="font-medium text-foreground underline decoration-line-strong underline-offset-2 transition-colors hover:text-evidence hover:decoration-evidence"
        >
          {t("loginLink")}
        </Link>
      </p>
    </form>
  );
}
