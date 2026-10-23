/**
 * The legal and status pages.
 *
 * These carry statements about a real project run by real people, so the rule
 * here is stricter than elsewhere in the product: nothing is claimed that the
 * build does not actually do. The accessibility statement lists what was
 * implemented and then says plainly what has not been audited; the imprint
 * says who is responsible and, just as importantly, who is not.
 */

export interface LegalSection {
  /** key under `<namespace>.sections.<id>` */
  id: string;
  /** Sub-keys under `<namespace>.sections.<id>.points.<point>`. */
  points?: string[];
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  { id: "prototype" },
  { id: "processed", points: ["images", "derived", "account", "trail"] },
  { id: "residency" },
  { id: "sensitive" },
  { id: "rights", points: ["access", "rectify", "erase", "export"] },
  { id: "processors" },
];

export const TERMS_SECTIONS: LegalSection[] = [
  { id: "nature" },
  { id: "outputs" },
  { id: "content" },
  { id: "acceptable", points: ["personal", "scraping", "circumvent", "resell"] },
  { id: "availability" },
  { id: "law" },
];

export const ACCESSIBILITY_SECTIONS: LegalSection[] = [
  { id: "target" },
  {
    id: "implemented",
    points: ["semantics", "keyboard", "focus", "contrast", "motion", "colour", "language", "text"],
  },
  { id: "known", points: ["audit", "viewer", "tables", "captions"] },
  { id: "feedback" },
];

export const IMPRINT_SECTIONS: LegalSection[] = [
  { id: "responsible" },
  { id: "nature" },
  { id: "affiliation" },
  { id: "credits" },
];

/* ── status ─────────────────────────────────────────────────────────────── */

export type ComponentState = "built" | "partial" | "designed";

export interface SystemComponent {
  /** key under `status.components.<id>` */
  id: string;
  state: ComponentState;
}

/**
 * Readiness, not uptime.
 *
 * A prototype with no production deployment has no uptime to report, and a
 * status page showing invented availability figures would be exactly the kind
 * of confident fiction this product exists to argue against.
 */
export const COMPONENTS: SystemComponent[] = [
  { id: "frontend", state: "built" },
  { id: "pipeline", state: "partial" },
  { id: "falsifier", state: "partial" },
  { id: "ledger", state: "built" },
  { id: "exports", state: "partial" },
  { id: "harvest", state: "designed" },
  { id: "writeback", state: "designed" },
  { id: "auth", state: "partial" },
];

export const COMPONENT_STATES: ComponentState[] = ["built", "partial", "designed"];
