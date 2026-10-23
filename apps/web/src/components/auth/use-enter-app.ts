"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { landingAfterSignIn } from "@/lib/auth/client";

/**
 * The last step of every way in — password, confirmed sign-up, guest. One
 * implementation, so they all honour `?next=` and all show the same pending
 * state while the first protected screen renders.
 */
export function useEnterApp() {
  const router = useRouter();
  const [entering, startTransition] = useTransition();

  function enterApp() {
    startTransition(() => router.push(landingAfterSignIn()));
  }

  return { entering, enterApp };
}
