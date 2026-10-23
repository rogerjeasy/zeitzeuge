import "server-only";

/**
 * The browser's half of a sign-in, as two HttpOnly cookies.
 *
 *   zz_at       the Cognito access token. Lives exactly as long as the token,
 *               so "no cookie" and "expired" are the same state.
 *   zz_session  the refresh token, the API's session id and the "keep me
 *               signed in" choice. Persistent for 30 days when chosen,
 *               otherwise a browser-session cookie.
 *
 * Neither is readable from JavaScript, both are `SameSite=Lax` and `Secure`
 * outside development. The id token is not kept: the profile comes from
 * `/users/me`, which is authoritative where a token's claims are a snapshot.
 *
 * Written against the minimal cookie interface shared by `cookies()` and
 * `NextRequest`/`NextResponse`, so server actions and the proxy use one
 * implementation.
 */

export const ACCESS_COOKIE = "zz_at";
export const SESSION_COOKIE = "zz_session";

/** Matches the API's `session_idle_days`. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
/** Drop the access token a little early, so it never expires mid-request. */
const ACCESS_EXPIRY_MARGIN = 60;

export type TokenBundle = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  session_id: string;
};

export type StoredSession = {
  refreshToken: string;
  sessionId: string;
  remember: boolean;
};

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge?: number;
};

type CookieReader = { get(name: string): { value: string } | undefined };
type CookieWriter = {
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
};

function options(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

export function writeSession(
  jar: CookieWriter,
  tokens: TokenBundle,
  { remember, previous }: { remember: boolean; previous?: StoredSession },
): void {
  jar.set(
    ACCESS_COOKIE,
    tokens.access_token,
    options(Math.max(tokens.expires_in - ACCESS_EXPIRY_MARGIN, 1)),
  );

  // A refresh only returns a new refresh token when Cognito rotates them;
  // otherwise the one already held stays valid.
  const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) return;
  const session: StoredSession = { refreshToken, sessionId: tokens.session_id, remember };
  jar.set(SESSION_COOKIE, encode(session), options(remember ? SESSION_MAX_AGE : undefined));
}

export function readAccessToken(jar: CookieReader): string | undefined {
  return jar.get(ACCESS_COOKIE)?.value || undefined;
}

export function readSession(jar: CookieReader): StoredSession | undefined {
  const raw = jar.get(SESSION_COOKIE)?.value;
  return raw ? decode(raw) : undefined;
}

export function clearSession(jar: CookieWriter): void {
  jar.delete(ACCESS_COOKIE);
  jar.delete(SESSION_COOKIE);
}

function encode(session: StoredSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

/** A tampered or truncated cookie is no session, never an exception. */
function decode(raw: string): StoredSession | undefined {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      value &&
      typeof value === "object" &&
      typeof (value as StoredSession).refreshToken === "string" &&
      typeof (value as StoredSession).sessionId === "string"
    ) {
      const { refreshToken, sessionId, remember } = value as StoredSession;
      return { refreshToken, sessionId, remember: remember === true };
    }
  } catch {
    // fall through
  }
  return undefined;
}
