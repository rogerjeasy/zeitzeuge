"use client";

import { useTranslations } from "next-intl";
import { EvidenceRef } from "@/components/ui/confidence";
import type { FieldProvenance } from "@/lib/data/editor";

/**
 * The provenance block from §8.2, rendered for one field.
 *
 * It is a disclosure rather than a popover on purpose: a popover would clip
 * inside the record column at tablet widths, and this content is the answer to
 * "who said this?" — the question an archivist asks most often. It should be
 * readable in place, printable, and reachable by keyboard without a trap.
 */
export function ProvenancePanel({
  id,
  provenance,
  activeEvidence,
  onHoverEvidence,
}: {
  id: string;
  provenance: FieldProvenance;
  activeEvidence: string[];
  onHoverEvidence: (ids: string[]) => void;
}) {
  const t = useTranslations("editor");
  const tAgents = useTranslations("orchestra.agents");

  return (
    <div
      id={id}
      className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 [animation:rise-in_160ms_var(--ease-archival)_both]"
    >
      <p className="mb-2 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
        {t("provenanceTitle")}
      </p>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[0.75rem]">
        <dt className="text-muted">{t("provenanceAgent")}</dt>
        <dd className="text-foreground">{tAgents(`${provenance.agent}.name`)}</dd>

        <dt className="text-muted">{t("provenanceModel")}</dt>
        <dd className="font-mono text-[0.6875rem] text-foreground">{provenance.model}</dd>

        {provenance.evidence.length > 0 && (
          <>
            <dt className="text-muted">{t("provenanceEvidence")}</dt>
            <dd className="flex flex-wrap gap-1">
              {provenance.evidence.map((ref) => (
                <EvidenceRef
                  key={ref}
                  id={ref}
                  active={activeEvidence.includes(ref)}
                  onMouseEnter={() => onHoverEvidence([ref])}
                  onMouseLeave={() => onHoverEvidence([])}
                  onFocus={() => onHoverEvidence([ref])}
                  onBlur={() => onHoverEvidence([])}
                />
              ))}
            </dd>
          </>
        )}
      </dl>

      <p className="mt-2 border-t border-line pt-2 font-mono text-[0.625rem] text-muted-2">
        {t("provenanceWhen", { minutes: provenance.minutesAgo })}
        {provenance.reviewedBy && (
          <>
            {" · "}
            <span className="text-corroborated">
              {t("provenanceHuman", { name: provenance.reviewedBy })}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
