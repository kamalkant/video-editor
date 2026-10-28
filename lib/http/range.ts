import { open, stat, type FileHandle } from "node:fs/promises";

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

/** Bytes read per pull. */
const CHUNK = 256 * 1024;

/**
 * Bytes [start, end] of a file, read only when the reader asks for more (pull). A <video> cancels its range
 * requests all the time: then the file is closed and nothing more is pushed (Readable.toWeb went on pushing
 * into the cancelled stream: "Invalid state: Controller is already closed", an uncaught exception).
 */
export function fileStream(path: string, start: number, end: number): ReadableStream<Uint8Array> {
  let fh: FileHandle | null = null;
  let pos = start;
  let stopped = false;
  const release = async () => {
    const f = fh;
    fh = null;
    await f?.close().catch(() => undefined);
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        fh ??= await open(path, "r");
        const len = Math.min(CHUNK, end - pos + 1);
        const buf = new Uint8Array(Math.max(0, len));
        const { bytesRead } = len > 0 ? await fh.read(buf, 0, len, pos) : { bytesRead: 0 };
        if (stopped) return void (await release());
        if (bytesRead === 0) {
          await release();
          controller.close();
          return;
        }
        pos += bytesRead;
        controller.enqueue(buf.subarray(0, bytesRead));
      } catch (e) {
        await release();
        if (!stopped) controller.error(e);
      }
    },
    async cancel() {
      stopped = true;
      await release();
    },
  });
}

/**
 * An attachment named `name` in any language (a Hindi project name too): `filename*` (UTF-8) for browsers,
 * plain letters in `filename` for the rest. Quotes and line breaks are left out.
 */
export function contentDisposition(name: string): string {
  const clean = name.replace(/["\r\n\\]/g, "");
  const ascii = clean.normalize("NFKD").replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii || "download"}"; filename*=UTF-8''${utf8}`;
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
  if (opts.downloadName) headers["Content-Disposition"] = contentDisposition(opts.downloadName);
  const range = parseRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size === 0 ? null : fileStream(path, start, end);
  headers["Content-Length"] = String(size === 0 ? 0 : end - start + 1);
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}
