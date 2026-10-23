import "server-only";

import { apiRequest, type ApiResult, type CallerHeaders } from "@/lib/api/server";
import type { TokenBundle } from "./session";

/**
 * Typed calls to `/api/v1/auth/*` and `/users/me` — the request and response
 * shapes of `apps/api/src/zeitzeuge_api/schemas/{auth,user}.py`, stated once.
 * Server actions and the proxy both go through here.
 */

type LoginResponse = {
  tokens: TokenBundle | null;
  challenge: { challenge: string } | null;
};

type GuestResponse = { tokens: TokenBundle };

export type ProfileResponse = {
  email: string;
  full_name: string;
  initials: string;
  role: string;
  organization: { name: string; is_demo: boolean };
};

export const authApi = {
  register(
    body: {
      email: string;
      password: string;
      password_confirmation: string;
      locale: string;
      accept_terms: true;
    },
    caller: CallerHeaders,
  ): Promise<ApiResult<unknown>> {
    return apiRequest("/auth/register", { body, caller });
  },

  verify(body: { email: string; code: string }, caller: CallerHeaders) {
    return apiRequest<unknown>("/auth/verify", { body, caller });
  },

  resendVerification(body: { email: string }, caller: CallerHeaders) {
    return apiRequest<unknown>("/auth/verify/resend", { body, caller });
  },

  login(body: { email: string; password: string; remember: boolean }, caller: CallerHeaders) {
    return apiRequest<LoginResponse>("/auth/login", { body, caller });
  },

  guest(caller: CallerHeaders) {
    return apiRequest<GuestResponse>("/auth/guest", { caller });
  },

  refresh(body: { refresh_token: string; session_id: string }, caller: CallerHeaders) {
    return apiRequest<TokenBundle>("/auth/refresh", { body, caller });
  },

  logout(
    { accessToken, sessionId, refreshToken }: {
      accessToken: string;
      sessionId?: string;
      refreshToken?: string;
    },
    caller: CallerHeaders,
  ) {
    return apiRequest<void>("/auth/logout", {
      body: { refresh_token: refreshToken ?? null, all_devices: false },
      accessToken,
      sessionId,
      caller,
    });
  },

  forgotPassword(body: { email: string }, caller: CallerHeaders) {
    return apiRequest<unknown>("/auth/password/forgot", { body, caller });
  },

  me(accessToken: string, sessionId: string | undefined, caller: CallerHeaders) {
    return apiRequest<ProfileResponse>("/users/me", {
      method: "GET",
      accessToken,
      sessionId,
      caller,
    });
  },
};
