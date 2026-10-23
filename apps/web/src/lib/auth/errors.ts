import type { AuthErrorCode } from "./client";

/** Provider error code → key under the `auth.errors` namespace. */
export const AUTH_ERROR_KEY: Record<AuthErrorCode, string> = {
  invalid_credentials: "invalidCredentials",
  email_in_use: "emailInUse",
  rate_limited: "rateLimited",
  network: "network",
  unknown: "generic",
};
