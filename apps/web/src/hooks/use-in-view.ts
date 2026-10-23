"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fires once when the element first enters the viewport. Used for scroll
 * reveals and for starting counters — never for anything the page needs in
 * order to be readable.
 */
export function useInView<T extends HTMLElement>(
  options: { rootMargin?: string; threshold?: number } = {},
) {
  const { rootMargin = "0px 0px -12% 0px", threshold = 0.15 } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No observer to subscribe to (very old browsers, some test runners):
    // reveal immediately rather than leaving content permanently hidden.
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { ref, inView };
}
