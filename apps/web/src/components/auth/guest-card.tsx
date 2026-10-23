"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { auth, AUTH_LANDING } from "@/lib/auth/client";
import { cn } from "@/lib/cn";

/**
 * The guest path, given its own card rather than a link under the form.
 *
 * §9.2 is explicit that a judge must never hit a signup wall, so this is
 * treated as a peer of signing in, not an escape hatch — it is the one control
 * on the page that needs nothing typed into it.
 */
export function GuestCard({ className }: { className?: string }) {
  const t = useTranslations("auth.common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function enter() {
    setBusy(true);
    await auth.continueAsGuest();
    startTransition(() => {
      router.push(AUTH_LANDING);
    });
  }

  const loading = busy || pending;

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
