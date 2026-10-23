"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import { auth, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { validateCode } from "@/lib/auth/validation";
import { FormAlert } from "./form-alert";
import { SentTo } from "./sent-to";
import { SubmitButton } from "./submit-button";
import { useEnterApp } from "./use-enter-app";

/**
 * Confirm the address with the code Cognito mailed, then sign straight in.
 *
 * Shared by sign-up (the account was just created) and sign-in (the account
 * exists but was never confirmed). The password the archivist just typed is
 * held in memory for the one sign-in that follows — never stored — so a
 * confirmed account does not have to type it a second time.
 */
export function VerifyEmailStep({
  email,
  password,
  remember = false,
  reason,
  onBack,
}: {
  email: string;
  password: string;
  remember?: boolean;
  reason: "signup" | "unverified";
  /** Where the step was opened in place of a form, "back" returns to it. */
  onBack?: () => void;
}) {
  const t = useTranslations("auth.verify");
  const te = useTranslations("auth.errors");
  const { entering, enterApp } = useEnterApp();

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [formError, setFormError] = useState<AuthErrorCode | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const key = validateCode(code).code;
    setCodeError(key && te(key));
    if (key) return;

    setSubmitting(true);
    const verified = await auth.verifyEmail({ email, code });
    if (!verified.ok) {
      setSubmitting(false);
      setFormError(verified.code);
      return;
    }

    const signedIn = await auth.signIn({ email, password, remember });
    setSubmitting(false);
    if (!signedIn.ok) {
      // Confirmed, but the automatic sign-in did not go through (throttled,
      // say). The account is fine; only the shortcut failed.
      setVerifiedOnly(true);
      return;
    }
    enterApp();
  }

  async function resend() {
    setFormError(null);
    setResending(true);
    const result = await auth.resendVerification({ email });
    setResending(false);
    if (!result.ok) return setFormError(result.code);
    setResent(true);
  }

  const busy = submitting || entering;
  // On sign-up this step replaces the page's heading; on sign-in it sits
  // under "Welcome back", so it must not be a second h1.
  const Heading = reason === "signup" ? "h1" : "h2";

  const back = onBack ? (
    <button type="button" onClick={onBack} className={BACK_LINK}>
      {t("backToLogin")}
    </button>
  ) : (
    <Link href={LOGIN_PATH} className={BACK_LINK}>
      {t("backToLogin")}
    </Link>
  );

  if (verifiedOnly) {
    return (
      <div className="flex flex-col gap-5" role="status">
        <span className="grid size-11 place-items-center rounded-xl bg-corroborated-soft text-corroborated">
          <MailCheck aria-hidden className="size-5" strokeWidth={1.9} />
        </span>
        <p className="text-[0.875rem] leading-[1.7] text-muted">{te("verifiedSignInFailed")}</p>
        {back}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <span className="grid size-11 place-items-center rounded-xl bg-corroborated-soft text-corroborated">
        <MailCheck aria-hidden className="size-5" strokeWidth={1.9} />
      </span>

      <div className="flex flex-col gap-2.5">
        <Heading className="font-display text-[clamp(1.5rem,1.2rem+1.2vw,2rem)] font-semibold leading-tight tracking-[-0.025em] text-foreground-strong">
          {reason === "signup" ? t("title") : t("titleUnverified")}
        </Heading>
        <p className="text-[0.875rem] leading-[1.7] text-muted">
          {reason === "signup" ? t("body") : t("bodyUnverified")}
        </p>
      </div>

      <SentTo email={email} />

      {formError && (
        <FormAlert title={te("title")} message={te(AUTH_ERROR_KEY[formError])} />
      )}

      <Field
        label={t("codeLabel")}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={12}
        placeholder={t("codePlaceholder")}
        value={code}
        error={codeError}
        disabled={busy}
        inputClassName="font-mono tracking-[0.3em]"
        onChange={(e) => {
          setCode(e.target.value);
          if (codeError) setCodeError(undefined);
        }}
      />

      <SubmitButton label={t("submit")} loading={busy} />

      <p className="text-[0.75rem] leading-snug text-muted-2">{t("hint")}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={busy || resending || resent}
          className="h-10 rounded-lg border border-line-strong bg-surface px-4 text-[0.8125rem] font-medium text-foreground transition-colors duration-200 hover:border-evidence hover:text-evidence disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resent ? t("resent") : t("resend")}
        </button>
        {back}
      </div>
    </form>
  );
}

const BACK_LINK =
  "text-[0.8125rem] text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-foreground";
