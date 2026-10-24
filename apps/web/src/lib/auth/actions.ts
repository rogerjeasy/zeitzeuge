"use server";

import { cookies, headers } from "next/headers";
import { routing } from "@/i18n/routing";
import { callerFrom } from "@/lib/api/server";
import { authApi } from "./api";
import { authErrorFromProblem } from "./problem";
import { clearSession, readAccessToken, readSession, writeSession, type TokenBundle } from "./session";
import type { AuthResult, SignInInput, SignUpInput, VerifyEmailInput } from "./types";
import {
  hasErrors,
  normaliseCode,
  validateCode,
  validateEmail,
  validateSignIn,
  validateSignUp,
} from "./validation";

/**
 * The server half of `AuthProvider`. Each action is a public endpoint — it can
 * be called without the form — so each one re-validates its input, and none
 * returns anything but an `AuthResult`: tokens go into HttpOnly cookies and
 * never into the response body.
 *
 * Next.js checks `Origin` against `Host` on every action, which is the CSRF
 * defence for these POSTs.
 */

const OK: AuthResult = { ok: true };
const INVALID: AuthResult = { ok: false, code: "unknown" };

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const normaliseEmail = (value: unknown): string => text(value).trim().toLowerCase();

async function caller() {
  return callerFrom(await headers());
}

async function startSession(tokens: TokenBundle, remember: boolean): Promise<void> {
  writeSession(await cookies(), tokens, { remember });
}

export async function signInAction(input: SignInInput): Promise<AuthResult> {
  const email = normaliseEmail(input?.email);
  const password = text(input?.password);
  const remember = input?.remember === true;
  if (hasErrors(validateSignIn({ email, password }))) return INVALID;

  const result = await authApi.login({ email, password, remember }, await caller());
  if (!result.ok) return { ok: false, code: authErrorFromProblem(result.problem) };

  const { tokens, challenge } = result.data;
  // MFA and forced password changes are supported by the API but not yet by
  // these screens. Saying so beats a sign-in that silently goes nowhere.
  if (challenge || !tokens) return { ok: false, code: "unsupported_step" };

  await startSession(tokens, remember);
  return OK;
}

export async function signUpAction(input: SignUpInput): Promise<AuthResult> {
  const email = normaliseEmail(input?.email);
  const password = text(input?.password);
  const passwordConfirmation = text(input?.passwordConfirmation);
  const errors = validateSignUp({ email, password, passwordConfirmation });
  if (errors.passwordConfirmation === "passwordMismatch") {
    return { ok: false, code: "password_mismatch" };
  }
  if (hasErrors(errors)) return { ok: false, code: errors.password ? "weak_password" : "unknown" };

  const locale = routing.locales.find((l) => l === input?.locale) ?? routing.defaultLocale;

  const result = await authApi.register(
    {
      email,
      password,
      password_confirmation: passwordConfirmation,
      locale,
      // The form states that continuing accepts the terms (`LegalNote`);
      // the API records the moment it happened.
      accept_terms: true,
    },
    await caller(),
  );
  return result.ok ? OK : { ok: false, code: authErrorFromProblem(result.problem) };
}

export async function verifyEmailAction(input: VerifyEmailInput): Promise<AuthResult> {
  const email = normaliseEmail(input?.email);
  const code = normaliseCode(text(input?.code));
  if (hasErrors(validateEmail(email)) || hasErrors(validateCode(code))) return INVALID;

  const result = await authApi.verify({ email, code }, await caller());
  return result.ok ? OK : { ok: false, code: authErrorFromProblem(result.problem) };
}

export async function resendVerificationAction(input: { email: string }): Promise<AuthResult> {
  const email = normaliseEmail(input?.email);
  if (hasErrors(validateEmail(email))) return INVALID;

  const result = await authApi.resendVerification({ email }, await caller());
  return result.ok ? OK : { ok: false, code: authErrorFromProblem(result.problem) };
}

export async function requestPasswordResetAction(input: { email: string }): Promise<AuthResult> {
  const email = normaliseEmail(input?.email);
  if (hasErrors(validateEmail(email))) return INVALID;

  // The API answers 202 for every address, registered or not; only transport
  // failures and throttling come back as errors.
  const result = await authApi.forgotPassword({ email }, await caller());
  return result.ok ? OK : { ok: false, code: authErrorFromProblem(result.problem) };
}

export async function continueAsGuestAction(): Promise<AuthResult> {
  const result = await authApi.guest(await caller());
  if (!result.ok) return { ok: false, code: authErrorFromProblem(result.problem) };
  // A demo session never outlives the browser session.
  await startSession(result.data.tokens, false);
  return OK;
}

export async function startDemoAction(): Promise<AuthResult> {
  // The visitor's own archive with an archivist's rights: no form, no wall.
  // Like the guest, it never outlives the browser session.
  const jar = await cookies();
  const from = await caller();
  const accessToken = readAccessToken(jar);
  if (accessToken) {
    // Already inside (a second click, a return to the home page): keep that
    // archive and its uploads rather than opening another. Only the read-only
    // guest is swapped for a demo archive of their own.
    const me = await authApi.me(accessToken, readSession(jar)?.sessionId, from);
    if (me.ok && me.data.role !== "guest") return OK;
  }
  clearSession(jar);
  const result = await authApi.demo(from);
  if (!result.ok) return { ok: false, code: authErrorFromProblem(result.problem) };
  await startSession(result.data.tokens, false);
  return OK;
}

export async function signOutAction(): Promise<AuthResult> {
  const jar = await cookies();
  const accessToken = readAccessToken(jar);
  const session = readSession(jar);

  // Local sign-out is unconditional: whatever the API says, this browser no
  // longer holds the tokens. Revocation is best effort on top of that.
  clearSession(jar);
  if (accessToken) {
    await authApi.logout(
      { accessToken, sessionId: session?.sessionId, refreshToken: session?.refreshToken },
      await caller(),
    );
  }
  return OK;
}
