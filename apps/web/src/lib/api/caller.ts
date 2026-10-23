/**
 * Who is really asking, as the API should see it.
 *
 * Behind CloudFront the trustworthy client address is `CloudFront-Viewer-Address`:
 * CloudFront writes it from the TCP connection, so a browser cannot forge it.
 * The web tier forwards that header on its server-side calls; the API accepts
 * `X-Forwarded-For` only in local development, because a client can prepend
 * anything to it. Without this, every rate limit and audit row in the API
 * would name the web tier's address instead of the archivist's browser.
 *
 * Pure, so it is tested without a server.
 */
export type CallerHeaders = Record<string, string>;

const FORWARDED = [
  "cloudfront-viewer-address",
  "cloudfront-viewer-city",
  "cloudfront-viewer-country",
  "user-agent",
  // Local development only: the API ignores it anywhere else.
  "x-forwarded-for",
] as const;

export function callerFrom(headers: Headers): CallerHeaders {
  const caller: CallerHeaders = {};
  for (const name of FORWARDED) {
    const value = headers.get(name);
    if (value) caller[name] = value;
  }
  return caller;
}
