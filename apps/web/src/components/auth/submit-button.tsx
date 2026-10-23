"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function SubmitButton({
  label,
  loading,
  className,
}: {
  label: string;
  loading: boolean;
  className?: string;
}) {
  const t = useTranslations("auth.common");

  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[0.9375rem] font-medium text-background",
        "transition-[background-color,transform] duration-200 [transition-timing-function:var(--ease-archival)]",
        "hover:bg-foreground-strong active:translate-y-px",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-evidence/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />}
      {loading ? t("submitting") : label}
    </button>
  );
}
