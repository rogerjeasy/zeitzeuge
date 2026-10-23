import { CONTACT_EMAIL } from "./about";

/**
 * Contact details and social accounts.
 *
 * ⚠️ PLACEHOLDERS — every value in CHANNELS and SOCIALS below needs replacing
 * before this goes anywhere public. A contact page that prints a phone number
 * nobody answers, or links a handle that belongs to a stranger, is worse than
 * one that omits them: the first wastes a reader's time and the second points
 * at someone else's account. Replace or delete; do not ship as-is.
 */

export interface Channel {
  /** key under `contact.channels.<id>` */
  id: string;
  value: string;
  href: string;
  icon: "mail" | "phone" | "location";
}

export const CHANNELS: Channel[] = [
  { id: "email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, icon: "mail" },
  { id: "phone", value: "+41 00 000 00 00", href: "tel:+410000000000", icon: "phone" },
  { id: "location", value: "Zürich, Schweiz", href: "", icon: "location" },
];

export interface Social {
  /** Key into BRANDS. */
  brand: string;
  handle: string;
  href: string;
}

export const SOCIALS: Social[] = [
  { brand: "x", handle: "@zeitzeuge", href: "https://x.com/zeitzeuge" },
  { brand: "instagram", handle: "@zeitzeuge", href: "https://instagram.com/zeitzeuge" },
  { brand: "facebook", handle: "ZEITZEUGE", href: "https://facebook.com/zeitzeuge" },
  { brand: "tiktok", handle: "@zeitzeuge", href: "https://tiktok.com/@zeitzeuge" },
  { brand: "youtube", handle: "@zeitzeuge", href: "https://youtube.com/@zeitzeuge" },
  { brand: "github", handle: "zeitzeuge", href: "https://github.com/zeitzeuge" },
];

/** What the enquiry is about. Drives the subject line of the composed mail. */
export const TOPICS = ["archive", "technical", "press", "accessibility", "other"] as const;
export type Topic = (typeof TOPICS)[number];
