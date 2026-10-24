/**
 * The review screen's keyboard (spec §4): J/→ next, K/← previous, A accept,
 * C correct, R reject, ↑/↓ move the field focus, ? help, Esc closes the help.
 * Inactive while the archivist types, and never with a modifier held, so the
 * browser's own shortcuts (⌘R, Ctrl+→) keep working.
 */

export type ShortcutAction =
  | "next"
  | "prev"
  | "accept"
  | "correct"
  | "reject"
  | "fieldUp"
  | "fieldDown"
  | "help"
  | "close";

export type KeyInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Shift is allowed: «?» needs it on most layouts. */
  shiftKey?: boolean;
  repeat?: boolean;
};

export type TargetInput = {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  role?: string | null;
} | null;

/** Inputs whose keys are not text (and not arrows): shortcuts stay live on these. */
const NON_TEXT_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "image", "file", "color"]);

/** True when keys belong to a field the user is typing in. */
export function isTypingTarget(target: TargetInput): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  // Text, number, date — and radio and range, whose arrows move the value.
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
  return target.role === "textbox" || target.role === "combobox";
}

const KEYMAP: Record<string, ShortcutAction> = {
  j: "next",
  arrowright: "next",
  k: "prev",
  arrowleft: "prev",
  a: "accept",
  c: "correct",
  r: "reject",
  arrowup: "fieldUp",
  arrowdown: "fieldDown",
  "?": "help",
  escape: "close",
};

export function shortcutFor(event: KeyInput, target: TargetInput): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  // While typing, every key is the field's; the help overlay handles its own Esc.
  if (isTypingTarget(target)) return null;
  const action = KEYMAP[key];
  if (!action) return null;
  // Held-down letters must not fire «accept» ten times.
  if (event.repeat && (action === "accept" || action === "correct" || action === "reject")) return null;
  return action;
}

/** For the help overlay: the keys, in the order the overlay lists them. */
export type ShortcutHelpId = "next" | "prev" | "field" | "accept" | "correct" | "reject" | "help";

export const SHORTCUT_HELP: { keys: string[]; id: ShortcutHelpId }[] = [
  { keys: ["J", "→"], id: "next" },
  { keys: ["K", "←"], id: "prev" },
  { keys: ["↑", "↓"], id: "field" },
  { keys: ["A"], id: "accept" },
  { keys: ["C"], id: "correct" },
  { keys: ["R"], id: "reject" },
  { keys: ["?"], id: "help" },
];
