"use client";

import { useTranslations } from "next-intl";
import type { LegalSection } from "@/lib/data/legal";
import { ResourceLayout, ResourceSection } from "./resource-shell";

/**
 * One renderer for every prose page.
 *
 * Privacy, terms, accessibility and the imprint differ only in their words, so
 * they share a component. Four near-identical files would drift apart the first
 * time one of them was edited.
 */
export function LegalContent({
  namespace,
  sections,
}: {
  namespace: string;
  sections: LegalSection[];
}) {
  const t = useTranslations(namespace);

  return (
    <ResourceLayout toc={sections.map((s) => ({ id: s.id, label: t(`toc.${s.id}`) }))}>
      {sections.map((section) => (
        <ResourceSection
          key={section.id}
          id={section.id}
          title={t(`sections.${section.id}.title`)}
        >
          <p className="max-w-[68ch] text-[0.9375rem] leading-[1.8] text-muted">
            {t(`sections.${section.id}.body`)}
          </p>

          {section.points && (
            <ul className="flex max-w-[68ch] flex-col gap-2.5 border-l-2 border-line pl-4">
              {section.points.map((point) => (
                <li key={point} className="text-[0.875rem] leading-[1.7] text-muted">
                  {t(`sections.${section.id}.points.${point}`)}
                </li>
              ))}
            </ul>
          )}
        </ResourceSection>
      ))}
    </ResourceLayout>
  );
}
