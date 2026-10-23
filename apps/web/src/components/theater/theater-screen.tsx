"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  EVENTS,
  RUN,
  RUN_SECONDS,
  WINDOWS,
  costAt,
  doneCountAt,
  eventsAt,
} from "@/lib/data/theater";
import { AgentDag } from "./agent-dag";
import { EvidenceFeed } from "./evidence-feed";
import { HypothesisPanel } from "./hypothesis-panel";
import { TransportBar, type Speed } from "./transport-bar";

/** How long an agent stays visibly "emitting" after it writes a row. */
const EMIT_WINDOW = 2.5;

/**
 * The Agent Theater (§9.2 #5) — the demo centrepiece.
 *
 * The architecture is this product's whole argument, and an architecture nobody
 * can watch is a claim nobody can check. So the run is replayable rather than
 * animated-once: play it, pause on the second the red team objects, scrub back
 * and watch the leading hypothesis fall from 0.96 to 0.89 again.
 *
 * Playback is driven off one clock in this component; every panel below is a
 * pure function of that number, so scrubbing and playing cannot disagree.
 */
export function TheaterScreen() {
  const t = useTranslations("theater");
  const locale = useLocale();
  const intl = locale === "de" ? "de-CH" : locale;
  const reduced = useReducedMotion();

  // Autoplay on arrival: this screen is meant to be walked into mid-demo.
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // `reduced` is only knowable on the client, so the decision lands here
      // rather than in the effect body: no animation, just the finished run.
      // The scrubber still replays it for anyone who wants to watch.
      if (reduced) {
        setClock(RUN_SECONDS);
        setPlaying(false);
        return;
      }

      const delta = ((now - last) / 1000) * speed;
      last = now;
      setClock((c) => {
        const next = c + delta;
        if (next >= RUN_SECONDS) {
          setPlaying(false);
          return RUN_SECONDS;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, reduced]);

  /** Agents that wrote a row in the last couple of seconds — the ones to flash. */
  const emitting = useMemo(
    () =>
      EVENTS.filter((e) => e.t <= clock && clock - e.t < EMIT_WINDOW).map((e) => e.agent),
    [clock],
  );

  const ledgerRows = eventsAt(clock).filter((e) => e.evidenceId).length;
  const money = new Intl.NumberFormat(intl, {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(costAt(clock));

  const stats = [
    { id: "elapsed", value: `${Math.floor(clock)} s` },
    { id: "agents", value: `${doneCountAt(clock)} / ${WINDOWS.length}` },
    { id: "evidence", value: String(ledgerRows) },
    { id: "cost", value: money },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("title")}
          </h1>
          <p className="max-w-[78ch] text-[0.875rem] leading-relaxed text-muted">
            {t("subtitle")}
          </p>
          <p className="font-mono text-[0.6875rem] text-muted-2">
            {t("runMeta", { run: RUN.id, signature: RUN.signature, mode: RUN.mode })}
          </p>
        </div>

        <Link
          href={`/records/${RUN.recordId}`}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line-strong bg-surface/70 px-4 text-[0.8125rem] font-medium text-foreground transition-colors hover:border-evidence hover:text-evidence"
        >
          {t("openRecord")}
          <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
        </Link>
      </header>

      <TransportBar
        t={clock}
        playing={playing}
        speed={speed}
        onSeek={(next) => {
          setPlaying(false);
          setClock(next);
        }}
        onToggle={() => {
          if (clock >= RUN_SECONDS) setClock(0);
          setPlaying((v) => !v);
        }}
        onRestart={() => {
          setClock(0);
          setPlaying(true);
        }}
        onSpeed={setSpeed}
      />

      {reduced && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5 text-[0.75rem] leading-relaxed text-muted">
          <Info aria-hidden className="mt-px size-3.5 shrink-0 text-muted-2" strokeWidth={2} />
          {t("reducedMotion")}
        </p>
      )}

      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.id} className="flex flex-col gap-1 bg-background px-4 py-3">
            <dt className="text-[0.6875rem] font-medium text-muted">{t(`stats.${stat.id}`)}</dt>
            <dd className="font-mono text-[1.25rem] font-medium leading-none tabular-nums text-foreground-strong">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
        <AgentDag t={clock} activeAgents={emitting} />

        <div className="flex flex-col gap-4">
          <HypothesisPanel t={clock} />
          <EvidenceFeed t={clock} />
        </div>
      </div>
    </div>
  );
}
