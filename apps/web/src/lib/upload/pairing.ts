/**
 * Recto/verso pairing by filename.
 *
 * §6.3 treats recto + verso as one asset, not two uploads. Scanning software
 * already encodes which side is which in the filename, so the archive's own
 * convention is the cheapest possible signal — Marco pushes 500 scans a week
 * and cannot pair those by hand.
 *
 * Every rule is reported back to the UI so the pairing can be seen and argued
 * with, rather than happening invisibly.
 */
export interface PairRule {
  id: string;
  recto: string[];
  verso: string[];
  /** Only pair when exactly these two members exist — see NUMERIC below. */
  strictPairOnly?: boolean;
}

export const PAIR_RULES: PairRule[] = [
  { id: "recto_verso", recto: ["r", "recto", "rectoseite"], verso: ["v", "verso", "versoseite"] },
  { id: "front_back", recto: ["front", "vorne", "vs"], verso: ["back", "hinten", "rs"] },
  { id: "a_b", recto: ["a"], verso: ["b"] },
  // A trailing 1/2 is ambiguous: it is just as likely to be image 1 of 5.
  // Only honoured when the base has exactly two members and no _3.
  { id: "numeric", recto: ["1", "01"], verso: ["2", "02"], strictPairOnly: true },
];

const SEPARATORS = ["_", "-", "."];

export interface NameAnalysis {
  /** Filename with the side marker and extension removed. */
  base: string;
  side: "recto" | "verso";
  ruleId: string;
  /** The literal marker found, for display: "_r", "-verso" … */
  marker: string;
}

export function stripExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Detect a side marker at the end of a filename. Returns null when there is none. */
export function analyseName(fileName: string): NameAnalysis | null {
  const stem = stripExtension(fileName);
  const lower = stem.toLowerCase();

  for (const rule of PAIR_RULES) {
    for (const side of ["recto", "verso"] as const) {
      for (const token of rule[side]) {
        for (const sep of SEPARATORS) {
          const suffix = `${sep}${token}`;
          if (lower.endsWith(suffix)) {
            return {
              base: stem.slice(0, stem.length - suffix.length),
              side,
              ruleId: rule.id,
              marker: suffix,
            };
          }
        }
      }
    }
  }
  return null;
}

export interface PairCandidate<T> {
  base: string;
  recto?: T;
  verso?: T;
  ruleId?: string;
  markers?: { recto?: string; verso?: string };
}

/**
 * Group files into recto/verso candidates. Files with no detectable marker —
 * or whose partner never arrived — come back as their own single-sided group,
 * which the UI shows as "no verso yet".
 */
export function pairByName<T>(
  items: T[],
  nameOf: (item: T) => string,
): PairCandidate<T>[] {
  const groups = new Map<string, PairCandidate<T>>();
  const singles: PairCandidate<T>[] = [];

  // A trailing number only means a side when the base has exactly two of them.
  // `s_1 … s_5` is a five-image series, and pairing 1 with 2 there would invent
  // a verso that does not exist.
  const numericBases = new Map<string, Set<string>>();
  for (const item of items) {
    const stem = stripExtension(nameOf(item));
    const match = /^(.*)[._-](\d{1,2})$/.exec(stem);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const seen = numericBases.get(key) ?? new Set<string>();
    seen.add(String(Number(match[2])));
    numericBases.set(key, seen);
  }
  const numericIsSeries = (base: string) => {
    const seen = numericBases.get(base.toLowerCase());
    if (!seen) return false;
    return [...seen].some((n) => n !== "1" && n !== "2");
  };

  for (const item of items) {
    const name = nameOf(item);
    const raw = analyseName(name);
    // Disqualify the numeric rule for a base that is clearly a series.
    const analysis =
      raw && raw.ruleId === "numeric" && numericIsSeries(raw.base) ? null : raw;

    if (!analysis) {
      singles.push({ base: stripExtension(name), recto: item });
      continue;
    }

    const key = `${analysis.ruleId}::${analysis.base.toLowerCase()}`;
    const group = groups.get(key) ?? { base: analysis.base, ruleId: analysis.ruleId, markers: {} };

    // A second file claiming the same side is a different photograph, not a
    // partner — keep it separate rather than silently dropping one.
    if (group[analysis.side]) {
      singles.push({ base: stripExtension(name), recto: item });
      continue;
    }

    group[analysis.side] = item;
    group.markers = { ...group.markers, [analysis.side]: analysis.marker };
    groups.set(key, group);
  }

  const result: PairCandidate<T>[] = [];

  for (const group of groups.values()) {
    const rule = PAIR_RULES.find((r) => r.id === group.ruleId);
    const complete = Boolean(group.recto && group.verso);

    // The numeric rule only counts when both halves are actually present.
    if (rule?.strictPairOnly && !complete) {
      if (group.recto) result.push({ base: group.base, recto: group.recto });
      if (group.verso) result.push({ base: group.base, recto: group.verso });
      continue;
    }

    // A lone verso keeps its side. Putting it in the recto slot would label the
    // back of a photograph as its front; the UI shows the gap instead and
    // validation blocks the run until the recto arrives.
    result.push(group);
  }

  return [...result, ...singles];
}
