"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared 1 s clock for every live counter on the page («läuft seit 0:42»).
 *
 * A module-level store, not an interval per row: however many running photos
 * a table shows, there is one `setInterval`, started by the first subscriber
 * and stopped with the last. It pauses while the tab is hidden and catches up
 * at once when the tab is shown again, so a background tab costs nothing.
 *
 * The server snapshot is `null`, so the first client render matches the
 * server's HTML and the clock appears right after hydration.
 */

const TICK_MS = 1_000;

let now: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function start() {
  if (timer !== null || document.visibilityState === "hidden") return;
  emit();
  timer = setInterval(emit, TICK_MS);
}

function stop() {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function onVisibility() {
  if (document.visibilityState === "hidden") stop();
  else start();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    start();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

const noop = () => () => {};
// Stable between ticks (React compares snapshots); seeded once if read before the first tick.
const getSnapshot = () => (now ??= Date.now());
const getServerSnapshot = () => null;

/** `Date.now()`, refreshed every second while `active`; `null` on the server and before hydration. */
export function useNow(active = true): number | null {
  return useSyncExternalStore(active ? subscribe : noop, active ? getSnapshot : getServerSnapshot, getServerSnapshot);
}
