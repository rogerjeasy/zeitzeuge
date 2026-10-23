import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { callerFrom } from "@/lib/api/server";
import { authApi } from "@/lib/auth/api";
import { LOGIN_PATH, NEXT_PARAM, isProtectedPath, splitLocale } from "@/lib/auth/routes";
import { clearSession, readAccessToken, readSession, writeSession } from "@/lib/auth/session";

/**
 * Locale negotiation, then the session gate. Next 16 renamed the `middleware`
 * file convention to `proxy`; next-intl's factory is unchanged.
 *
 * The gate is optimistic — it looks at cookies, not at the API — because it
 * runs on every navigation and prefetch. The authoritative check is the
 * `/users/me` call in the `(app)` layout (`lib/auth/dal.ts`). What the gate
 * adds is that an expired access token is renewed here, once, before any page
 * renders: a Server Component cannot set cookies, the proxy can.
 */
const intl = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  // No locale yet: next-intl redirects to one, and the gate runs on that request.
  if (!locale || !isProtectedPath(path)) return intl(request);
  if (readAccessToken(request.cookies)) return intl(request);

  const session = readSession(request.cookies);
  let rejected = false;
  // Only a navigation can be bounced; a POST (a server action) would lose its
  // body, so it proceeds and meets the API's own 401.
  if (session && request.method === "GET") {
    const refreshed = await authApi.refresh(
      { refresh_token: session.refreshToken, session_id: session.sessionId },
      callerFrom(request.headers),
    );
    if (refreshed.ok) {
      // Same URL again, now carrying the new cookie, so this render and every
      // Server Component in it see the renewed token.
      const response = NextResponse.redirect(request.nextUrl);
      writeSession(response.cookies, refreshed.data, {
        remember: session.remember,
        previous: session,
      });
      return response;
    }
    // A 4xx means the session is over. A network error or a 5xx does not:
    // the archivist keeps the cookie and is signed back in once the API is up.
    const { status } = refreshed.problem;
    rejected = status >= 400 && status < 500;
  }

  if (request.method !== "GET") return intl(request);

  const login = new URL(`/${locale}${LOGIN_PATH}`, request.nextUrl);
  login.searchParams.set(NEXT_PARAM, `${path}${request.nextUrl.search}`);
  const response = NextResponse.redirect(login);
  if (rejected) clearSession(response.cookies);
  return response;
}

export const config = {
  // Skip Next internals, API routes and anything with a file extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
