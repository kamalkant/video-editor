import { createHash } from "node:crypto";
import { copyFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir, MAX_AGE_MS, storagePath } from "./storage";

/**
 * Pictures the browser draws for the export (text clips and elements: FFmpeg
 * here can't draw). Stored by content hash, so the same title is sent only
 * once. Kept for a day; an export copies the ones it uses into its own folder.
 */

export const MAX_RENDER_BYTES = 25 * 1024 * 1024;
/** (a news ticker's strip of words at 4K can be ~7700 px wide) */
const MAX_SIDE = 8192;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ID = /^[0-9a-f]{32}$/;

export const isRenderId = (id: unknown): id is string => typeof id === "string" && ID.test(id);
export const renderPath = (id: string) => storagePath("renders", `${id}.png`);

/** Width and height of a PNG, or null if it isn't one. */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE) || buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export class RenderError extends Error {}

/** Save a PNG; returns its id. */
export async function saveRender(buf: Buffer): Promise<{ id: string; width: number; height: number }> {
  const size = pngSize(buf);
  if (!size) throw new RenderError("That isn't a PNG picture.");
  if (!size.width || !size.height || size.width > MAX_SIDE || size.height > MAX_SIDE) throw new RenderError("The picture is too big.");
  const id = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  await ensureDir(storagePath("renders"));
  const path = renderPath(id);
  const now = new Date();
  try {
    await utimes(path, now, now); // already here: keep it another day
  } catch {
    await writeFile(path, buf);
  }
  return { id, ...size };
}

export async function renderExists(id: string): Promise<boolean> {
  try {
    return (await stat(renderPath(id))).isFile();
  } catch {
    return false;
  }
}

/** Copy a render into an export's folder (so the export keeps working after the render expires). */
export async function copyRender(id: string, to: string) {
  await copyFile(renderPath(id), to);
}

/** Delete renders older than a day. */
export async function cleanupRenders(now = Date.now()) {
  let entries: string[] = [];
  try {
    entries = await readdir(storagePath("renders"));
  } catch {
    return;
  }
  for (const e of entries) {
    if (!/^[0-9a-f]{32}\.png$/.test(e)) continue;
    try {
      const p = join(storagePath("renders"), e);
      if (now - (await stat(p)).mtimeMs > MAX_AGE_MS) await rm(p, { force: true });
    } catch {
      /* already gone */
    }
  }
}
