"use client";

import { useTranslations } from "next-intl";
import { Eye, FileText, Ruler, Globe2, Archive, User } from "lucide-react";
import { EVIDENCE, type EvidenceItem } from "@/lib/data/record";
import { cn } from "@/lib/cn";

const KIND_ICON = {
  visual: Eye,
  textual: FileText,
  geometric: Ruler,
  external: Globe2,
  archival: Archive,
  human: User,
} as const;

export function EvidencePanel({
  activeEvidence,
  onHoverEvidence,
}: {
  activeEvidence: string | null;
  onHoverEvidence: (id: string | null) => void;
}) {
  const t = useTranslations("ledger");
  const tAgents = useTranslations("orchestra.agents");

  return (
    <ul className="divide-y divide-line">
      {EVIDENCE.map((item: EvidenceItem) => {
        const Icon = KIND_ICON[item.kind];
        const active = activeEvidence === item.id;
        const refuting = Boolean(item.refutes?.length) && !item.supports?.length;

        return (
          <li key={item.id}>
            <button
              type="button"
              onMouseEnter={() => onHoverEvidence(item.id)}
              onMouseLeave={() => onHoverEvidence(null)}
              onFocus={() => onHoverEvidence(item.id)}
              onBlur={() => onHoverEvidence(null)}
              className={cn(
                "flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors duration-300 sm:px-5",
                active ? "bg-evidence-soft" : "hover:bg-surface-2/70",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-[4px]",
                    refuting
                      ? "bg-refuted-soft text-refuted"
                      : "bg-evidence-soft text-evidence",
                  )}
                >
                  <Icon aria-hidden className="size-3" strokeWidth={2} />
                </span>
                <span className="font-mono text-[0.6875rem] tabular-nums text-foreground">
                  {item.id}
                </span>
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted-2">
                  {t(`kinds.${item.kind}`)}
                </span>
                <span className="ml-auto font-mono text-[0.6875rem] tabular-nums text-muted">
                  {item.strength.toFixed(2)}
                </span>
              </div>

              <p className="text-[0.75rem] leading-[1.7] text-muted">
                {t(`evidence.${item.key}`)}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em]">
                <span className="text-muted-2">{tAgents(`${item.agent}.name`)}</span>
                {item.supports?.length ? (
                  <span className="text-corroborated">
                    ↑ {item.supports.join(" ")}
                  </span>
                ) : null}
                {item.refutes?.length ? (
                  <span className="text-refuted">↓ {item.refutes.join(" ")}</span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
