"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { EVIDENCE } from "@/lib/data/record";
import { EvidencePlate } from "./evidence-plate";
import { RecordPanel } from "./record-panel";
import { EvidencePanel } from "./evidence-panel";
import { HypothesesPanel } from "./hypotheses-panel";
import { cn } from "@/lib/cn";

type Tab = "record" | "evidence" | "hypotheses";
const TABS: { id: Tab; key: string }[] = [
  { id: "record", key: "tabRecord" },
  { id: "evidence", key: "tabEvidence" },
  { id: "hypotheses", key: "tabHypotheses" },
];

/**
 * One worked example, three views of it. Hovering anywhere — a field, an
 * evidence row, a region on the scan — highlights the same item everywhere
 * else, so the link between claim and pixels is never something you have to
 * take on trust.
 */
export function CaseFile() {
  const t = useTranslations("ledger");
  const [tab, setTab] = useState<Tab>("record");
  const [hovered, setHovered] = useState<string | null>(null);

  // Resting state shows every region as a faint dashed hint; only a hovered
  // item lights up. Highlighting everything at once highlights nothing.
  const activeIds = hovered ? [hovered] : [];

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-plate">
      {/* record header */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface-2/60 px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground-strong">
            {t("recordTitle")}
          </h3>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.1em] text-muted-2">
            {t("recordSubtitle")}
          </p>
        </div>
        <p className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-[0.1em]">
          <span className="text-abstain line-through">{t("beforeLabel")}</span>
          <ArrowRight aria-hidden className="size-3 text-muted-2" strokeWidth={2} />
          <span className="text-corroborated">{t("afterLabel")}</span>
        </p>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
        <div className="border-b border-line p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <EvidencePlate
            items={EVIDENCE}
            activeIds={activeIds}
            onHover={setHovered}
          />
        </div>

        <div className="flex min-w-0 flex-col">
          <div
            role="tablist"
            aria-label={t("recordTitle")}
            className="flex gap-1 border-b border-line px-4 pt-3 sm:px-5"
          >
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => {
                    setTab(item.id);
                    setHovered(null);
                  }}
                  className={cn(
                    "-mb-px border-b-2 px-2.5 pb-2.5 pt-1 text-[0.8125rem] font-medium transition-colors duration-200 sm:px-3",
                    active
                      ? "border-evidence text-foreground-strong"
                      : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {t(item.key)}
                </button>
              );
            })}
          </div>

          <div className="min-h-[24rem]">
            {tab === "record" && (
              <RecordPanel
                activeEvidence={hovered}
                onHoverEvidence={setHovered}
              />
            )}
            {tab === "evidence" && (
              <EvidencePanel
                activeEvidence={hovered}
                onHoverEvidence={setHovered}
              />
            )}
            {tab === "hypotheses" && (
              <HypothesesPanel activeEvidence={hovered} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
