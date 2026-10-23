"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarRange, Compass, Images, ScanText } from "lucide-react";
import type { CaseFile } from "@/lib/data/editor";
import { MapTab } from "./map-tab";
import { DatingTab } from "./dating-tab";
import { VersoTab } from "./verso-tab";
import { SimilarTab } from "./similar-tab";
import { cn } from "@/lib/cn";

type TabId = "map" | "time" | "verso" | "similar";

const TABS: { id: TabId; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: "map", icon: Compass },
  { id: "time", icon: CalendarRange },
  { id: "verso", icon: ScanText },
  { id: "similar", icon: Images },
];

/**
 * The four questions a catalogue field cannot answer on its own: where the
 * camera stood, when the print was made, what is written on the back, and what
 * else in the fonds looks like this.
 *
 * Tabs rather than four stacked panels: at every width below a desktop the
 * stacked form pushes the record out of reach, and the record is what the
 * archivist came to decide.
 */
export function ContextPanel({
  record,
  showHorizon,
  onToggleHorizon,
  className,
}: {
  record: CaseFile;
  showHorizon: boolean;
  onToggleHorizon: (next: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("editor");
  const [tab, setTab] = useState<TabId>("map");

  return (
    <section
      aria-labelledby="context-panel-heading"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface",
        className,
      )}
    >
      <h2 id="context-panel-heading" className="sr-only">
        {t("contextTitle")}
      </h2>

      <div
        role="tablist"
        aria-label={t("contextTitle")}
        className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line px-2 pt-2"
      >
        {TABS.map(({ id, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`context-tab-${id}`}
              aria-selected={active}
              aria-controls={`context-panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-[0.8125rem] font-medium transition-colors duration-200",
                active
                  ? "border-evidence text-foreground-strong"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-3.5" strokeWidth={1.9} />
              {t(`tabs.${id}`)}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`context-panel-${tab}`}
        aria-labelledby={`context-tab-${tab}`}
        // The rail is a full-width panel beside a tablet and a narrow column on
        // a large desktop. Its contents lay themselves out against the panel,
        // not against the window, or the same breakpoint has to mean two
        // different things depending on which column the panel landed in.
        className="@container min-w-0"
      >
        {tab === "map" && (
          <MapTab record={record} showHorizon={showHorizon} onToggleHorizon={onToggleHorizon} />
        )}
        {tab === "time" && <DatingTab record={record} />}
        {tab === "verso" && <VersoTab record={record} />}
        {tab === "similar" && <SimilarTab record={record} />}
      </div>
    </section>
  );
}
