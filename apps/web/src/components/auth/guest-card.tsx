"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { auth, type AuthErrorCode } from "@/lib/auth/client";
import { AUTH_ERROR_KEY } from "@/lib/auth/errors";
import { cn } from "@/lib/cn";
import { FormAlert } from "./form-alert";
import { useEnterApp } from "./use-enter-app";

/**
 * The guest path, given its own card rather than a link under the form.
 *
 * §9.2 is explicit that a judge must never hit a signup wall, so this is
 * treated as a peer of signing in, not an escape hatch — it is the one control
 * on the page that needs nothing typed into it.
 */
export function GuestCard({ className }: { className?: string }) {
  const t = useTranslations("auth.common");
  const te = useTranslations("auth.errors");
  const { entering, enterApp } = useEnterApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function enter() {
    setError(null);
    setBusy(true);
    // A real Cognito sign-in as the seeded, read-only demo user — the same
    // path as everyone else's, so it can fail like everyone else's.
    const result = await auth.continueAsGuest();
    setBusy(false);
    if (!result.ok) return setError(result.code);
    enterApp();
  }

  const loading = busy || entering;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-surface-2/40 p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-[0.8125rem] font-medium text-foreground">
          {t("guestTitle")}
        </p>
        <p className="text-[0.75rem] leading-snug text-muted">{t("guestBody")}</p>
      </div>

      {error && <FormAlert title={te("title")} message={te(AUTH_ERROR_KEY[error])} />}

      <button
        type="button"
        onClick={enter}
        disabled={loading}
        aria-busy={loading}
        className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface text-[0.8125rem] font-medium text-foreground transition-[border-color,color,background-color] duration-200 hover:border-evidence hover:text-evidence disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
            {t("submitting")}
          </>
        ) : (
          <>
            {t("guestCta")}
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </>
        )}
      </button>
    </div>
  );
}
