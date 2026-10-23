import { evaluatePassword, isPlausibleEmail } from "./password";

/**
 * Form validation, run twice from one definition: in the browser for instant
 * feedback, and in the server action because a request does not have to come
 * from the form. The values are keys under `auth.errors`, so the form can
 * translate them and the action can simply check that there are none.
 *
 * The API validates a third time. That is the authority; these only spare it
 * requests that are certain to fail.
 */

/** Cognito's ceiling, and the API's `max_length`. */
export const MAX_PASSWORD_LENGTH = 256;

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.values(errors).some(Boolean);
}

function emailError(email: string): string | undefined {
  if (!email.trim()) return "emailRequired";
  if (!isPlausibleEmail(email)) return "emailInvalid";
  return undefined;
}

export function validateSignIn(input: {
  email: string;
  password: string;
}): FieldErrors<"email" | "password"> {
  return {
    email: emailError(input.email),
    password: !input.password
      ? "passwordRequired"
      : input.password.length > MAX_PASSWORD_LENGTH
        ? "invalidCredentials"
        : undefined,
  };
}

export function validateSignUp(input: {
  email: string;
  password: string;
  passwordConfirmation: string;
}): FieldErrors<"email" | "password" | "passwordConfirmation"> {
  const { password, passwordConfirmation } = input;
  return {
    email: emailError(input.email),
    password: !password
      ? "passwordRequired"
      : !evaluatePassword(password).satisfied || password.length > MAX_PASSWORD_LENGTH
        ? "passwordWeak"
        : undefined,
    passwordConfirmation: !passwordConfirmation
      ? "confirmRequired"
      : passwordConfirmation !== password
        ? "passwordMismatch"
        : undefined,
  };
}

/** Pasted codes often carry spaces ("123 456"); the API wants digits only. */
export function normaliseCode(code: string): string {
  return code.replace(/\s+/g, "");
}

export function validateCode(code: string): FieldErrors<"code"> {
  const value = normaliseCode(code);
  return {
    code: !value ? "codeRequired" : /^\d{6,10}$/.test(value) ? undefined : "codeInvalid",
  };
}

export function validateEmail(email: string): FieldErrors<"email"> {
  return { email: emailError(email) };
}
