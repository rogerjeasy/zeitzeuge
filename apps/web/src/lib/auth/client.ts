/**
 * The auth boundary.
 *
 * Every screen talks to this object and nothing else. Behind it are server
 * actions (`actions.ts`) that call the FastAPI gateway, which owns the
 * credential in Amazon Cognito; the tokens it returns are kept in HttpOnly
 * cookies and are never visible to this code.
 */
import {
  continueAsGuestAction,
  requestPasswordResetAction,
  resendVerificationAction,
  signInAction,
  signOutAction,
  signUpAction,
  verifyEmailAction,
} from "./actions";
import { NEXT_PARAM, safeNextPath } from "./routes";
import type { AuthProvider } from "./types";

export type { AuthErrorCode, AuthProvider, AuthResult } from "./types";

/** Where every successful entry point lands. One constant, one place to change. */
export const AUTH_LANDING = "/dashboard";

/**
 * Where to go after signing in: the protected page that sent the archivist
 * here (`?next=`, set by the proxy), if it is a safe same-site path, else the
 * landing page. Read at call time, so the sign-in screens stay static.
 */
export function landingAfterSignIn(): string {
  if (typeof window === "undefined") return AUTH_LANDING;
  const next = new URLSearchParams(window.location.search).get(NEXT_PARAM);
  return safeNextPath(next, AUTH_LANDING);
}

export const auth: AuthProvider = {
  signIn: signInAction,
  signUp: signUpAction,
  verifyEmail: verifyEmailAction,
  resendVerification: resendVerificationAction,
  requestPasswordReset: requestPasswordResetAction,
  continueAsGuest: continueAsGuestAction,
  signOut: signOutAction,
};
