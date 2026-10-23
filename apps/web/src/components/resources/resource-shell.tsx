"use client";

import { useEffect, useState } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";

export interface TocEntry {
  id: string;
  label: string;
}

/**
 * The masthead for a long-form reference page.
 *
 * These three pages are read rather than used, so they get a quieter opening
 * than a product screen: a label, a title, a sentence that says who it is for,
 * and — where it matters — the facts a reader checks before they start (base
 * URL, version, what is actually implemented).
 */
export function ResourceHero({
  eyebrow,
  title,
  lede,
  facts,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  facts?: { label: string; value: string }[];
}) {
  return (
    <div className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="texture-grain absolute inset-0" />
      <div className="relative mx-auto flex w-full max-w-[84rem] flex-col gap-5 px-5 pb-12 pt-28 sm:px-8 sm:pb-14 sm:pt-32 lg:px-12 lg:pb-16 lg:pt-36">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="max-w-[20ch] text-balance-tight font-display text-[clamp(2rem,1.4rem+2.4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground-strong">
          {title}
        </h1>
        <p className="max-w-[62ch] text-[1.0625rem] leading-relaxed text-muted">{lede}</p>

        {facts && facts.length > 0 && (
          <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-0.5">
                <dt className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted-2">
                  {fact.label}
                </dt>
                <dd className="font-mono text-[0.8125rem] text-foreground-strong">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/**
 * Body with a contents rail.
 *
 * The rail tracks the heading you are actually reading rather than the last one
 * you clicked — on a page this long, a table of contents that cannot say where
 * you are is just a list of links.
 */
export function ResourceLayout({
  toc,
  children,
}: {
  toc: TocEntry[];
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(toc[0]?.id ?? "");

  useEffect(() => {
    // Position, not intersection. An observer band leaves the rail stuck
    // whenever no heading happens to be inside it — at the foot of the page,
    // or on any section taller than the band — and a contents list that cannot
    // say where you are is just a list of links.
    const onScroll = () => {
      const line = 140;
      let current = toc[0]?.id ?? "";
      for (const entry of toc) {
        const el = document.getElementById(entry.id);
        if (el && el.getBoundingClientRect().top <= line) current = entry.id;
      }
      setActive(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [toc]);

  return (
    <div className="mx-auto w-full max-w-[84rem] px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-14">
        <nav
          aria-label={toc[0]?.label}
          className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
        >
          <ul className="flex flex-col gap-0.5 border-l border-line">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  aria-current={active === entry.id ? "location" : undefined}
                  className={cn(
                    "-ml-px block border-l-2 py-1.5 pl-3 text-[0.8125rem] leading-snug transition-colors duration-200",
                    active === entry.id
                      ? "border-l-evidence font-medium text-foreground-strong"
                      : "border-l-transparent text-muted hover:border-l-line-strong hover:text-foreground",
                  )}
                >
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-14">{children}</div>
      </div>
    </div>
  );
}

/** One numbered section of a reference page. */
export function ResourceSection({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2
          id={id}
          className="scroll-mt-28 font-display text-[clamp(1.375rem,1.2rem+0.8vw,1.75rem)] font-semibold leading-tight tracking-[-0.025em] text-foreground-strong"
        >
          {title}
        </h2>
        {lede && <p className="max-w-[68ch] text-[0.9375rem] leading-[1.7] text-muted">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

/** A monospace block for a path, payload or sample. */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="flex flex-col overflow-hidden rounded-[0.625rem] border border-line bg-ink-panel">
      {label && (
        <figcaption className="border-b border-ink-panel-line px-3.5 py-2 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-ink-panel-muted">
          {label}
        </figcaption>
      )}
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[0.75rem] leading-relaxed text-ink-panel-body">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
