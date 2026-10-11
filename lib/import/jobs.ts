import "server-only";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LIMITS, limitSizeLabel } from "../settings";
import { isId, newId } from "../storage";
import { getVideo, importFile, type VideoMeta } from "../videos";
import { writeJson, storagePath } from "../storage";
import { fakeClip, fakeItem, isImportFake } from "./fake";
import { allowedUrl, ImportError, pexelsFile, pixabayFile } from "./stock";
import {
  SOURCE_NAME,
  type Credit,
  type ImportItem,
  type ImportSource,
} from "./types";
import { youTubeItem, ytDownload } from "./youtube";

/**
 * Importing from a library: a small job (download → My Assets) the dialog polls.
 * The file is always looked up again by id on the server (a URL from the
 * browser is never fetched), downloaded only from the library's own hosts,
 * with the upload size limit.
 */

export type ImportJob = {
  id: string;
  source: ImportSource;
  itemId: string;
  title: string;
  state: "working" | "ready" | "failed";
  percent: number;
  mediaId?: string;
  error?: string;
};

const g = globalThis as unknown as { __VDOImports?: Map<string, ImportJob> };
const jobs = (g.__VDOImports ??= new Map());

/** Rights for a YouTube import: "mine" (the user says it's their own video) or "cc" (Creative Commons, checked). */
export type Rights = "mine" | "cc";

/** Pure: may this YouTube video be imported with these rights? (tested) */
export function youTubeAllowed(
  item: Pick<ImportItem, "license" | "duration">,
  rights: Rights | null,
): string | null {
  if (!rights)
    return "Confirm that it's your own video, or pick a Creative Commons one.";
  if (rights === "cc" && item.license !== "cc")
    return "This video isn't Creative Commons. Import only your own videos or Creative Commons ones.";
  if (item.duration > LIMITS.maxDurationSec)
    return `This video is ${Math.round(item.duration / 60)} minutes long. The editor takes videos up to ${LIMITS.maxDurationSec / 60} minutes.`;
  return null;
}

async function download(
  url: string,
  out: string,
  onProgress: (pct: number) => void,
) {
  const u = allowedUrl(url);
  if (!u)
    throw new ImportError(
      "The library gave a download link this editor doesn't trust.",
    );
  let res: Response;
  try {
    res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(10 * 60_000),
    });
  } catch {
    throw new ImportError(
      "The download stopped. Check the internet connection and try again.",
      502,
      "offline",
    );
  }
  if (!res.ok || !res.body)
    throw new ImportError(`The download failed (error ${res.status}).`);
  if (res.url && !allowedUrl(res.url))
    throw new ImportError(
      "The download was sent somewhere this editor doesn't trust.",
    );
  const total = Number(res.headers.get("content-length") ?? 0);
  if (total > LIMITS.maxUploadBytes)
    throw new ImportError(
      `This file is bigger than ${limitSizeLabel()}.`,
      413,
      "too_big",
    );
  let got = 0;
  const count = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      got += chunk.length;
      if (got > LIMITS.maxUploadBytes)
        return cb(
          new ImportError(
            `This file is bigger than ${limitSizeLabel()}.`,
            413,
            "too_big",
          ),
        );
      if (total) onProgress(Math.min(99, Math.round((got / total) * 100)));
      cb(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    count,
    createWriteStream(out),
  );
}

async function run(job: ImportJob, rights: Rights | null) {
  const dir = await mkdtemp(join(tmpdir(), "VDO-import-"));
  const set = (p: Partial<ImportJob>) =>
    jobs.set(job.id, Object.assign(job, p));
  try {
    const out = join(dir, "import.mp4");
    let item: ImportItem;
    if (job.source === "youtube") {
      item = isImportFake()
        ? fakeItem("youtube", job.itemId)
        : await youTubeItem(job.itemId);
      const why = youTubeAllowed(item, rights);
      if (why) throw new ImportError(why, 403, "not_allowed");
      if (isImportFake()) await fakeClip(out, Math.min(item.duration, 6));
      else await ytDownload(job.itemId, out, (percent) => set({ percent }));
    } else {
      if (isImportFake()) {
        item = fakeItem(job.source, job.itemId);
        await fakeClip(out, Math.min(item.duration, 6));
      } else {
        const r =
          job.source === "pexels"
            ? await pexelsFile(job.itemId)
            : await pixabayFile(job.itemId);
        item = r.item;
        if (item.duration > LIMITS.maxDurationSec)
          throw new ImportError(
            `This clip is longer than ${LIMITS.maxDurationSec / 60} minutes.`,
            400,
            "too_long",
          );
        await download(r.file, out, (percent) => set({ percent }));
      }
    }
    set({ title: item.title });
    const name = `${SOURCE_NAME[job.source]} - ${item.title}`
      .replace(/[^\p{L}\p{N} .,'()-]/gu, "")
      .slice(0, 100);
    const meta = await importFile(out, `${name}.mp4`);
    const credit: Credit = {
      source: job.source,
      author: item.author,
      url: item.pageUrl,
      license: item.license,
    };
    await writeJson(storagePath("videos", meta.id, "meta.json"), {
      ...meta,
      credit,
    } satisfies VideoMeta & { credit: Credit });
    set({ state: "ready", percent: 100, mediaId: meta.id });
  } catch (err) {
    set({
      state: "failed",
      error:
        err instanceof ImportError
          ? err.message
          : "The import didn't work. Try again.",
    });
    if (!(err instanceof ImportError))
      console.error("import failed", err instanceof Error ? err.message : err);
  } finally {
    await rm(dir, { recursive: true, force: true });
    // finished jobs are forgotten after an hour
    setTimeout(() => jobs.delete(job.id), 60 * 60_000).unref?.();
  }
}

export function startImport(
  source: ImportSource,
  itemId: string,
  rights: Rights | null,
): ImportJob {
  const job: ImportJob = {
    id: newId(),
    source,
    itemId,
    title: "",
    state: "working",
    percent: 0,
  };
  jobs.set(job.id, job);
  void run(job, rights);
  return job;
}

export async function getImport(
  id: string,
): Promise<(ImportJob & { media?: VideoMeta | null }) | null> {
  if (!isId(id)) return null;
  const j = jobs.get(id);
  if (!j) return null;
  return { ...j, media: j.mediaId ? await getVideo(j.mediaId) : undefined };
}
