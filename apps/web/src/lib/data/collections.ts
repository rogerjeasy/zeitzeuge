/**
 * The fonds (§9.2 #8).
 *
 * The names, extents, periods and creators below are the Staatsarchiv Schwyz's
 * own published photographic holdings (§1.3) — not invented ones. Saying
 * "Bettschart" and "Goetz" with the right dates on them is what tells the
 * Canton's representative that we read their finding aid.
 *
 * Which is also why the finding aid's stated period and the span the pipeline
 * actually described are two separate fields here. They are two different
 * claims, made by two different parties, and an archive is exactly the place
 * where collapsing them into one number is not acceptable.
 */

export type ExtentUnit = "plates" | "photographs" | "prints" | "cards" | "mixed";

export interface Fonds {
  id: string;
  /** ISAD(G) 3.1.1 — the reference code an archivist quotes. */
  reference: string;
  name: string;
  /** Key under `collections.fonds.<id>` for the scope-and-content note. */
  scopeKey: string;
  creator?: string;
  creatorDates?: string;
  /** ISAD(G) 3.1.3, as the finding aid states it. */
  findingAid: { from: number; to: number; circa?: boolean };
  /** ISAD(G) 3.1.5. */
  extent: number;
  extentUnit: ExtentUnit;
  /** Not yet scanned, so nothing to describe. */
  digitised: boolean;
  cover: string[];
}

export interface FondsStats {
  /** Of `extent`, how many ZEITZEUGE has produced a record for. */
  described: number;
  /** Of `described`, how many an archivist has signed off (§8.3). */
  approved: number;
  /** Records where the place agent abstained — the residue, honestly counted. */
  placeUnknown: number;
  /** Median seconds the pipeline spent per photograph in this fonds. */
  medianSeconds: number;
  /** Records per decade. Keys are the decade's first year. */
  decades: Record<number, number>;
  /** Gemeinde → located records. Canton Schwyz communes, by their real names. */
  places: { name: string; count: number }[];
  series: DetectedSeries[];
}

/** Collection memory (§5.2 #8) clustering a fonds into shoots. */
export interface DetectedSeries {
  id: string;
  /** Key under `collections.series.<key>`. */
  key: string;
  count: number;
  /** Mean cosine similarity inside the cluster. */
  cohesion: number;
  from: number;
  to: number;
  thumbs: string[];
}

/**
 * Plates, grouped by the period they actually come from.
 *
 * A fonds is a claim about a date range, so illustrating a 1930s collection
 * with an 1890s photochrom undercuts the one thing this screen asserts. Each
 * group below sits inside its fonds' stated period; `ATTRIBUTION.json` carries
 * the real provenance of every file.
 */
const P = {
  // 1890–1905 photochrom view prints — the Ansichtskarten fonds
  brunnen: "/archive/brunnen-mythen.jpg",
  goldau: "/archive/goldau-mythen.jpg",
  kloster: "/archive/einsiedeln-kloster.jpg",
  treib: "/archive/treib-mythen.jpg",
  axenstein: "/archive/brunnen-axenstein.jpg",
  quai: "/archive/brunnen-quai.jpg",
  schule: "/archive/einsiedeln-schule.jpg",
  // 1866–1868 Adolphe Braun carbon and albumen prints
  braunTitlis: "/archive/braun-titlis.jpg",
  braunLauterbrunnen: "/archive/braun-lauterbrunnen.jpg",
  // 1881–1882 albumen prints of the Gotthard line through Canton Schwyz
  muotaBruecke: "/archive/muota-bruecke-1881.jpg",
  goldauRigi: "/archive/goldau-rigi-1882.jpg",
  goldauBahn: "/archive/goldau-bahngebiet-1882.jpg",
  // 1934–1947 silver-gelatin negatives
  mythenStoos: "/archive/mythen-stoos-1934.jpg",
  mythenLuft: "/archive/mythen-luft-1934.jpg",
  kollegium: "/archive/schwyz-kollegium-1947.jpg",
};

export const FONDS: Fonds[] = [
  {
    id: "bettschart",
    reference: "StASZ Foto/Bettschart",
    name: "Fotosammlung Bettschart",
    scopeKey: "bettschart",
    creator: "Josef Alois Bettschart",
    creatorDates: "1843–1900",
    findingAid: { from: 1870, to: 1900, circa: true },
    extent: 1200,
    extentUnit: "plates",
    digitised: true,
    cover: [P.muotaBruecke, P.goldauRigi, P.goldauBahn],
  },
  {
    id: "goetz",
    reference: "StASZ Foto/Goetz",
    name: "Fotosammlung Goetz",
    scopeKey: "goetz",
    findingAid: { from: 1935, to: 1952, circa: true },
    extent: 450,
    extentUnit: "photographs",
    digitised: true,
    cover: [P.mythenStoos, P.kollegium, P.mythenLuft],
  },
  {
    id: "braun",
    reference: "StASZ Foto/Braun",
    name: "Fotosammlung Braun",
    scopeKey: "braun",
    creator: "Adolphe Braun",
    creatorDates: "1812–1877",
    findingAid: { from: 1855, to: 1877 },
    extent: 40,
    extentUnit: "prints",
    digitised: true,
    cover: [P.braunTitlis, P.braunLauterbrunnen],
  },
  {
    id: "ansichtskarten",
    reference: "StASZ Ansichtskarten",
    name: "Ansichtskarten",
    scopeKey: "ansichtskarten",
    findingAid: { from: 1890, to: 1970, circa: true },
    extent: 2800,
    extentUnit: "cards",
    digitised: true,
    cover: [P.quai, P.brunnen, P.axenstein],
  },
  {
    id: "leidbilder",
    reference: "StASZ Leidbilder",
    name: "Leidbilder",
    scopeKey: "leidbilder",
    findingAid: { from: 1850, to: 1980, circa: true },
    extent: 0,
    extentUnit: "mixed",
    digitised: false,
    cover: [],
  },
  {
    id: "graphische",
    reference: "StASZ Graphische Sammlung",
    name: "Graphische Sammlung",
    scopeKey: "graphische",
    findingAid: { from: 1700, to: 1950, circa: true },
    extent: 0,
    extentUnit: "mixed",
    digitised: false,
    cover: [],
  },
];

/**
 * Per-fonds figures. `described` sums to 1'284 — the number the dashboard and
 * the archive switcher both show, so the three screens cannot disagree.
 */
export const STATS: Record<string, FondsStats> = {
  bettschart: {
    described: 612, approved: 498, placeUnknown: 87, medianSeconds: 71,
    decades: { 1860: 12, 1870: 96, 1880: 214, 1890: 268, 1900: 22 },
    places: [
      { name: "Schwyz", count: 188 },
      { name: "Einsiedeln", count: 121 },
      { name: "Ingenbohl", count: 74 },
      { name: "Arth", count: 58 },
      { name: "Muotathal", count: 41 },
      { name: "Steinen", count: 25 },
      { name: "Lauerz", count: 18 },
    ],
    series: [
      { id: "s_bt1", key: "klosterFacade", count: 34, cohesion: 0.93, from: 1884, to: 1886, thumbs: [P.goldauBahn, P.goldauRigi] },
      { id: "s_bt2", key: "muotaValley", count: 22, cohesion: 0.88, from: 1891, to: 1891, thumbs: [P.muotaBruecke, P.goldauRigi] },
      { id: "s_bt3", key: "schwyzPortraits", count: 61, cohesion: 0.81, from: 1878, to: 1897, thumbs: [P.goldauRigi, P.muotaBruecke, P.goldauBahn] },
    ],
  },
  goetz: {
    described: 318, approved: 241, placeUnknown: 24, medianSeconds: 58,
    decades: { 1930: 108, 1940: 152, 1950: 58 },
    places: [
      { name: "Ingenbohl", count: 96 },
      { name: "Arth", count: 61 },
      { name: "Morschach", count: 44 },
      { name: "Gersau", count: 33 },
      { name: "Schwyz", count: 31 },
      { name: "Sattel", count: 17 },
    ],
    series: [
      { id: "s_gz1", key: "mythenPanorama", count: 14, cohesion: 0.91, from: 1938, to: 1938, thumbs: [P.mythenStoos, P.mythenLuft] },
      { id: "s_gz2", key: "winterSports", count: 28, cohesion: 0.86, from: 1947, to: 1951, thumbs: [P.kollegium, P.mythenStoos] },
    ],
  },
  braun: {
    described: 40, approved: 37, placeUnknown: 3, medianSeconds: 96,
    decades: { 1850: 6, 1860: 19, 1870: 15 },
    places: [
      { name: "Morschach", count: 16 },
      { name: "Ingenbohl", count: 11 },
      { name: "Gersau", count: 7 },
      { name: "Schwyz", count: 3 },
    ],
    series: [
      { id: "s_br1", key: "alpinePanoramas", count: 12, cohesion: 0.94, from: 1866, to: 1871, thumbs: [P.braunTitlis, P.braunLauterbrunnen] },
    ],
  },
  ansichtskarten: {
    described: 314, approved: 236, placeUnknown: 41, medianSeconds: 44,
    decades: { 1890: 58, 1900: 96, 1910: 71, 1920: 44, 1930: 28, 1940: 11, 1950: 6 },
    places: [
      { name: "Ingenbohl", count: 88 },
      { name: "Einsiedeln", count: 63 },
      { name: "Küssnacht", count: 37 },
      { name: "Arth", count: 32 },
      { name: "Gersau", count: 28 },
      { name: "Lachen", count: 14 },
      { name: "Freienbach", count: 11 },
    ],
    series: [
      { id: "s_ak1", key: "quaiSeries", count: 19, cohesion: 0.89, from: 1902, to: 1912, thumbs: [P.quai, P.brunnen] },
      { id: "s_ak2", key: "publisherWehrli", count: 47, cohesion: 0.84, from: 1904, to: 1928, thumbs: [P.axenstein, P.quai, P.kloster] },
    ],
  },
};

/* ── reading a fonds ────────────────────────────────────────────────────── */

export function getFonds(id: string) {
  const fonds = FONDS.find((f) => f.id === id);
  if (!fonds) return null;
  return { fonds, stats: STATS[id] ?? null };
}

export const DIGITISED = FONDS.filter((f) => f.digitised);

/** The span the pipeline actually described, read off the decade histogram. */
export function describedSpan(stats: FondsStats) {
  const years = Object.keys(stats.decades).map(Number).sort((a, b) => a - b);
  return { from: years[0], to: years[years.length - 1] + 9 };
}

/**
 * Decades of the histogram that fall outside the finding aid's stated period.
 *
 * Compared at decade granularity because that is the resolution the chart
 * draws at: a bucket counts as outside only when no year in it could fall
 * inside the period. Anything finer would flag a bar the reader can see
 * sitting within the bracket.
 */
export function decadesOutside(fonds: Fonds, stats: FondsStats) {
  const start = Math.floor(fonds.findingAid.from / 10) * 10;
  return Object.entries(stats.decades)
    .map(([decade, count]) => ({ decade: Number(decade), count }))
    .filter((d) => d.count > 0 && (d.decade + 9 < start || d.decade > fonds.findingAid.to))
    .map((d) => d.decade);
}

/**
 * Whether the described span leaves the period the finding aid claims.
 *
 * Not an error state: finding aids are written once, coarsely, sometimes a
 * century ago, and a system that dates photographs from evidence will
 * disagree with one sooner or later. Surfacing the disagreement is the
 * product working — hiding it would be the product lying.
 */
export function findingAidDrift(fonds: Fonds, stats: FondsStats) {
  const decades = decadesOutside(fonds, stats);
  if (decades.length === 0) return null;
  return { decades, span: describedSpan(stats) };
}

export const ARCHIVE = {
  name: "Staatsarchiv des Kantons Schwyz",
  /** Their live catalogue (§1.3). */
  catalogue: "archives-quickaccess.ch/stasz",
};

export function archiveTotals() {
  const digitised = DIGITISED.map((f) => ({ fonds: f, stats: STATS[f.id] }));
  return {
    fonds: FONDS.length,
    holdings: DIGITISED.reduce((n, f) => n + f.extent, 0),
    described: digitised.reduce((n, d) => n + d.stats.described, 0),
    approved: digitised.reduce((n, d) => n + d.stats.approved, 0),
    placeUnknown: digitised.reduce((n, d) => n + d.stats.placeUnknown, 0),
  };
}
