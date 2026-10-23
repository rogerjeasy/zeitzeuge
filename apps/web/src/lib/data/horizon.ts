/**
 * The synthetic horizon for the hero.
 *
 * In the real system this curve is produced by the Terrain Falsifier (agent 11):
 * swissALTI3D tiles are ray-cast from the hypothesised camera position and the
 * maximum elevation angle per azimuth becomes ĥ(θ). Here the curve is traced
 * by running that same sky/terrain segmentation over the photograph the
 * pipeline would receive — "Brunnen mit Mythen",
 * Photoglob Zürich, c. 1890–1900 — so the demo shows the real geometry of the
 * Mythen massif rather than an invented squiggle.
 *
 * These coordinates were not drawn by hand: they are the output of a per-column
 * sky-reference segmentation of the scan, median-filtered and trimmed to the
 * printed picture area. Coordinates are normalised to the full scan (0–1,
 * origin top-left), which is the box the <img> occupies.
 */
export type HorizonPoint = readonly [x: number, y: number];

export const HORIZON_CURVE: readonly HorizonPoint[] = [
  [0.0350, 0.1612],
  [0.0534, 0.1642],
  [0.0717, 0.1662],
  [0.0901, 0.1679],
  [0.1085, 0.1689],
  [0.1269, 0.1613],
  [0.1452, 0.1512],
  [0.1636, 0.1485],
  [0.1820, 0.1409],
  [0.2004, 0.1412],
  [0.2187, 0.1484],
  [0.2371, 0.1549],
  [0.2555, 0.1592],
  [0.2738, 0.1598],
  [0.2922, 0.1588],
  [0.3106, 0.1570],
  [0.3290, 0.1642],
  [0.3473, 0.1691],
  [0.3657, 0.1745],
  [0.3841, 0.1773],
  [0.4025, 0.1762],
  [0.4208, 0.1765],
  [0.4392, 0.1676],
  [0.4576, 0.1542],
  [0.4759, 0.1277],
  [0.4943, 0.1077],
  [0.5127, 0.1028],
  [0.5311, 0.0884],
  [0.5494, 0.0944],
  [0.5678, 0.1096],
  [0.5862, 0.1311],
  [0.6045, 0.1497],
  [0.6229, 0.1454],
  [0.6413, 0.1300],
  [0.6597, 0.1200],
  [0.6780, 0.0963],
  [0.6964, 0.0663],
  [0.7148, 0.0489],
  [0.7332, 0.0640],
  [0.7515, 0.0863],
  [0.7699, 0.1138],
  [0.7883, 0.1541],
  [0.8066, 0.1719],
  [0.8250, 0.1686],
  [0.8434, 0.1662],
  [0.8618, 0.1651],
  [0.8801, 0.1634],
  [0.8985, 0.1621],
  [0.9169, 0.1560],
  [0.9353, 0.1473],
  [0.9536, 0.1321],
  [0.9720, 0.1192],
];

/**
 * Summits the Falsifier labels once the correlation passes threshold. Only the
 * two that resolve to a distinct silhouette from this bearing are labelled —
 * the Haggenspitz lies on the Grosser Mythen's flank from here and produces no
 * local maximum, so naming it would be exactly the unevidenced claim this
 * product exists to prevent. Elevations are the official swisstopo values.
 */
export const SUMMITS = [
  { id: "kleiner-mythen", name: "Kleiner Mythen", elevation: 1811, x: 0.5311, y: 0.0884, bearing: 71.4 },
  { id: "grosser-mythen", name: "Grosser Mythen", elevation: 1898, x: 0.7148, y: 0.0489, bearing: 79.8 },
] as const;

/** The resolved camera pose, as the Falsifier would emit it. */
export const CAMERA_POSE = {
  lv95: { easting: 2687540, northing: 1206310 },
  wgs84: { lat: 46.9982, lon: 8.6021 },
  groundElevation: 612,
  eyeHeight: 1.6,
  bearing: 74.6,
  tilt: -2.1,
  hfov: 38.6,
  accuracyMetres: 180,
  correlation: 0.941,
  columns: 1280,
} as const;
