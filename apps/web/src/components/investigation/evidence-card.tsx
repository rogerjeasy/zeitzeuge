"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { EvidenceOut } from "@/lib/api/investigation-types";
import { cn } from "@/lib/cn";

/** Only http(s) links are rendered as links; anything else is shown as text. */
function safeHref(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * One evidence item as the adjudicator saw it: which class of source, what was
 * observed, where it came from, and how strong the rule allows it to be.
 * Model-written text is rendered as text, never as markup.
 */
export function EvidenceCard({ evidence, compact }: { evidence: EvidenceOut; compact?: boolean }) {
  const t = useTranslations("investigation.case");
  const href = safeHref(evidence.source_uri);

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5",
        compact && "bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-[5px] border border-evidence/25 bg-evidence-soft px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums text-evidence">
          {evidence.id}
        </span>
        <span className="text-[0.75rem] font-medium text-foreground-strong">
          {evidence.source_class_label}
        </span>
        <span className="ml-auto font-mono text-[0.625rem] tabular-nums text-muted" title={t("strength")}>
          {t("strengthValue", { value: evidence.strength.toFixed(2) })}
        </span>
      </div>
      <p className="text-[0.8125rem] leading-snug text-foreground [overflow-wrap:anywhere]">
        {evidence.observation}
      </p>
      {(evidence.source || href) && (
        <p className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-muted">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-w-0 items-center gap-1 text-evidence underline decoration-evidence/40 underline-offset-2 hover:decoration-evidence"
            >
              <ExternalLink aria-hidden className="size-3 shrink-0" strokeWidth={2} />
              <span className="truncate">{evidence.source ?? href}</span>
            </a>
          ) : (
            <span className="truncate">{evidence.source}</span>
          )}
        </p>
      )}
      {(evidence.agent || evidence.model) && !compact && (
        <p className="font-mono text-[0.625rem] text-muted-2 [overflow-wrap:anywhere]">
          {[evidence.agent, evidence.model].filter(Boolean).join(" · ")}
        </p>
      )}
    </article>
  );
}
