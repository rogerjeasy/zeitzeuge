"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Cpu, Sparkles } from "lucide-react";
import { AGENTS, FAMILY_STYLES, TIERS, type AgentSpec } from "@/lib/data/agents";
import { cn } from "@/lib/cn";

/**
 * The roster as a tiered graph. Each node carries its model family as a colour,
 * so "six families" is visible before it is read. The Terrain Falsifier is
 * selected by default — it is the claim the whole architecture rests on.
 */
export function AgentGraph() {
  const t = useTranslations("orchestra");
  const [selectedId, setSelectedId] = useState("falsifier");
  const selected = AGENTS.find((a) => a.id === selectedId) ?? AGENTS[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
      <AgentDetail agent={selected} />

      <div className="flex flex-col gap-4 lg:order-first">
        {TIERS.map(({ tier, id }, tierIndex) => {
          const agents = AGENTS.filter((a) => a.tier === tier);
          return (
            <div key={id} className="relative">
              {tierIndex > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-4 left-6 h-4 w-px bg-line-strong"
                />
              )}
              <div className="flex items-center gap-3">
                <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-2">
                  {t(`tiers.${id}`)}
                </p>
                <span aria-hidden className="h-px flex-1 rule-archival" />
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {agents.map((agent) => (
                  <li key={agent.id}>
                    <AgentNode
                      agent={agent}
                      selected={agent.id === selectedId}
                      onSelect={() => setSelectedId(agent.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <Legend />
      </div>
    </div>
  );
}

function AgentNode({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentSpec;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("orchestra.agents");
  const style = FAMILY_STYLES[agent.family];

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all duration-200 [transition-timing-function:var(--ease-archival)]",
        selected
          ? "border-evidence bg-evidence-soft shadow-plate"
          : "border-line bg-surface/60 hover:border-line-strong hover:bg-surface",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full ring-4 transition-transform duration-200",
          style.dot,
          style.ring,
          selected && "scale-125",
        )}
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-[0.5625rem] tabular-nums text-muted-2">
          {String(agent.index).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "truncate text-[0.75rem] font-medium transition-colors duration-200",
            selected ? "text-foreground-strong" : "text-muted group-hover:text-foreground",
          )}
        >
          {t(`${agent.id}.name`)}
        </span>
      </span>
    </button>
  );
}

function AgentDetail({ agent }: { agent: AgentSpec }) {
  const t = useTranslations("orchestra");
  const tAgents = useTranslations("orchestra.agents");
  const style = FAMILY_STYLES[agent.family];
  const deterministic = agent.family === "deterministic";

  return (
    <aside className="sticky top-[4.5rem] z-10 lg:top-24 lg:self-start">
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface/95 p-5 shadow-plate backdrop-blur-sm sm:p-6 lg:bg-surface">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              deterministic
                ? "bg-corroborated-soft text-corroborated"
                : "bg-evidence-soft text-evidence",
            )}
          >
            {deterministic ? (
              <Cpu aria-hidden className="size-4" strokeWidth={1.9} />
            ) : (
              <Sparkles aria-hidden className="size-4" strokeWidth={1.9} />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
              Agent {String(agent.index).padStart(2, "0")}
            </p>
            <h3 className="font-display text-lg font-semibold leading-tight tracking-[-0.015em] text-foreground-strong">
              {tAgents(`${agent.id}.name`)}
            </h3>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
            {t("modelLabel")}
          </p>
          <p className="mt-1 flex items-center gap-2 font-mono text-[0.8125rem] text-foreground">
            <span aria-hidden className={cn("size-1.5 rounded-full", style.dot)} />
            {agent.model}
          </p>
          {deterministic && (
            <p className="mt-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-corroborated">
              {t("deterministicNote")}
            </p>
          )}
        </div>

        <div>
          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
            {t("whyLabel")}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-[1.75] text-muted">
            {tAgents(`${agent.id}.why`)}
          </p>
        </div>
      </div>

      <p className="mt-3 hidden px-1 font-mono text-[0.625rem] text-muted-2 lg:block">
        {t("hint")}
      </p>
    </aside>
  );
}

function Legend() {
  const t = useTranslations("orchestra");
  const families = Array.from(new Set(AGENTS.map((a) => a.family)));

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-muted-2">
        {t("legendTitle")}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {families.map((family) => (
          <li
            key={family}
            className="flex items-center gap-1.5 font-mono text-[0.625rem] text-muted"
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", FAMILY_STYLES[family].dot)}
            />
            {FAMILY_STYLES[family].labelKey
              ? t(`families.${FAMILY_STYLES[family].labelKey}`)
              : FAMILY_STYLES[family].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
