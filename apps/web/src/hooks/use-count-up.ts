"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Counts from 0 to `target` once `active` turns true. When the visitor has
 * asked for reduced motion the target is returned directly — derived rather
 * than written into state, so there is no animation to cancel and no extra
 * render on mount.
 */
export function useCountUp(target: number, active: boolean, duration = 1400) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || reduced) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutExpo — fast settle, no bounce. Reads as a meter, not a slot machine.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target, duration, reduced]);

  return reduced && active ? target : value;
}
