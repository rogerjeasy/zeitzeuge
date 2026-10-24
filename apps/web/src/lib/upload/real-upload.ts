import type { ImageType, UploadTicketOut } from "@/lib/api/investigation-types";

/**
 * The browser half of a real upload: the presigned S3 POST and a small
 * concurrency pool. Pure browser code — no token ever passes through here;
 * the ticket's signed form fields are the only credential, and they are
 * pinned by the API to one key, one size and one content type.
 */

const BY_EXTENSION: Record<string, ImageType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

const SERVER_TYPES: ReadonlySet<string> = new Set(Object.values(BY_EXTENSION));

/** The content type the API will accept for this file, or null (e.g. AVIF). */
export function serverContentType(file: File): ImageType | null {
  if (SERVER_TYPES.has(file.type)) return file.type as ImageType;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/**
 * POST one file to S3 with its presigned fields: every field first, `file`
 * last (S3 ignores fields after the file). XHR rather than fetch, because only
 * XHR reports upload progress.
 */
export function postToS3(
  ticket: UploadTicketOut,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
    // A browser-sniffed type that differs from the signed one would fail the
    // policy; the blob is re-typed to exactly what was announced.
    const body = file.type === contentType ? file : new Blob([file], { type: contentType });
    form.append("file", body, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.upload_url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText ?? "")?.[1] ?? `s3_${xhr.status}`;
        reject(new UploadError(xhr.status, code));
      }
    };
    xhr.onerror = () => reject(new UploadError(0, "s3_network"));
    xhr.onabort = () => reject(new UploadError(0, "aborted"));
    xhr.send(form);
  });
}

/** Run `worker` over `items`, at most `limit` at a time. Never rejects. */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch {
        // the worker records its own failure on the item
      }
    }
  });
  await Promise.all(lanes);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
