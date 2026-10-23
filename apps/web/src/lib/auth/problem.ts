import type { AuthErrorCode } from "./types";

/**
 * API problem → the UI's closed error set.
 *
 * Pure, so it can be tested without a server. Field-level validation types
 * (`errors[].type`, set by the API's Pydantic validators) are consulted before
 * the top-level code, because `validation_failed` alone tells the archivist
 * nothing they can act on.
 */

type Problem = { status: number; code: string; errors: { field: string; type: string }[] };

const BY_FIELD_TYPE: Record<string, AuthErrorCode> = {
  password_mismatch: "password_mismatch",
  weak_password: "weak_password",
};

const BY_CODE: Record<string, AuthErrorCode> = {
  invalid_credentials: "invalid_credentials",
  email_in_use: "email_in_use",
  email_not_verified: "email_not_verified",
  weak_password: "weak_password",
  code_mismatch: "code_mismatch",
  code_expired: "code_expired",
  account_disabled: "account_disabled",
  password_reset_required: "unsupported_step",
  rate_limited: "rate_limited",
  network: "network",
  upstream_unavailable: "unavailable",
  database_unavailable: "unavailable",
  misconfigured: "unavailable",
};

export function authErrorFromProblem(problem: Problem): AuthErrorCode {
  for (const error of problem.errors) {
    const mapped = BY_FIELD_TYPE[error.type];
    if (mapped) return mapped;
  }
  const mapped = BY_CODE[problem.code];
  if (mapped) return mapped;
  return problem.status >= 500 ? "unavailable" : "unknown";
}
