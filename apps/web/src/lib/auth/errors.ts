import type { AuthErrorCode } from "./types";

/** Provider error code → key under the `auth.errors` namespace. */
export const AUTH_ERROR_KEY: Record<AuthErrorCode, string> = {
  invalid_credentials: "invalidCredentials",
  email_in_use: "emailInUse",
  email_not_verified: "emailNotVerified",
  weak_password: "passwordWeak",
  password_mismatch: "passwordMismatch",
  code_mismatch: "codeMismatch",
  code_expired: "codeExpired",
  account_disabled: "accountDisabled",
  unsupported_step: "unsupportedStep",
  rate_limited: "rateLimited",
  unavailable: "unavailable",
  network: "network",
  unknown: "generic",
};
