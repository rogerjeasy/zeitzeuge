/**
 * The application's navigation. One definition drives the sidebar, the mobile
 * drawer and the command palette, so a new screen is added in exactly one place.
 *
 * Routes marked `ready: false` exist but hold a labelled placeholder — better
 * than a dead link in a shell whose whole job is to look complete.
 */
export type NavIcon =
  | "overview"
  | "upload"
  | "batches"
  | "queue"
  | "history"
  | "collections"
  | "evaluation"
  | "costs"
  | "assist"
  | "settings"
  | "admin";

export interface NavItem {
  /** key under `app.nav.*` */
  id: string;
  href: string;
  icon: NavIcon;
  ready?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { id: "overview", href: "/dashboard", icon: "overview", ready: true },
  { id: "upload", href: "/upload", icon: "upload", ready: true },
  // The real investigation: batches, per-photo progress, the Excel export.
  { id: "batches", href: "/batches", icon: "batches", ready: true },
  { id: "queue", href: "/queue", icon: "queue", ready: true },
  { id: "history", href: "/history", icon: "history", ready: true },
  { id: "collections", href: "/collections", icon: "collections", ready: true },
  { id: "evaluation", href: "/evaluation", icon: "evaluation", ready: true },
  { id: "costs", href: "/costs", icon: "costs", ready: true },
  { id: "assist", href: "/help-identify", icon: "assist", ready: true },
];

export const SECONDARY_NAV: NavItem[] = [
  { id: "settings", href: "/settings", icon: "settings" },
  { id: "admin", href: "/admin", icon: "admin", ready: true },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];
