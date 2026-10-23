/**
 * The agent roster (PROPOSED_SOLUTION.md §5.2).
 *
 * Names, models and tiers are product facts, not copy — they stay here.
 * The human-readable rationale per agent lives in messages/*.json under
 * `orchestra.agents.<id>`, because it has to be translated.
 */
export type Tier = 0 | 1 | 2 | 3 | 4;

export type ModelFamily =
  | "deterministic"
  | "claude-opus"
  | "claude-sonnet"
  | "claude-haiku"
  | "nova"
  | "aws-ml";

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

export const AGENTS: AgentSpec[] = [
  { id: "forensics", index: 0, tier: 0, model: "OpenCV · pHash", family: "deterministic" },
  { id: "scene", index: 1, tier: 1, model: "Claude Sonnet 5", family: "claude-sonnet" },
  { id: "heritage", index: 2, tier: 1, model: "Claude Sonnet 5", family: "claude-sonnet" },
  { id: "materiality", index: 3, tier: 1, model: "SageMaker CNN + Sonnet 5", family: "aws-ml" },
  { id: "verso", index: 4, tier: 1, model: "Sonnet 5 + Textract", family: "claude-sonnet" },
  { id: "text-in-image", index: 5, tier: 1, model: "Textract + Sonnet 5", family: "aws-ml" },
  { id: "skyline", index: 6, tier: 1, model: "SAM2 / U-Net", family: "aws-ml" },
  { id: "geo", index: 7, tier: 2, model: "Sonnet 5 + MCP · Rerank", family: "claude-sonnet" },
  { id: "memory", index: 8, tier: 2, model: "Titan Multimodal + pgvector", family: "aws-ml" },
  { id: "chronology", index: 9, tier: 2, model: "Claude Opus 5", family: "claude-opus" },
  { id: "synthesiser", index: 10, tier: 3, model: "Claude Opus 5", family: "claude-opus" },
  { id: "falsifier", index: 11, tier: 3, model: "swissALTI3D ray-cast", family: "deterministic" },
  { id: "redteam", index: 12, tier: 3, model: "Amazon Nova Pro", family: "nova" },
  { id: "adjudicator", index: 13, tier: 3, model: "Claude Opus 5", family: "claude-opus" },
  { id: "cartographer", index: 14, tier: 4, model: "Claude Haiku 4.5", family: "claude-haiku" },
  { id: "multilingual", index: 15, tier: 4, model: "Haiku 4.5 + Translate", family: "claude-haiku" },
  { id: "sensitivity", index: 16, tier: 4, model: "Guardrails + Haiku 4.5", family: "claude-haiku" },
  { id: "curator", index: 17, tier: 4, model: "Haiku 4.5 + Embeddings", family: "claude-haiku" },
];

/**
 * `label` is a proper noun for five of the six families, so it lives here.
 * "deterministic" is the one that is a word rather than a name — it carries a
 * `labelKey` under `orchestra.families.*` instead, and call sites prefer it.
 */
export const FAMILY_STYLES: Record<
  ModelFamily,
  { dot: string; ring: string; label: string; labelKey?: string }
> = {
  "deterministic": { dot: "bg-corroborated", ring: "ring-corroborated/30", label: "Deterministisch", labelKey: "deterministic" },
  "claude-opus": { dot: "bg-evidence", ring: "ring-evidence/30", label: "Claude Opus 5" },
  "claude-sonnet": { dot: "bg-evidence-bright", ring: "ring-evidence-bright/30", label: "Claude Sonnet 5" },
  "claude-haiku": { dot: "bg-sepia", ring: "ring-sepia/30", label: "Claude Haiku 4.5" },
  "nova": { dot: "bg-refuted", ring: "ring-refuted/30", label: "Amazon Nova Pro" },
  "aws-ml": { dot: "bg-review", ring: "ring-review/30", label: "AWS ML" },
};

export const AGENT_COUNT = AGENTS.length;
export const FAMILY_COUNT = new Set(AGENTS.map((a) => a.family)).size;
