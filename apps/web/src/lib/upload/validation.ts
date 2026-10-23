import type { Issue, QueuedAsset } from "./types";
import { ACCEPTED_EXTENSIONS, ACCEPTED_TYPES, MAX_FILE_BYTES } from "./types";

export function isAcceptedImage(file: File) {
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.test(file.name);
}

/**
 * Everything that would make a run wrong, found before anything is sent.
 *
 * A duplicate Signatur matters more here than it looks: the Signatur is the
 * archive's own identifier, and two assets claiming one would collide in the
 * catalogue rather than in this queue.
 */
export function validate(assets: QueuedAsset[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, string[]>();

  for (const asset of assets) {
    const signature = asset.signature.trim();

    if (!signature) {
      issues.push({ code: "missing-signature", assetId: asset.id, blocking: true });
    } else {
      const key = signature.toLowerCase();
      seen.set(key, [...(seen.get(key) ?? []), asset.id]);
    }

    if (!asset.recto) {
      issues.push({ code: "missing-recto", assetId: asset.id, blocking: true });
    }

    for (const side of [asset.recto, asset.verso]) {
      if (!side) continue;
      if (side.file.size > MAX_FILE_BYTES) {
        issues.push({ code: "too-large", assetId: asset.id, detail: side.file.name, blocking: true });
      }
      if (!isAcceptedImage(side.file)) {
        issues.push({ code: "wrong-type", assetId: asset.id, detail: side.file.name, blocking: true });
      }
    }
  }

  for (const [signature, ids] of seen) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      issues.push({ code: "duplicate-signature", assetId: id, detail: signature, blocking: true });
    }
  }

  return issues;
}

export const blockingIssues = (issues: Issue[]) => issues.filter((i) => i.blocking);

export function issuesFor(issues: Issue[], assetId: string) {
  return issues.filter((i) => i.assetId === assetId);
}
