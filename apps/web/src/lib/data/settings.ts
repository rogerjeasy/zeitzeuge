/** Section order for the settings nav. One definition, like the app nav. */
export interface SettingsSection {
  /** key under `settings.nav.*` */
  id: string;
  href: string;
  icon:
    | "account" | "appearance" | "notifications" | "cataloguing"
    | "export" | "security" | "api" | "archive";
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "account", href: "/settings", icon: "account" },
  { id: "appearance", href: "/settings/appearance", icon: "appearance" },
  { id: "notifications", href: "/settings/notifications", icon: "notifications" },
  { id: "cataloguing", href: "/settings/cataloguing", icon: "cataloguing" },
  { id: "export", href: "/settings/export", icon: "export" },
  { id: "security", href: "/settings/security", icon: "security" },
  { id: "api", href: "/settings/api", icon: "api" },
  { id: "archive", href: "/settings/archive", icon: "archive" },
];

/** Which events can reach the archivist, and by which channel. */
export const NOTIFICATION_EVENTS = [
  { id: "queue", email: true, inApp: true },
  { id: "refuted", email: false, inApp: true },
  { id: "batch", email: true, inApp: true },
  { id: "weekly", email: true, inApp: false },
] as const;

/** §5.4 M1 — the router escalates only on ambiguity. */
export const RUN_MODES = [
  { id: "fast", costUsd: 0.02 },
  { id: "standard", costUsd: 0.17 },
  { id: "deep", costUsd: 0.64 },
] as const;

export const CATALOGUING_DEFAULTS = {
  /** §9.2 #7: the archivist sets bulk-accept with a slider. */
  autoAcceptThreshold: 0.92,
  mode: "standard" as (typeof RUN_MODES)[number]["id"],
  /** P3 — abstention is a feature, and it is switchable off only with warning. */
  allowAbstention: true,
  defaultCollection: "ansichtskarten",
};

export const COLLECTIONS = [
  { id: "goetz", name: "Fotosammlung Goetz" },
  { id: "bettschart", name: "Fotosammlung Bettschart" },
  { id: "braun", name: "Fotosammlung Braun" },
  { id: "ansichtskarten", name: "Ansichtskarten" },
];

/** §8.3 — everything that goes in comes back out in a standard format. */
export const EXPORT_FORMATS = [
  { id: "isad", label: "ISAD(G) CSV" },
  { id: "ead", label: "EAD XML" },
  { id: "dc", label: "Dublin Core" },
  { id: "ricox", label: "RiC-O XML" },
  { id: "iiif", label: "IIIF Manifest" },
  { id: "xmp", label: "XMP (eingebettet)" },
];

export const OAI_ENDPOINT = "https://api.zeitzeuge.ch/oai?verb=Identify";

export interface Session {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export const SESSIONS: Session[] = [
  { id: "s1", device: "Firefox · Windows", location: "Schwyz, CH", lastActive: "now", current: true },
  { id: "s2", device: "Safari · iPhone", location: "Schwyz, CH", lastActive: "2h", current: false },
  { id: "s3", device: "Chrome · macOS", location: "Zürich, CH", lastActive: "3d", current: false },
];

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scope: "read" | "write";
  createdDaysAgo: number;
  lastUsedDaysAgo: number | null;
}

export const API_TOKENS: ApiToken[] = [
  { id: "t1", name: "OAI-PMH Harvester", prefix: "zz_live_7f3a", scope: "read", createdDaysAgo: 41, lastUsedDaysAgo: 0 },
  { id: "t2", name: "Import-Skript Digitalisierung", prefix: "zz_live_c92b", scope: "write", createdDaysAgo: 12, lastUsedDaysAgo: 3 },
];

export interface Member {
  id: string;
  name: string;
  initials: string;
  /** key under `settings.archive.roles.*` */
  role: string;
  email: string;
}

export const MEMBERS: Member[] = [
  { id: "m1", name: "Andrea Betschart", initials: "AB", role: "archivist", email: "a.betschart@sz.ch" },
  { id: "m2", name: "Marco Reichmuth", initials: "MR", role: "operator", email: "m.reichmuth@sz.ch" },
  { id: "m3", name: "Ueli Zehnder", initials: "UZ", role: "admin", email: "u.zehnder@sz.ch" },
  { id: "m4", name: "Dr. Peter Keller", initials: "PK", role: "reader", email: "p.keller@hist-verein.ch" },
];
