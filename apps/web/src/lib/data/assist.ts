/**
 * Public assist (§9.2 #10, J3).
 *
 * The residue even the pipeline cannot solve, handed to the people of the
 * canton it came from — and handed back on the same terms as everything else.
 * A tip is not believed because a human sent it: the Curator-Feedback agent
 * turns it into a hypothesis and puts it through the same cross-examination
 * that killed the machine's own hypotheses (§17: "attributed, verified through
 * the same pipeline, never auto-accepted").
 *
 * The refuted and the insufficient tips below are the important ones. A page
 * where every contribution is gratefully accepted is a suggestion box; this is
 * a evidence system that happens to accept contributions.
 */

/** What the cross-examination concluded about a tip. */
export type TipVerdict = "corroborated" | "refuted" | "checking" | "insufficient";

export interface KnownField {
  /** key under `ledger.fields.*` */
  fieldKey: string;
  value: string;
  confidence: number;
}

export interface OpenCase {
  id: string;
  signature: string;
  collection: string;
  /** key under `archive.photos.*` */
  photoKey: string;
  src: string;
  /** What the pipeline did establish — publishing the unknown without this
   *  would be asking the public to start from nothing. */
  known: KnownField[];
  /** Fields it abstained on: the actual ask. */
  missing: string[];
  /** key under `assist.cases.<key>` — the question, in plain language */
  key: string;
  publishedDaysAgo: number;
  views: number;
}

export interface Tip {
  id: string;
  caseId: string;
  /** Attributed by name where the contributor gave one (§17). */
  contributor: string | null;
  /** The Gemeinde they wrote from — local knowledge is the whole point.
   *  Absent when the contributor gave none. */
  place: string | null;
  hoursAgo: number;
  /** key under `assist.tips.<key>` for the claim, hypothesis and finding */
  key: string;
  verdict: TipVerdict;
  /** Agents the tip was re-run through — keys under `orchestra.agents.*`. */
  agents: string[];
  /** Seconds the partial re-execution took (§5.4 M3). */
  seconds: number;
  /** Posterior after cross-examination, where one was reached. */
  posterior?: number;
}

const P = {
  lauterbrunnen: "/archive/braun-lauterbrunnen.jpg",
  bahngebiet: "/archive/goldau-bahngebiet-1882.jpg",
  mythenLuft: "/archive/mythen-luft-1934.jpg",
  schule: "/archive/einsiedeln-schule.jpg",
};

export const OPEN_CASES: OpenCase[] = [
  {
    id: "a1", signature: "StASZ Foto/Bettschart/0774", collection: "Bettschart",
    photoKey: "lauterbrunnen", src: P.lauterbrunnen, key: "farmstead",
    known: [
      { fieldKey: "date", value: "1866–1872", confidence: 0.84 },
      { fieldKey: "process", value: "Kohledruck", confidence: 0.91 },
    ],
    missing: ["place", "subject"],
    publishedDaysAgo: 11, views: 1847,
  },
  {
    id: "a2", signature: "StASZ Foto/Bettschart/0812", collection: "Bettschart",
    photoKey: "bahngebiet", src: P.bahngebiet, key: "cutting",
    known: [
      { fieldKey: "subject", value: "Bahneinschnitt mit Gewölbebrücke", confidence: 0.88 },
      { fieldKey: "date", value: "1880–1884", confidence: 0.79 },
    ],
    missing: ["place"],
    publishedDaysAgo: 6, views: 923,
  },
  {
    id: "a3", signature: "StASZ Foto/Goetz/0288", collection: "Goetz",
    photoKey: "mythenLuft", src: P.mythenLuft, key: "summit",
    known: [
      { fieldKey: "date", value: "1932–1938", confidence: 0.86 },
      { fieldKey: "subject", value: "Gipfelaufnahme aus der Luft", confidence: 0.94 },
    ],
    missing: ["place"],
    publishedDaysAgo: 4, views: 612,
  },
  {
    id: "a4", signature: "StASZ Ansichtskarten/1663", collection: "Ansichtskarten",
    photoKey: "schule", src: P.schule, key: "schoolhouse",
    known: [
      { fieldKey: "place", value: "Einsiedeln SZ", confidence: 0.95 },
      { fieldKey: "subject", value: "Schulhaus mit Kloster", confidence: 0.9 },
    ],
    missing: ["date", "photographer"],
    publishedDaysAgo: 2, views: 388,
  },
];

export const TIPS: Tip[] = [
  {
    // The pitch's close, and the one the whole page exists to make possible.
    id: "t1", caseId: "a1", contributor: "Alois Gwerder", place: "Muotathal",
    hoursAgo: 19, key: "grandfathersBarn", verdict: "corroborated",
    agents: ["heritage", "geo", "falsifier", "redteam", "adjudicator"],
    seconds: 14, posterior: 0.89,
  },
  {
    // A confident local, refuted by geometry. Keeping this visible is the
    // difference between a verification system and a compliment box.
    id: "t2", caseId: "a3", contributor: "R. Schelbert", place: "Illgau",
    hoursAgo: 31, key: "wrongSummit", verdict: "refuted",
    agents: ["skyline", "falsifier", "adjudicator"],
    seconds: 9, posterior: 0.07,
  },
  {
    id: "t3", caseId: "a2", contributor: "Marlis Ulrich", place: "Arth",
    hoursAgo: 2, key: "rigiCutting", verdict: "checking",
    agents: ["heritage", "geo", "falsifier"],
    seconds: 0,
  },
  {
    // Right, possibly — but a claim with no evidence behind it is held, not
    // published. Exactly the rule the machine's own claims live under (§5.3).
    id: "t4", caseId: "a4", contributor: null, place: null,
    hoursAgo: 52, key: "aroundNineteenFive", verdict: "insufficient",
    agents: ["adjudicator"],
    seconds: 4,
  },
];

export const VERDICTS: TipVerdict[] = ["corroborated", "refuted", "checking", "insufficient"];

export function tipsFor(caseId: string) {
  return TIPS.filter((tip) => tip.caseId === caseId);
}

export function assistTotals() {
  return {
    published: OPEN_CASES.length,
    views: OPEN_CASES.reduce((n, c) => n + c.views, 0),
    tips: TIPS.length,
    corroborated: TIPS.filter((t) => t.verdict === "corroborated").length,
  };
}

/** Where the public actually lands. Archivists read this console; residents
 *  read that page. */
export const PUBLIC_URL = "sz.ch/zeitzeuge/mithilfe";
