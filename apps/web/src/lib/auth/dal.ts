import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { callerFrom } from "@/lib/api/server";
import { authApi, type ProfileResponse } from "./api";
import { LOGIN_PATH } from "./routes";
import { readAccessToken, readSession } from "./session";
import type { SessionUser } from "./types";

/**
 * The data access layer for identity — the *secure* check, where the proxy's
 * is only optimistic. The API verifies the token's signature, expiry and
 * revocation and that the archive still admits the person; this module never
 * decodes a token itself.
 *
 * `cache` makes it one `/users/me` per render, however many components ask.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const accessToken = readAccessToken(jar);
  if (!accessToken) return null;

  const result = await authApi.me(
    accessToken,
    readSession(jar)?.sessionId,
    callerFrom(await headers()),
  );
  return result.ok ? toSessionUser(result.data) : null;
});

/** For protected layouts and pages: the user, or a redirect to sign-in. */
export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect({ href: LOGIN_PATH, locale });
  return user as SessionUser;
}

/** A DTO: only what the shell renders, never the whole profile. */
function toSessionUser(profile: ProfileResponse): SessionUser {
  return {
    email: profile.email,
    displayName: profile.full_name || profile.email,
    initials: profile.initials,
    role: profile.role,
    organizationName: profile.organization.name,
    isGuest: profile.role === "guest",
    canPublishDemo:
      profile.organization.slug === "stasz" && ["archivist", "admin"].includes(profile.role),
  };
}
