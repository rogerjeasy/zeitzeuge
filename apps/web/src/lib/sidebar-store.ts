/**
 * The sidebar's collapsed flag, as a tiny external store.
 *
 * `useSyncExternalStore` is the right shape for this: the value lives in
 * localStorage (outside React), the server cannot know it, and React handles
 * the server→client snapshot swap during hydration without a mismatch. Reading
 * it in an effect instead would be a second render pass and a visible flash.
 */
const KEY = "zeitzeuge-sidebar-collapsed";

const listeners = new Set<() => void>();

export function subscribeSidebar(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getSidebarCollapsed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** The server has no storage; default to the expanded, labelled sidebar. */
export function getSidebarServerSnapshot() {
  return false;
}

export function setSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    /* storage blocked — the toggle still works for this session */
  }
  listeners.forEach((listener) => listener());
}
