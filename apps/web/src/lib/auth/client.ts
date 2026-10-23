/**
 * The auth boundary.
 *
 * Every screen talks to this interface and nothing else, so swapping the demo
 * provider for Amazon Cognito (§9.1) is a single-file change with no edits to
 * any component. Keep the shapes below stable and the UI never has to know
 * which provider is behind it.
 */
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_in_use"
  | "rate_limited"
  | "network"
  | "unknown";

export type AuthResult =
  | { ok: true }
  | { ok: false; code: AuthErrorCode };

export interface AuthProvider {
  signIn(input: { email: string; password: string; remember: boolean }): Promise<AuthResult>;
  signUp(input: { email: string; password: string }): Promise<AuthResult>;
  requestPasswordReset(input: { email: string }): Promise<AuthResult>;
  resendVerification(input: { email: string }): Promise<AuthResult>;
  continueAsGuest(): Promise<AuthResult>;
}

/** Where every successful entry point lands. One constant, one place to change. */
export const AUTH_LANDING = "/dashboard";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Demo provider — no network, no persistence, and **no credential is stored or
 * transmitted anywhere**. It exists so the screens can be built and reviewed
 * before Cognito is provisioned.
 *
 * Reserved addresses make each failure state reachable without a backend:
 *
 *   taken@zeitzeuge.ch   → email_in_use      (sign-up)
 *   locked@zeitzeuge.ch  → rate_limited
 *   offline@zeitzeuge.ch → network
 *   wrong@zeitzeuge.ch   → invalid_credentials (sign-in)
 *
 * Anything else succeeds, because a judge typing their own address must get in.
 */
const reserved: Record<string, AuthErrorCode> = {
  "taken@zeitzeuge.ch": "email_in_use",
  "locked@zeitzeuge.ch": "rate_limited",
  "offline@zeitzeuge.ch": "network",
  "wrong@zeitzeuge.ch": "invalid_credentials",
};

function reservedFor(email: string): AuthErrorCode | undefined {
  return reserved[email.trim().toLowerCase()];
}

export const demoAuthProvider: AuthProvider = {
  async signIn({ email }) {
    await delay(900);
    const code = reservedFor(email);
    return code && code !== "email_in_use" ? { ok: false, code } : { ok: true };
  },

  async signUp({ email }) {
    await delay(1100);
    const code = reservedFor(email);
    return code ? { ok: false, code } : { ok: true };
  },

  async requestPasswordReset({ email }) {
    await delay(800);
    const code = reservedFor(email);
    // Never confirm or deny that an address exists — that is an enumeration
    // oracle. Only genuine transport failures surface as errors.
    return code === "network" || code === "rate_limited"
      ? { ok: false, code }
      : { ok: true };
  },

  async resendVerification() {
    await delay(700);
    return { ok: true };
  },

  async continueAsGuest() {
    await delay(500);
    return { ok: true };
  },
};

export const auth: AuthProvider = demoAuthProvider;
