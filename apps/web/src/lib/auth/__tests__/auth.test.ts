import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authErrorFromProblem } from "../problem";
import { isProtectedPath, safeNextPath, splitLocale } from "../routes";
import { hasErrors, validateCode, validateSignIn, validateSignUp } from "../validation";

const STRONG = "Gletscher-1893!";

describe("validateSignUp", () => {
  it("accepts a strong password typed twice", () => {
    const errors = validateSignUp({
      email: "a.betschart@sz.ch",
      password: STRONG,
      passwordConfirmation: STRONG,
    });
    assert.equal(hasErrors(errors), false);
  });

  it("requires the confirmation", () => {
    const errors = validateSignUp({ email: "a@sz.ch", password: STRONG, passwordConfirmation: "" });
    assert.equal(errors.passwordConfirmation, "confirmRequired");
  });

  it("rejects a confirmation that differs by one character", () => {
    const errors = validateSignUp({
      email: "a@sz.ch",
      password: STRONG,
      passwordConfirmation: "Gletscher-1894!",
    });
    assert.equal(errors.passwordConfirmation, "passwordMismatch");
  });

  it("is case-sensitive about the match", () => {
    const errors = validateSignUp({
      email: "a@sz.ch",
      password: STRONG,
      passwordConfirmation: STRONG.toLowerCase(),
    });
    assert.equal(errors.passwordConfirmation, "passwordMismatch");
  });

  it("refuses a weak password even when both copies agree", () => {
    const errors = validateSignUp({
      email: "a@sz.ch",
      password: "passwort",
      passwordConfirmation: "passwort",
    });
    assert.equal(errors.password, "passwordWeak");
    assert.equal(errors.passwordConfirmation, undefined);
  });

  it("refuses a password beyond Cognito's ceiling", () => {
    const long = `Aa1!${"x".repeat(300)}`;
    const errors = validateSignUp({ email: "a@sz.ch", password: long, passwordConfirmation: long });
    assert.equal(errors.password, "passwordWeak");
  });

  it("catches an implausible address", () => {
    const errors = validateSignUp({ email: "a@sz", password: STRONG, passwordConfirmation: STRONG });
    assert.equal(errors.email, "emailInvalid");
  });
});

describe("validateSignIn", () => {
  it("needs both fields", () => {
    assert.deepEqual(validateSignIn({ email: "", password: "" }), {
      email: "emailRequired",
      password: "passwordRequired",
    });
  });

  it("does not apply the sign-up policy to an existing password", () => {
    assert.equal(hasErrors(validateSignIn({ email: "a@sz.ch", password: "old" })), false);
  });
});

describe("validateCode", () => {
  it("accepts six digits, with the spaces a paste brings", () => {
    assert.equal(validateCode("123 456").code, undefined);
  });

  it("rejects letters and short codes", () => {
    assert.equal(validateCode("12a456").code, "codeInvalid");
    assert.equal(validateCode("12345").code, "codeInvalid");
    assert.equal(validateCode("").code, "codeRequired");
  });
});

describe("safeNextPath", () => {
  const fallback = "/dashboard";

  it("keeps a same-site path with its query", () => {
    assert.equal(safeNextPath("/queue?filter=review", fallback), "/queue?filter=review");
  });

  it("drops the locale, because the router adds the current one", () => {
    assert.equal(safeNextPath("/fr/records/42", fallback), "/records/42");
  });

  for (const hostile of [
    "https://evil.ch",
    "//evil.ch",
    "/\\evil.ch",
    "/..//evil.ch",
    "/./\\evil.ch",
    "/\t/evil.ch",
    "javascript:alert(1)",
    "\n/dashboard",
    "",
    null,
  ]) {
    it(`refuses ${JSON.stringify(hostile)}`, () => {
      assert.equal(safeNextPath(hostile, fallback), fallback);
    });
  }

  it("keeps encoded characters encoded, so they stay part of one path", () => {
    assert.equal(safeNextPath("/%2F%2Fevil.ch", fallback), "/%2F%2Fevil.ch");
  });

  it("never returns into the auth screens", () => {
    assert.equal(safeNextPath("/de/auth/login", fallback), fallback);
    assert.equal(safeNextPath("/auth/signup", fallback), fallback);
  });
});

describe("route protection", () => {
  it("protects the app by default", () => {
    for (const path of ["/dashboard", "/records/42", "/settings/security", "/a-new-screen"]) {
      assert.equal(isProtectedPath(path), true, path);
    }
  });

  it("leaves the public pages open", () => {
    for (const path of ["/", "/auth/login", "/auth/signup", "/terms", "/privacy", "/docs"]) {
      assert.equal(isProtectedPath(path), false, path);
    }
  });

  it("splits the locale off", () => {
    assert.deepEqual(splitLocale("/de/dashboard"), { locale: "de", path: "/dashboard" });
    assert.deepEqual(splitLocale("/de"), { locale: "de", path: "/" });
    assert.deepEqual(splitLocale("/dashboard"), { path: "/dashboard" });
  });
});

describe("authErrorFromProblem", () => {
  it("prefers the field-level type over the generic code", () => {
    const code = authErrorFromProblem({
      status: 422,
      code: "validation_failed",
      errors: [{ field: "password_confirmation", type: "password_mismatch" }],
    });
    assert.equal(code, "password_mismatch");
  });

  it("maps the API's codes onto the UI's", () => {
    const of = (code: string, status = 400) => authErrorFromProblem({ status, code, errors: [] });
    assert.equal(of("invalid_credentials", 401), "invalid_credentials");
    assert.equal(of("email_in_use", 409), "email_in_use");
    assert.equal(of("email_not_verified", 403), "email_not_verified");
    assert.equal(of("rate_limited", 429), "rate_limited");
    assert.equal(of("network", 0), "network");
    assert.equal(of("database_unavailable", 503), "unavailable");
  });

  it("never leaks an unknown code, and calls any 5xx unavailable", () => {
    assert.equal(authErrorFromProblem({ status: 418, code: "teapot", errors: [] }), "unknown");
    assert.equal(authErrorFromProblem({ status: 500, code: "unknown", errors: [] }), "unavailable");
  });
});
