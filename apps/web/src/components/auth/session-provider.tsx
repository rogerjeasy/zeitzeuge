"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/auth/types";

/**
 * The signed-in person, handed down from the `(app)` layout. Client components
 * cannot import the data access layer, so the layout resolves the user on the
 * server and this context carries the DTO — and only the DTO — to them.
 */
const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSessionUser must be used inside <SessionProvider>.");
  return user;
}
