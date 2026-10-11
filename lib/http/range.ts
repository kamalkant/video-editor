import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export type ByteRange = { start: number; end: number };

/**
 * Parse a single-range `Range` header. Returns null when there is no usable
 * header (serve the whole file) and "unsatisfiable" for a 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Stream a file with Range support (206), as Safari requires for video. */
export async function fileResponse(path: string, mime: string, rangeHeader: string | null, opts: { downloadName?: string; cache?: string } = {}): Promise<Response> {
  const { size } = await stat(path);
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ?? "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (opts.downloadName) headers["Content-Disposition"] = `attachment; filename="${opts.downloadName.replace(/"/g, "")}"`;
  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size === 0 ? null : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream);
  headers["Content-Length"] = String(size === 0 ? 0 : end - start + 1);
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}
