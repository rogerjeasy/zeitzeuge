/**
 * The About page.
 *
 * Product facts and people stay here; everything that reads as prose lives in
 * `messages/*.json` under `about.*`, because it has to be translated.
 */

export interface Principle {
  /** key under `about.principles.<id>` */
  id: string;
  icon: "evidence" | "terrain" | "calibration" | "provenance";
}

/** The four commitments the rest of the product is an implementation of. */
export const PRINCIPLES: Principle[] = [
  { id: "evidence", icon: "evidence" },
  { id: "falsification", icon: "terrain" },
  { id: "calibration", icon: "calibration" },
  { id: "provenance", icon: "provenance" },
];

export interface Member {
  id: string;
  /** Given name and surname as they should appear. */
  name: string;
  photo: string;
  /** Job title, employer and team — facts, not copy, so they stay here. */
  role: string;
  team: string;
  employer: string;
  links?: { label: string; href: string }[];
}

/**
 * Two working students who built this.
 *
 * Titles and teams are as given and are not translated — a job title is a fact
 * about a person, and rendering it differently per locale would make it look
 * like one of ours to reword.
 */
export const TEAM: Member[] = [
  {
    id: "richard",
    name: "Richard",
    photo: "/team/richard.jpg",
    role: "Solution Architect",
    team: "Solution Integration",
    employer: "Zurich Insurance",
  },
  {
    id: "roger",
    name: "Roger Jeasy Bavibidila",
    photo: "/team/roger.jpg",
    role: "Full-Stack & AI Engineer",
    team: "Workflow Automation and AI",
    employer: "Zurich Insurance",
  },
];

/**
 * Contact for the imprint.
 *
 * ⚠️ Placeholder. Replace with a real mailbox the two of us actually read —
 * an imprint that names a responsible party and then gives an address that
 * bounces is worse than one with no address at all.
 */
export const CONTACT_EMAIL = "team@zeitzeuge.ch";

/** Where this was built and for whom. */
export const CONTEXT = {
  event: "Zentral Hack 2026",
  track: "AI Agentic",
  challenge: "Kanton Schwyz",
  partner: "Staatsarchiv des Kantons Schwyz",
};

/** The numbers the product is prepared to be measured on (§11). */
export const HEADLINE_FACTS = [
  { id: "agents", value: "18" },
  { id: "families", value: "6" },
  { id: "hallucination", value: "0.0 %" },
  { id: "goldSet", value: "150" },
] as const;
