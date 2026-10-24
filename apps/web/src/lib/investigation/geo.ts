/**
 * The subject point on a map. The run writes it as the record field
 * `subject_point` (`investigation/ledger.py`): `typed_value.lv95 = [E, N]`,
 * `value` = «E / N». Pure, so it is tested without a browser.
 */

export type Lv95 = { e: number; n: number };

/** Switzerland's LV95 extent, generously: anything outside is not a point we trust. */
const inSwitzerland = ({ e, n }: Lv95) => e > 2_400_000 && e < 2_900_000 && n > 1_000_000 && n < 1_350_000;

export function parseSubjectPoint(field: { typed_value?: unknown; value?: string | null } | undefined): Lv95 | null {
  if (!field) return null;
  const typed = field.typed_value as { lv95?: unknown } | null | undefined;
  let point: Lv95 | null = null;
  if (typed && Array.isArray(typed.lv95) && typed.lv95.length >= 2) {
    const [e, n] = typed.lv95.map(Number);
    if (Number.isFinite(e) && Number.isFinite(n)) point = { e, n };
  }
  if (!point && field.value) {
    const match = /(\d{7}(?:\.\d+)?)\s*[/,;]\s*(\d{7}(?:\.\d+)?)/.exec(field.value);
    if (match) point = { e: Number(match[1]), n: Number(match[2]) };
  }
  return point && inSwitzerland(point) ? { e: Math.round(point.e), n: Math.round(point.n) } : null;
}

const GEO_LANGS = new Set(["de", "fr", "it", "rm", "en"]);

function mapHash(view: "embed" | "map", { e, n }: Lv95, locale: string): string {
  const lang = GEO_LANGS.has(locale) ? locale : "de";
  return `https://map.geo.admin.ch/#/${view}?lang=${lang}&center=${e},${n}&z=9&crosshair=marker&bgLayer=ch.swisstopo.pixelkarte-farbe`;
}

/** The iframe URL from the spec. */
export const swisstopoEmbedUrl = (point: Lv95, locale: string) => mapHash("embed", point, locale);

/** «In map.geo.admin.ch öffnen»: the same view in the full viewer. */
export const swisstopoOpenUrl = (point: Lv95, locale: string) => mapHash("map", point, locale);
