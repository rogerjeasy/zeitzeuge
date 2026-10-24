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
};

/** §8.3 — everything that goes in comes back out in a standard format. */
export const EXPORT_FORMATS = [
  { id: "isad", label: "ISAD(G) CSV" },
  { id: "ead", label: "EAD XML" },
  { id: "dc", label: "Dublin Core" },
  { id: "ricox", label: "RiC-O XML" },
  { id: "iiif", label: "IIIF Manifest" },
  { id: "xmp", label: "XMP (eingebettet)" },
];
