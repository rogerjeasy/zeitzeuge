"use client";

import { cn } from "@/lib/cn";
import { useInView } from "@/hooks/use-in-view";

/**
 * Scroll reveal. Deliberately small: 14 px and a fade. Anything larger turns a
 * document into a carousel. `prefers-reduced-motion` is honoured globally in
 * globals.css, which collapses the transition to nothing.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Component
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 [transition-timing-function:var(--ease-archival)] motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-3.5 opacity-0",
        className,
      )}
    >
      {children}
    </Component>
  );
}
