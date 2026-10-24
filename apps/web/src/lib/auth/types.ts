/**
 * The auth contract every screen is written against. Shared by the client
 * (`client.ts`) and the server actions that implement it (`actions.ts`), so
 * neither side can drift from the other.
 */

/**
 * A closed set — each code maps to exactly one translation key in
 * `errors.ts`. The API's problem codes are translated into these on the
 * server, so no component ever sees an HTTP status or an English sentence.
 */
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_in_use"
  | "email_not_verified"
  | "weak_password"
  | "password_mismatch"
  | "code_mismatch"
  | "code_expired"
  | "account_disabled"
  | "unsupported_step"
  | "rate_limited"
  | "unavailable"
  | "network"
  | "unknown";

export type AuthResult = { ok: true } | { ok: false; code: AuthErrorCode };

export type SignInInput = { email: string; password: string; remember: boolean };

export type SignUpInput = {
  email: string;
  password: string;
  passwordConfirmation: string;
  locale: string;
};

export type VerifyEmailInput = { email: string; code: string };

export interface AuthProvider {
  signIn(input: SignInInput): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  verifyEmail(input: VerifyEmailInput): Promise<AuthResult>;
  resendVerification(input: { email: string }): Promise<AuthResult>;
  requestPasswordReset(input: { email: string }): Promise<AuthResult>;
  continueAsGuest(): Promise<AuthResult>;
  startDemo(): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
}

/** What the signed-in shell may know about the person. Nothing more. */
export type SessionUser = {
  email: string;
  displayName: string;
  initials: string;
  role: string;
  organizationName: string;
  isGuest: boolean;
  /** The Staatsarchiv's approvers publish batches to the guest archive (the API decides). */
  canPublishDemo: boolean;
};
