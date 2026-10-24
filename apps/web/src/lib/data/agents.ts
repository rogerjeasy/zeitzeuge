/**
 * The agent roster (PROPOSED_SOLUTION.md §5.2).
 *
 * Names, models and tiers are product facts, not copy — they stay here.
 * The human-readable rationale per agent lives in messages/*.json under
 * `orchestra.agents.<id>`, because it has to be translated.
 */
export type Tier = 0 | 1 | 2 | 3 | 4;

export type ModelFamily = "deterministic" | "claude-opus" | "claude-sonnet" | "openai" | "google";

export interface AgentSpec {
  id: string;
  index: number;
  tier: Tier;
  model: string;
  family: ModelFamily;
}

export const TIERS: { tier: Tier; id: string }[] = [
  { tier: 0, id: "intake" },
  { tier: 1, id: "perception" },
  { tier: 2, id: "grounding" },
  { tier: 3, id: "adversarial" },
  { tier: 4, id: "production" },
];

/**
 * The roles the production pipeline runs (investigation/stages, models.py), as
 * of the Prio-1 run on 24.10.2026. Models are the primary bindings; fallbacks
 * are named in each role's rationale. `research` and `research-google` write
 * under the same ledger agent (`research`) — two families, asked independently.
 */
export const AGENTS: AgentSpec[] = [
  { id: "forensics", index: 0, tier: 0, model: "SHA-256 · EXIF · Pillow", family: "deterministic" },
  { id: "scene", index: 1, tier: 1, model: "Claude Opus 4.6", family: "claude-opus" },
  { id: "text-in-image", index: 2, tier: 1, model: "Cloud Vision OCR", family: "google" },
  { id: "skyline", index: 3, tier: 1, model: "Claude Opus 4.6", family: "claude-opus" },
  { id: "geo", index: 4, tier: 2, model: "swisstopo · GWR · OSM", family: "deterministic" },
  { id: "heritage", index: 5, tier: 2, model: "KSI · Wikidata · Places", family: "deterministic" },
  { id: "research", index: 6, tier: 2, model: "GPT-5.5 + web search", family: "openai" },
  { id: "research-google", index: 7, tier: 2, model: "Gemini 4 Argon + Google Search", family: "google" },
  { id: "sighting", index: 8, tier: 2, model: "Cloud Vision Web · Google Lens", family: "google" },
  { id: "memory", index: 9, tier: 2, model: "Claude Sonnet 4.6", family: "claude-sonnet" },
  { id: "streetlevel", index: 10, tier: 2, model: "Street View + Sonnet 4.6", family: "claude-sonnet" },
  { id: "synthesiser", index: 11, tier: 3, model: "Noisy-OR over source classes", family: "deterministic" },
  { id: "redteam", index: 12, tier: 3, model: "GPT-6.1 Sol", family: "openai" },
  { id: "adjudicator", index: 13, tier: 3, model: "Claude Opus 4.6", family: "claude-opus" },
  { id: "cartographer", index: 14, tier: 4, model: "Versioned record · Excel", family: "deterministic" },
];

/**
 * `label` is a proper noun for four of the five families, so it lives here.
 * "deterministic" is the one that is a word rather than a name — it carries a
 * `labelKey` under `orchestra.families.*` instead, and call sites prefer it.
 */
export const FAMILY_STYLES: Record<
  ModelFamily,
  { dot: string; ring: string; label: string; labelKey?: string }
> = {
  "deterministic": { dot: "bg-corroborated", ring: "ring-corroborated/30", label: "Deterministisch", labelKey: "deterministic" },
  "claude-opus": { dot: "bg-evidence", ring: "ring-evidence/30", label: "Claude Opus" },
  "claude-sonnet": { dot: "bg-evidence-bright", ring: "ring-evidence-bright/30", label: "Claude Sonnet" },
  "openai": { dot: "bg-foreground", ring: "ring-foreground/30", label: "OpenAI GPT" },
  "google": { dot: "bg-review", ring: "ring-review/30", label: "Google Gemini · Vision" },
};

export const AGENT_COUNT = AGENTS.length;
export const FAMILY_COUNT = new Set(AGENTS.map((a) => a.family)).size;
