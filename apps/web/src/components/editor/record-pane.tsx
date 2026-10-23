"use client";

import { useTranslations } from "next-intl";
import type { EditorField } from "@/lib/data/editor";
import { FieldRow, type FieldState } from "./field-row";
import { cn } from "@/lib/cn";

/**
 * The catalogue entry itself — ISAD(G) fields in the order an archivist reads
 * them, each one decidable without leaving the page.
 */
export function RecordPane({
  fields,
  states,
  onChange,
  activeEvidence,
  onHoverEvidence,
  className,
}: {
  fields: EditorField[];
  states: Record<string, FieldState>;
  onChange: (key: string, next: FieldState) => void;
  activeEvidence: string[];
  onHoverEvidence: (ids: string[]) => void;
  className?: string;
}) {
  const t = useTranslations("editor");

  return (
    <section
      aria-labelledby="record-pane-heading"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface",
        className,
      )}
    >
      <header className="border-b border-line px-4 py-3">
        <h2
          id="record-pane-heading"
          className="font-display text-[1.0625rem] text-foreground-strong"
        >
          {t("recordTitle")}
        </h2>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{t("recordHint")}</p>
      </header>

      <ul className="flex flex-col divide-y divide-line">
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            state={states[field.key]}
            onChange={(next) => onChange(field.key, next)}
            activeEvidence={activeEvidence}
            onHoverEvidence={onHoverEvidence}
          />
        ))}
      </ul>
    </section>
  );
}
