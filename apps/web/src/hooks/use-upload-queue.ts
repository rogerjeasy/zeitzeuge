"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pairByName, stripExtension } from "@/lib/upload/pairing";
import { isZip, readZip, type ZipProblem } from "@/lib/upload/zip";
import { isAcceptedImage, validate } from "@/lib/upload/validation";
import type { QueuedAsset, QueuedFile } from "@/lib/upload/types";
import {
  UploadError,
  chunk,
  postToS3,
  runPool,
  serverContentType,
} from "@/lib/upload/real-upload";
import {
  commitUploadAction,
  createBatchAction,
  listBatchesAction,
  registerFilesAction,
} from "@/lib/investigation/actions";
import type { FileToRegister, RegisteredFile } from "@/lib/api/investigation-types";

/** Files registered per request: ≤ 200 by contract, kept small so tickets don't expire unused. */
const REGISTER_CHUNK = 40;
const CONCURRENCY = 4;

export type RealStart =
  | { ok: true; batchId: string; label: string; reused: boolean }
  | { ok: false; code: string };

let counter = 0;
const nextId = () => `a${++counter}_${Date.now().toString(36)}`;

const toQueuedFile = (file: File): QueuedFile => ({
  id: nextId(),
  file,
  preview: URL.createObjectURL(file),
});

/**
 * The upload queue.
 *
 * Owns intake (drop, picker, paste, zip), pairing, per-asset metadata and the
 * run itself. The upload is simulated for now but goes through the same shape
 * the presigned S3 PUT will — one request per side, progress per asset.
 */
export function useUploadQueue(defaultCollection: string) {
  const [assets, setAssets] = useState<QueuedAsset[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [zipProblems, setZipProblems] = useState<{ name: string; reason: ZipProblem }[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  // Object URLs are a leak if they outlive their asset.
  const urls = useRef(new Set<string>());
  useEffect(() => () => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const track = (file: QueuedFile) => {
    urls.current.add(file.preview);
    return file;
  };

  const release = (file?: QueuedFile) => {
    if (!file) return;
    URL.revokeObjectURL(file.preview);
    urls.current.delete(file.preview);
  };

  const add = useCallback(
    async (incoming: File[]) => {
      setBusy(true);
      setRejected([]);
      setZipProblems([]);

      const images: File[] = [];
      const badNames: string[] = [];
      const problems: { name: string; reason: ZipProblem }[] = [];

      for (const file of incoming) {
        if (isZip(file)) {
          const result = await readZip(file);
          images.push(...result.files);
          problems.push(...result.problems);
          continue;
        }
        if (isAcceptedImage(file)) images.push(file);
        else badNames.push(file.name);
      }

      const queued = images.map((file) => track(toQueuedFile(file)));
      const groups = pairByName(queued, (item) => item.file.name);

      setAssets((previous) => [
        ...previous,
        ...groups.map<QueuedAsset>((group) => ({
          id: nextId(),
          recto: group.recto,
          verso: group.verso,
          pairedBy: group.recto && group.verso ? group.ruleId : undefined,
          pairMarkers: group.markers,
          // The archive names its own scans; the filename is the best first guess.
          signature: stripExtension(group.base),
          collection: defaultCollection,
          status: "queued",
          progress: 0,
        })),
      ]);

      setRejected(badNames);
      setZipProblems(problems);
      setBusy(false);
    },
    [defaultCollection],
  );

  const update = useCallback((id: string, patch: Partial<QueuedAsset>) => {
    setAssets((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const remove = useCallback((id: string) => {
    setAssets((list) => {
      const target = list.find((a) => a.id === id);
      release(target?.recto);
      release(target?.verso);
      return list.filter((a) => a.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setAssets((list) => {
      list.forEach((a) => {
        release(a.recto);
        release(a.verso);
      });
      return [];
    });
    setRejected([]);
    setZipProblems([]);
  }, []);

  /** Detach a verso back into its own asset. */
  const unpair = useCallback((assetId: string) => {
    setAssets((list) => {
      const target = list.find((a) => a.id === assetId);
      if (!target?.verso) return list;
      const detached: QueuedAsset = {
        id: nextId(),
        recto: target.verso,
        signature: stripExtension(target.verso.file.name),
        collection: target.collection,
        status: "queued",
        progress: 0,
      };
      return list.flatMap((a) =>
        a.id === assetId
          ? [{ ...a, verso: undefined, pairedBy: undefined, pairMarkers: undefined }, detached]
          : [a],
      );
    });
  }, []);

  /** Move a whole asset's recto into another asset's empty verso slot. */
  const pairInto = useCallback((sourceId: string, targetId: string) => {
    setAssets((list) => {
      const source = list.find((a) => a.id === sourceId);
      const target = list.find((a) => a.id === targetId);
      if (!source?.recto || !target || target.verso || sourceId === targetId) return list;

      return list
        .filter((a) => a.id !== sourceId)
        .map((a) =>
          a.id === targetId
            ? { ...a, verso: source.recto, pairedBy: "manual", pairMarkers: undefined }
            : a,
        );
    });
  }, []);

  const applyCollectionToAll = useCallback((collection: string) => {
    setAssets((list) => list.map((a) => ({ ...a, collection })));
  }, []);

  const issues = useMemo(() => validate(assets), [assets]);

  const stats = useMemo(() => {
    const files = assets.reduce((n, a) => n + (a.recto ? 1 : 0) + (a.verso ? 1 : 0), 0);
    const paired = assets.filter((a) => a.recto && a.verso).length;
    const bytes = assets.reduce(
      (n, a) => n + (a.recto?.file.size ?? 0) + (a.verso?.file.size ?? 0),
      0,
    );
    return { files, assets: assets.length, paired, withoutVerso: assets.length - paired, bytes };
  }, [assets]);

  /**
   * Simulated presigned upload, then the run. One asset at a time, and the
   * chosen mode really does change how long the investigation takes — deep
   * review runs Opus, falsification and the red team (§5.4 M1).
   */
  const start = useCallback(async (mode: string) => {
    const analysisMs = mode === "fast" ? 220 : mode === "deep" ? 900 : 440;
    setRunning(true);
    for (const asset of assets) {
      update(asset.id, { status: "uploading", progress: 0 });
      for (let p = 0; p <= 100; p += 10) {
        update(asset.id, { progress: p });
        await new Promise((r) => setTimeout(r, 40));
      }
      update(asset.id, { status: "uploaded", progress: 100 });
      await new Promise((r) => setTimeout(r, 120));
      update(asset.id, { status: "analysing" });
      await new Promise((r) => setTimeout(r, analysisMs));
      update(asset.id, { status: "done" });
    }
    setRunning(false);
  }, [assets, update]);

  /**
   * The real path (design note §2.4): find or open the batch, register the
   * files in chunks, POST each one to S3 with its presigned fields (four at a
   * time, with real progress), then commit it — which queues its
   * investigation. Re-running after a failure is safe: the API answers a
   * filename it already holds with no ticket, and those are skipped.
   *
   * Only the front of each photograph is sent; the API has no verso
   * endpoint yet, and the screen says so.
   */
  const startReal = useCallback(
    async (opts: { label: string; priority: number | null; mode: string }): Promise<RealStart> => {
      setRunning(true);
      try {
        const existing = await listBatchesAction();
        if (!existing.ok) return { ok: false, code: existing.code };
        let batch = existing.data.find((b) => b.label === opts.label);
        const reused = Boolean(batch);
        if (!batch) {
          const created = await createBatchAction(opts);
          if (!created.ok) return { ok: false, code: created.code };
          batch = created.data;
        }
        const batchId = batch.id;

        const targets = assets.filter(
          (a) => a.recto && a.status !== "done" && a.status !== "analysing",
        );
        const typed = targets.flatMap((a) => {
          const type = serverContentType(a.recto!.file);
          if (!type) {
            update(a.id, { status: "error", error: "unsupported_type" });
            return [];
          }
          update(a.id, { status: "queued", progress: 0, error: undefined });
          return [{ asset: a, file: a.recto!.file, type }];
        });

        const register = (items: typeof typed) =>
          registerFilesAction(
            batchId,
            items.map<FileToRegister>(({ file, type }) => ({
              filename: file.name,
              content_type: type,
              content_length: file.size,
              priority: opts.priority,
            })),
          );

        for (const group of chunk(typed, REGISTER_CHUNK)) {
          const registered = await register(group);
          if (!registered.ok) {
            group.forEach(({ asset }) => update(asset.id, { status: "error", error: registered.code }));
            if (registered.code === "forbidden" || registered.code === "unauthenticated") {
              return { ok: false, code: registered.code };
            }
            continue;
          }
          const byName = new Map<string, RegisteredFile>(
            registered.data.files.map((f) => [f.filename, f]),
          );

          await runPool(group, CONCURRENCY, async ({ asset, file, type }) => {
            const entry = byName.get(file.name);
            if (!entry) {
              update(asset.id, { status: "error", error: "not_registered" });
              return;
            }
            update(asset.id, { remoteId: entry.asset_id });
            if (!entry.upload) {
              // Already in this batch and committed: nothing to send.
              update(asset.id, { status: "analysing", progress: 100 });
              return;
            }
            update(asset.id, { status: "uploading", progress: 0 });
            const progress = (p: number) => update(asset.id, { progress: p });
            try {
              await postToS3(entry.upload, file, type, progress);
            } catch (error) {
              // An expired ticket is a 403 from S3: ask for a fresh one, once.
              if (!(error instanceof UploadError) || error.status !== 403) throw failed(error);
              const again = await register([{ asset, file, type }]);
              const ticket = again.ok ? again.data.files[0]?.upload : null;
              if (!ticket) throw failed(error);
              await postToS3(ticket, file, type, progress).catch((e) => {
                throw failed(e);
              });
            }
            update(asset.id, { status: "uploaded", progress: 100 });
            const committed = await commitUploadAction(entry.asset_id);
            if (committed.ok) update(asset.id, { status: "analysing" });
            else update(asset.id, { status: "error", error: committed.code });

            function failed(e: unknown) {
              const code = e instanceof UploadError ? e.code : "s3_error";
              update(asset.id, { status: "error", error: code });
              return e;
            }
          });
        }
        return { ok: true, batchId, label: opts.label, reused };
      } finally {
        setRunning(false);
      }
    },
    [assets, update],
  );

  return {
    assets, add, update, remove, clear, unpair, pairInto, applyCollectionToAll,
    issues, stats, busy, running, rejected, zipProblems, start, startReal,
  };
}
