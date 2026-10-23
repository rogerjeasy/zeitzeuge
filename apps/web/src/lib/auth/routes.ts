import { routing, type Locale } from "@/i18n/routing";

/**
 * Which paths need a session. Pure, so the proxy and the forms agree.
 *
 * Protection is the default: a section is public only if it is listed here.
 * A new screen added under `(app)` is therefore protected without anyone
 * remembering to protect it — the failure mode of forgetting is a sign-in
 * prompt, not an exposed page.
 */
export const PUBLIC_SECTIONS: ReadonlySet<string> = new Set([
  "", // the homepage
  "about",
  "accessibility",
  "api",
  "auth",
  "contact",
  "docs",
  "imprint",
  "privacy",
  "standards",
  "status",
  "terms",
]);

export const LOGIN_PATH = "/auth/login";
export const NEXT_PARAM = "next";

/** `/de/dashboard/x` → `{ locale: "de", path: "/dashboard/x" }`. */
export function splitLocale(pathname: string): { locale?: Locale; path: string } {
  const [, first = "", ...rest] = pathname.split("/");
  const locale = routing.locales.find((l) => l === first);
  if (!locale) return { path: pathname };
  return { locale, path: `/${rest.join("/")}` };
}

export function isProtectedPath(path: string): boolean {
  const section = path.split("/")[1] ?? "";
  return !PUBLIC_SECTIONS.has(section);
}

/** Rooted, and not protocol-relative (`//host`, or `/\host` as browsers read it). */
function isSameSitePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

/**
 * The `?next=` target, accepted only as a same-site path. Anything that could
 * leave the site — `//evil.ch`, `/\evil.ch`, `https://…`, a scheme — falls
 * back to the landing page, so the sign-in form is never an open redirect.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !isSameSitePath(value) || /[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://zeitzeuge.invalid");
    if (url.origin !== "https://zeitzeuge.invalid") return fallback;
    // Locale-less: the locale-aware router adds the current one back.
    const { path } = splitLocale(url.pathname);
    // Never bounce back into the auth screens themselves.
    if (path === "/auth" || path.startsWith("/auth/")) return fallback;
    // Checked again after normalisation: `/..//evil.ch` resolves to `//evil.ch`.
    return isSameSitePath(path) ? `${path}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
