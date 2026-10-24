"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { auth, AUTH_LANDING, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { cn } from "@/lib/cn";

type Mode = "demo" | "guest";

/**
 * The marketing site's ways in, without a form.
 *
 * `demo` opens a private archive with an archivist's rights (upload,
 * investigate, review, export, delete — all confined to that archive by
 * row-level security); `guest` opens the prepared collection read-only. Both
 * are real Cognito sign-ins made by the server, and both land on the
 * dashboard: a judge never meets the sign-in or sign-up pages.
 */
export function DemoEntry({
  mode = "demo",
  variant,
  size,
  className,
  errorClassName,
  onEntered,
  children,
}: {
  mode?: Mode;
  variant?: "primary" | "secondary" | "ghost" | "quiet";
  size?: "sm" | "md" | "lg";
  className?: string;
  errorClassName?: string;
  onEntered?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("auth.common");
  const te = useTranslations("auth.errors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function enter() {
    setError(null);
    setBusy(true);
    const result = await (mode === "demo" ? auth.startDemo() : auth.continueAsGuest());
    if (!result.ok) {
      setBusy(false);
      return setError(result.code);
    }
    onEntered?.();
    // Busy stays on until the dashboard replaces this page.
    router.push(AUTH_LANDING);
  }

  return (
    <span className="contents">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={enter}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? (
          <>
            <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
            {mode === "demo" ? t("demoPreparing") : t("submitting")}
          </>
        ) : (
          children
        )}
      </Button>
      {error && (
        <span role="alert" className={cn("text-xs leading-snug text-refuted", errorClassName)}>
          {te(AUTH_ERROR_KEY[error])}
        </span>
      )}
    </span>
  );
}
