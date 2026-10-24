"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchOut } from "@/lib/api/investigation-types";
import { getBatchAction } from "@/lib/investigation/actions";

export type LiveMode = "connecting" | "live" | "polling" | "off";

const DEBOUNCE_MS = 800;
const POLL_MS = 15_000;

/**
 * One batch, kept current (design note D8).
 *
 * `EventSource` opens the same-origin proxy (`/api/batches/{id}/stream`),
 * which carries the session cookie; the browser never sees a token. Every
 * `run` event triggers a re-fetch of the whole batch, debounced so a burst of
 * stage events costs one request. If the stream cannot be opened, drops, or
 * the API says `live: false` (no notifier), the hook falls back to polling
 * every 15 s — and says which of the two it is doing, so the screen never
 * claims to be live when it is not.
 */
export function useLiveBatch(batchId: string | null, initial: BatchOut | null = null) {
  const [batch, setBatch] = useState<BatchOut | null>(initial);
  const [mode, setMode] = useState<LiveMode>(batchId ? "connecting" : "off");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (!batchId) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    setRefreshing(true);
    try {
      do {
        again.current = false;
        const result = await getBatchAction(batchId);
        if (result.ok) {
          setBatch(result.data);
          setError(null);
          setUpdatedAt(Date.now());
        } else {
          setError(result.code);
        }
      } while (again.current);
    } finally {
      inflight.current = false;
      setRefreshing(false);
    }
  }, [batchId]);

  const schedule = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    if (!batchId) return;
    let poll: ReturnType<typeof setInterval> | null = null;
    let source: EventSource | null = null;
    let closed = false;

    const startPolling = () => {
      source?.close();
      source = null;
      if (closed || poll) return;
      setMode("polling");
      poll = setInterval(() => void refresh(), POLL_MS);
    };

    if (!initial) void refresh();

    if (typeof EventSource === "undefined") {
      startPolling();
    } else {
      source = new EventSource(`/api/batches/${encodeURIComponent(batchId)}/stream`);
      source.addEventListener("hello", (event) => {
        let live = false;
        try {
          live = Boolean((JSON.parse((event as MessageEvent).data) as { live?: boolean }).live);
        } catch {
          live = false;
        }
        if (live) setMode("live");
        else startPolling();
      });
      source.addEventListener("run", schedule);
      // A dropped stream, a 401 or a 5xx: stop retrying and poll instead.
      source.onerror = () => startPolling();
    }

    return () => {
      closed = true;
      source?.close();
      if (poll) clearInterval(poll);
      if (debounce.current) clearTimeout(debounce.current);
    };
    // `initial` is the first render's data only; it must not reopen the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, refresh, schedule]);

  return { batch, mode, error, updatedAt, refreshing, refresh };
}
