/**
 * Password policy. These are Cognito's default user-pool requirements, stated
 * here once so the UI checklist and the validation that gates submission can
 * never drift apart.
 */
export const PASSWORD_RULES = [
  { id: "length", test: (v: string) => v.length >= 8 },
  { id: "upper", test: (v: string) => /[A-ZÄÖÜ]/.test(v) },
  { id: "lower", test: (v: string) => /[a-zäöüß]/.test(v) },
  { id: "digit", test: (v: string) => /\d/.test(v) },
  { id: "symbol", test: (v: string) => /[^\p{L}\p{N}]/u.test(v) },
] as const;

export type PasswordRuleId = (typeof PASSWORD_RULES)[number]["id"];

export function evaluatePassword(value: string) {
  const passed = PASSWORD_RULES.filter((rule) => rule.test(value)).map((r) => r.id);
  const satisfied = passed.length === PASSWORD_RULES.length;

  // Length beyond the minimum counts for something, but never enough on its
  // own — a 40-character all-lowercase passphrase still fails the policy.
  const lengthBonus = value.length >= 14 ? 1 : 0;
  const score = Math.min(passed.length + lengthBonus, 5);

  return { passed, satisfied, score };
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export function strengthOf(score: number): PasswordStrength {
  if (score <= 2) return "weak";
  if (score === 3) return "fair";
  if (score === 4) return "good";
  return "strong";
}

/**
 * Deliberately permissive: the authority on whether an address exists is the
 * mail that gets sent to it, never a regular expression. This only catches
 * obvious typos before a round trip.
 */
export function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
