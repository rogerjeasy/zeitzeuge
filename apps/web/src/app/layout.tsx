import type { ReactNode } from "react";

/**
 * The root layout is intentionally a pass-through: `<html>` and `<body>` are
 * owned by the locale layout, which is the first place the request's language
 * and text direction are actually known.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
