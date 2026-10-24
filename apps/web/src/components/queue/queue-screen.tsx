"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ListChecks, RotateCcw, Undo2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  QUEUE_ITEMS, SORT_KEYS, minConfidence, sortQueue, type SortKey,
} from "@/lib/data/queue";
import { CATALOGUING_DEFAULTS } from "@/lib/data/settings";
import { QueueRow, type FieldVerdict } from "./queue-row";
import { BulkAccept } from "./bulk-accept";
import { ExampleBanner } from "@/components/investigation/example-banner";

type Verdicts = Record<string, Record<string, FieldVerdict>>;

export function QueueScreen() {
  const t = useTranslations("queue");
  const tEx = useTranslations("investigation.example");

  const [remaining, setRemaining] = useState(QUEUE_ITEMS);
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [sort, setSort] = useState<SortKey>("gain");
  const [threshold, setThreshold] = useState(CATALOGUING_DEFAULTS.autoAcceptThreshold);
  // One level of undo: the last accept, whatever its size.
  const [lastAccepted, setLastAccepted] = useState<typeof QUEUE_ITEMS | null>(null);

  const ordered = useMemo(() => sortQueue(remaining, sort), [remaining, sort]);
  const swept = useMemo(
    () => new Set(remaining.filter((i) => minConfidence(i) >= threshold).map((i) => i.id)),
    [remaining, threshold],
  );

  const minutesLeft = Math.max(
    1,
    Math.round(remaining.reduce((n, i) => n + i.estimatedSeconds, 0) / 60),
  );

  function accept(items: typeof QUEUE_ITEMS) {
    const ids = new Set(items.map((i) => i.id));
    setRemaining((list) => list.filter((i) => !ids.has(i.id)));
    setLastAccepted(items);
  }

  function undo() {
    if (!lastAccepted) return;
    // Restore in the original queue order rather than at the end.
    const ids = new Set(lastAccepted.map((i) => i.id));
    setRemaining((list) => QUEUE_ITEMS.filter((i) => ids.has(i.id) || list.some((x) => x.id === i.id)));
    setLastAccepted(null);
  }

  function reset() {
    setRemaining(QUEUE_ITEMS);
    setVerdicts({});
    setLastAccepted(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[clamp(1.5rem,1.25rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.03em] text-foreground-strong">
            {t("title")}
          </h1>
          <p className="max-w-[74ch] text-[0.875rem] text-muted">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            label={t("sortLabel")}
            hideLabel
            className="w-[16.5rem]"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            options={SORT_KEYS.map((key) => ({
              value: key,
              label: `${t("sortLabel")}: ${t(`sort.${key}`)}`,
            }))}
          />
        </div>
      </header>

      <ExampleBanner message={tEx("queue")} href="/batches" cta={tEx("toBatches")} />

      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem]">
        <ListChecks aria-hidden className="size-4 shrink-0 text-muted-2" strokeWidth={1.9} />
        <span className="font-medium text-foreground-strong">
          {t("waiting", { count: remaining.length })}
        </span>
        {remaining.length > 0 && (
          <>
            <span aria-hidden className="text-line-strong">·</span>
            <span className="text-muted">{t("estimate", { minutes: minutesLeft })}</span>
          </>
        )}
      </p>

      {lastAccepted && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-corroborated/35 bg-corroborated-soft px-3.5 py-2.5"
        >
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-corroborated" strokeWidth={2} />
          <p className="text-[0.8125rem] text-corroborated">
            {t("acceptedToast", { count: lastAccepted.length })}
          </p>
          <button
            type="button"
            onClick={undo}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-corroborated/40 bg-surface px-3 text-[0.75rem] font-medium text-foreground transition-colors hover:border-corroborated"
          >
            <Undo2 aria-hidden className="size-3.5" strokeWidth={2} />
            {t("undo")}
          </button>
        </div>
      )}

      {remaining.length > 0 && (
        <BulkAccept
          threshold={threshold}
          onThreshold={setThreshold}
          matching={swept.size}
          remaining={remaining.length - swept.size}
          onAccept={() => accept(remaining.filter((i) => swept.has(i.id)))}
          disabled={false}
        />
      )}

      {remaining.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {ordered.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              swept={swept.has(item.id)}
              verdicts={verdicts[item.id] ?? {}}
              onVerdict={(fieldKey, verdict) =>
                setVerdicts((all) => ({
                  ...all,
                  [item.id]: { ...(all[item.id] ?? {}), [fieldKey]: verdict },
                }))
              }
              onAccept={() => accept([item])}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface-2/40 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-corroborated-soft text-corroborated">
            <CheckCircle2 aria-hidden className="size-6" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-foreground-strong">
              {t("emptyTitle")}
            </h2>
            <p className="max-w-[48ch] text-[0.875rem] leading-relaxed text-muted">
              {t("emptyBody")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button as={Link} href="/dashboard" variant="secondary">
              {t("emptyCta")}
            </Button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[0.8125rem] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
              {t("demoReset")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
