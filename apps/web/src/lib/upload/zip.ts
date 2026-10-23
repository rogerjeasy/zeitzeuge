/**
 * A minimal ZIP reader, so a dropped archive really is expanded rather than
 * mimed. Reads the central directory, then inflates entries with
 * `DecompressionStream("deflate-raw")` — available in every browser this app
 * targets, and the reason no dependency is needed.
 *
 * Deliberately narrow: stored (0) and deflate (8) only, no ZIP64, no
 * encryption. Anything it cannot read is reported rather than silently skipped.
 */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export type ZipProblem =
  | "not-a-zip"
  | "zip64-unsupported"
  | "encrypted"
  | "unsupported-compression"
  | "empty";

export interface ZipReadResult {
  files: File[];
  /** Entries that could not be read, by reason — surfaced, never hidden. */
  problems: { name: string; reason: ZipProblem }[];
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|tiff?|webp|avif)$/i;

function findEocd(view: DataView) {
  // The EOCD sits within the last 64 KiB (22-byte record + comment).
  const max = Math.min(view.byteLength, 0xffff + 22);
  for (let i = 22; i <= max; i++) {
    const offset = view.byteLength - i;
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

async function inflateRaw(data: Uint8Array) {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(file: File): Promise<ZipReadResult> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = findEocd(view);
  if (eocd < 0) return { files: [], problems: [{ name: file.name, reason: "not-a-zip" }] };

  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);

  // 0xffffffff in the EOCD means the real offsets live in a ZIP64 record.
  if (cursor === 0xffffffff || entryCount === 0xffff) {
    return { files: [], problems: [{ name: file.name, reason: "zip64-unsupported" }] };
  }

  const files: File[] = [];
  const problems: ZipReadResult["problems"] = [];

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) break;

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    cursor += 46 + nameLength + extraLength + commentLength;

    // Directories, macOS resource forks and dotfiles are not scans.
    const leaf = name.split("/").pop() ?? name;
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || leaf.startsWith(".")) continue;
    if (!IMAGE_EXTENSIONS.test(leaf)) continue;

    if (flags & 0x1) {
      problems.push({ name: leaf, reason: "encrypted" });
      continue;
    }
    if (method !== 0 && method !== 8) {
      problems.push({ name: leaf, reason: "unsupported-compression" });
      continue;
    }

    // The central directory does not record the local header's extra-field
    // length, so the real data offset has to be read from the header itself.
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;

    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    try {
      const content = method === 8 ? await inflateRaw(raw) : raw;
      files.push(new File([content as BlobPart], leaf, { type: guessType(leaf) }));
    } catch {
      problems.push({ name: leaf, reason: "unsupported-compression" });
    }
  }

  if (files.length === 0 && problems.length === 0) {
    problems.push({ name: file.name, reason: "empty" });
  }
  return { files, problems };
}

function guessType(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  return "image/jpeg";
}

export const isZip = (file: File) =>
  file.type === "application/zip" ||
  file.type === "application/x-zip-compressed" ||
  /\.zip$/i.test(file.name);
