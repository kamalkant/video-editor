import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureDir,
  isId,
  newId,
  readJson,
  storagePath,
  writeJson,
} from "../storage";
import { getVideo, importAiFile, kindOf, sourcePath } from "../videos";
import type { VeoResolution, VeoSeconds, VeoTier } from "./pricing";
import { fakeVideo } from "./fake";
import {
  downloadVideo,
  GeminiError,
  isFake,
  pickModel,
  pollVideo,
  startVideo,
} from "./gemini";
import { nameFrom } from "./image";

/**
 * Generate Video (Veo 3.1): a job that takes 11 s – 6 min. One at a time.
 * The job is saved to storage/ai-jobs, so an editor restart picks it up
 * again (Google keeps the finished video for 2 days). It can't be stopped
 * once started: Google charges for it anyway.
 */

export type VeoOptions = {
  prompt: string;
  aspect: "16:9" | "9:16";
  seconds: VeoSeconds;
  tier: VeoTier;
  resolution: VeoResolution;
  startImageId?: string | null;
};
export type VeoJob = VeoOptions & {
  id: string;
  state: "working" | "ready" | "failed";
  startedAt: number;
  finishedAt?: number;
  operation?: string;
  mediaId?: string;
  error?: string;
};

const POLL_MS = 10_000;
const GIVE_UP_MS = 15 * 60_000;

const g = globalThis as unknown as {
  __VDOVeo?: Map<string, VeoJob>;
  __VDOVeoRunning?: Set<string>;
};
const jobs = (g.__VDOVeo ??= new Map());
const running = (g.__VDOVeoRunning ??= new Set());
const file = (id: string) => storagePath("ai-jobs", `${id}.json`);

async function save(j: VeoJob) {
  jobs.set(j.id, j);
  await ensureDir(storagePath("ai-jobs"));
  await writeJson(file(j.id), j);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(job: VeoJob) {
  if (running.has(job.id)) return;
  running.add(job.id);
  const dir = await mkdtemp(join(tmpdir(), "VDO-veo-"));
  try {
    const out = join(dir, "veo.mp4");
    let model = "fake";
    if (isFake()) {
      await wait(2500);
      await fakeVideo(out, job.seconds, job.aspect === "9:16");
    } else {
      model = await pickModel(
        job.tier === "lite"
          ? "video-lite"
          : job.tier === "fast"
            ? "video-fast"
            : "video",
      );
      if (!job.operation) {
        const instance: Record<string, unknown> = { prompt: job.prompt };
        if (job.startImageId) {
          const src = await getVideo(job.startImageId);
          if (!src || kindOf(src) !== "image")
            throw new GeminiError(
              "The start picture is no longer in My Assets.",
              400,
              "bad_source",
            );
          const mime = /\.jpe?g$/i.test(src.fileName)
            ? "image/jpeg"
            : "image/png";
          instance.image = {
            inlineData: {
              mimeType: mime,
              data: (await readFile(sourcePath(src.id))).toString("base64"),
            },
          };
        }
        const parameters = {
          aspectRatio: job.aspect,
          durationSeconds: job.seconds,
          resolution: job.resolution,
          personGeneration: job.startImageId ? "allow_adult" : "allow_all",
        };
        job.operation = await startVideo(model, instance, parameters);
        await save(job);
      }
      for (;;) {
        if (Date.now() - job.startedAt > GIVE_UP_MS)
          throw new GeminiError(
            "Veo is taking much longer than usual. Try again later.",
            504,
            "gemini_timeout",
          );
        await wait(POLL_MS);
        let p: Awaited<ReturnType<typeof pollVideo>>;
        try {
          p = await pollVideo(job.operation);
        } catch (err) {
          // the video is being made (and paid for): a network hiccup only means "ask again"
          if (
            err instanceof GeminiError &&
            ["gemini_offline", "gemini_timeout", "gemini_busy"].includes(
              err.code,
            )
          )
            continue;
          throw err;
        }
        if (!p.done) continue;
        if (p.error) throw new GeminiError(p.error);
        await writeFile(
          out,
          p.data ? Buffer.from(p.data, "base64") : await downloadVideo(p.uri!),
        );
        break;
      }
    }
    const meta = await importAiFile(out, nameFrom(job.prompt, "mp4"), {
      by: "gemini",
      what: "video",
      prompt: job.prompt,
      model,
    });
    await save({
      ...job,
      state: "ready",
      mediaId: meta.id,
      finishedAt: Date.now(),
    });
  } catch (err) {
    await save({
      ...job,
      state: "failed",
      error:
        err instanceof GeminiError
          ? err.message
          : "Veo didn't finish. Try again.",
      finishedAt: Date.now(),
    });
  } finally {
    running.delete(job.id);
    await rm(dir, { recursive: true, force: true });
  }
}

/** Start a video. Refused while another one is being made. */
export async function startVeo(o: VeoOptions): Promise<VeoJob> {
  const prompt = o.prompt.trim().slice(0, 2000);
  if (!prompt) throw new GeminiError("Describe the video first.", 400, "empty");
  if (o.resolution === "1080p" && o.seconds !== 8)
    throw new GeminiError(
      "1080p videos are 8 seconds long.",
      400,
      "bad_length",
    );
  if ([...jobs.values()].some((j) => j.state === "working"))
    throw new GeminiError(
      "A video is already being made. Wait for it to finish.",
      409,
      "busy",
    );
  const job: VeoJob = {
    ...o,
    prompt,
    id: newId(),
    state: "working",
    startedAt: Date.now(),
  };
  await save(job);
  void run(job);
  return job;
}

/** A job's state (after a restart, an unfinished job carries on). */
export async function getVeo(id: string): Promise<VeoJob | null> {
  if (!isId(id)) return null;
  const j = jobs.get(id) ?? (await readJson<VeoJob>(file(id)));
  if (!j) return null;
  if (j.state === "working" && !running.has(j.id)) {
    jobs.set(j.id, j);
    if (j.operation || isFake()) void run(j);
    else
      await save({
        ...j,
        state: "failed",
        error: "The editor was restarted before Veo started. Try again.",
      });
  }
  return jobs.get(id) ?? j;
}
