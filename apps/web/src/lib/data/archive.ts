/**
 * Public-domain photographs used across the page. All are Photochrom prints
 * (Photoglob Zürich / Detroit Publishing Co., c. 1890–1900) held by the Library
 * of Congress, Prints & Photographs Division — the same class of material the
 * gold set in §11 draws on. Attribution is rendered in the footer; the full
 * machine-readable manifest is at /archive/ATTRIBUTION.json.
 */
export interface ArchivePhoto {
  src: string;
  /**
   * A lighter display derivative. The hero renders this photograph filtered,
   * overlaid and animated — it does not need the master. The case file does:
   * that is where evidence regions are inspected. Keeping them as two files is
   * the archival master/access-copy distinction, and it also keeps the hero's
   * LCP payload down.
   */
  accessSrc?: string;
  /** i18n key under `archive.photos.<key>` for the caption. */
  key: string;
  signature: string;
  width: number;
  height: number;
}

export const HERO_PHOTO: ArchivePhoto = {
  src: "/archive/brunnen-mythen.jpg",
  accessSrc: "/archive/brunnen-mythen-access.jpg",
  key: "brunnenMythen",
  signature: "StASZ Ansichtskarten/0042",
  width: 1700,
  height: 1267,
};

/**
 * The case-file example: a Prio-1 photograph of the Staatsarchiv Schwyz
 * (SG.CIV.17.94, Gersau, EXIF 2011), not one of the public-domain prints above.
 */
export const RECORD_PHOTO: ArchivePhoto = {
  src: "/archive/sg-civ-17-94.jpg",
  key: "gersauSchwert",
  signature: "SG.CIV.17.94",
  width: 1700,
  height: 956,
};

export const GALLERY: ArchivePhoto[] = [
  { src: "/archive/goldau-mythen.jpg", key: "goldau", signature: "StASZ Foto/Bettschart/0117", width: 1700, height: 1277 },
  { src: "/archive/einsiedeln-kloster.jpg", key: "einsiedeln", signature: "StASZ Foto/Bettschart/0308", width: 1700, height: 1271 },
  { src: "/archive/treib-mythen.jpg", key: "treib", signature: "StASZ Foto/Bettschart/0091", width: 1700, height: 1278 },
  { src: "/archive/brunnen-axenstein.jpg", key: "axenstein", signature: "StASZ Ansichtskarten/0455", width: 1700, height: 1273 },
  { src: "/archive/brunnen-quai.jpg", key: "quai", signature: "StASZ Ansichtskarten/1204", width: 1700, height: 1216 },
  { src: "/archive/einsiedeln-schule.jpg", key: "schule", signature: "StASZ Ansichtskarten/0312", width: 1700, height: 1280 },
];

/**
 * Whose photographs these are.
 *
 * Every image on this site is a digitised original from a public collection,
 * standing in for archive material we do not hold. One of these collections is
 * CC BY-SA, which makes naming it a licence obligation rather than a courtesy —
 * and an archival product that got its own image credits wrong would be a poor
 * advertisement for provenance. `public/archive/ATTRIBUTION.json` carries the
 * per-file record; this is what the reader sees.
 */
export interface ImageSource {
  /** Proper nouns — deliberately not translated. */
  collection: string;
  holder: string;
  license: string;
  href: string;
}

export const IMAGE_SOURCES: ImageSource[] = [
  {
    collection: "Photochrom Print Collection",
    holder: "Library of Congress, Prints & Photographs Division",
    license: "Public domain",
    href: "https://www.loc.gov/pictures/collection/pgz/",
  },
  {
    collection: "Adolphe Braun (1812–1877)",
    holder: "National Gallery of Art · Cleveland Museum of Art",
    license: "CC0",
    href: "https://www.nga.gov/",
  },
  {
    collection: "Gotthardbahn albums, Ad. Braun & Cie",
    holder: "SBB Historic",
    license: "CC0",
    href: "https://www.sbbhistoric.ch/",
  },
  {
    collection: "Bildarchiv",
    holder: "ETH-Bibliothek Zürich",
    license: "CC BY-SA 4.0 · public domain",
    href: "https://ba.e-pics.ethz.ch/",
  },
];
