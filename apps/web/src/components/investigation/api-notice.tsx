"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

const KNOWN = new Set([
  "unauthenticated",
  "token_expired",
  "forbidden",
  "network",
  "not_found",
  "version_conflict",
]);

/** An API problem, in words. Unknown codes are shown as they are, never hidden. */
export function ApiNotice({ code, className }: { code: string; className?: string }) {
  const t = useTranslations("investigation.errors");
  const key = KNOWN.has(code) ? code : null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-review/35 bg-review-soft px-3.5 py-3",
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mt-px size-4 shrink-0 text-review" strokeWidth={2} />
      <p className="min-w-0 text-[0.8125rem] text-review">
        {key ? t(key) : t("generic", { code })}
      </p>
    </div>
  );
}
