import { join } from "node:path";
import { readFile, stat, writeFile } from "node:fs/promises";
import type { CropBox } from "../edit/geometry";
import { createZipArchive } from "../storage/VDO/container";
import { ensureMask } from "../ai/masks";
import { findCropBox } from "../ffmpeg/cropbox";
import {
  buildEncodeArgs,
  OUTPUT_FILES,
  outputGeometry,
  type OutputKind,
} from "../ffmpeg/encode";
import {
  AbortedError,
  APPLE_MEDIA,
  FfmpegError,
  runFfmpeg,
  SAFE_INPUT,
} from "../ffmpeg/run";
import { activeAiOp, specFromSettings, type EditSpec } from "../edit/spec";
import { segmentsOf, timelineDuration } from "../edit/timeline";
import { maskParamsOf } from "../ops/aiMatte";
import type { Settings } from "../settings";
import {
  ensureDir,
  isId,
  jobDir,
  newId,
  readJson,
  removeDir,
  storagePath,
  writeJson,
} from "../storage";
import { getVideo, sourcePath } from "../videos";
import {
  docDuration,
  elementClipsOf,
  mainTrack,
  mediaIdsOf,
  textClipsOf,
  type TimelineDoc,
  type VideoClip,
} from "../edit/doc";
import type { Range } from "../edit/timeline";
import { detectSilences } from "../ffmpeg/silence";
import {
  alphaCheckTime,
  buildComposeArgs,
  hasSound,
  type ComposeKind,
  type ComposeMedia,
  type ElementSprite,
  type TextSprite,
} from "../render/compose";
import { copyRender } from "../renders";
import { ensureDerived } from "../media/derived";
import { ensureReversed } from "../media/reverse";
import { DUCK_DETECT, speakingClips, speechRanges } from "../audio/ducking";
import { formatBlocked, type ExportFormat } from "../export/presets";

/** The chosen format can't be made for this timeline (a 400 for the API). */
export class FormatError extends Error {}

/** Safari's see-through file is HEVC with alpha, which only Apple's encoder makes (a Mac server). */
const NO_SAFARI_ALPHA =
  "The Safari / iPhone see-through file (HEVC + alpha) needs Apple's encoder, which this server doesn't have. Export \"WebM (transparent)\" instead: it works in Chrome, Edge, Firefox and Android.";
/** Off a Mac, see-through exports skip the Safari file and make the WebM (and poster) only. */
const withoutSafariFile = <K extends string>(kinds: K[]): K[] => (APPLE_MEDIA ? kinds : kinds.filter((k) => k !== "mov"));

export type JobState = "queued" | "running" | "done" | "failed" | "canceled";
export type FileKind = OutputKind | ComposeKind | "zip";
export type JobFile = {
  kind: FileKind;
  name: string;
  size: number;
  mime: string;
};
export type JobStep = {
  kind: FileKind | "crop" | "matte" | "derive";
  label: string;
  state: "pending" | "running" | "done" | "failed";
  percent: number;
};

/** A timeline export's files (the website pack reuses the single-video names). */
const DOC_FILES: Record<
  ComposeKind,
  { name: string; mime: string; label: string }
> = {
  mp4: {
    name: "video.mp4",
    mime: "video/mp4",
    label: "Making the video (MP4)",
  },
  webm: OUTPUT_FILES.webm,
  mov: OUTPUT_FILES.mov,
  poster: OUTPUT_FILES.poster,
  master: OUTPUT_FILES.master,
  hevc: {
    name: "video-hevc.mp4",
    mime: "video/mp4",
    label: "Making the video (MP4, HEVC)",
  },
  av1: {
    name: "video-av1.mp4",
    mime: "video/mp4",
    label: "Making the video (MP4, AV1)",
  },
  vp9: {
    name: "video.webm",
    mime: "video/webm",
    label: "Making the video (WebM)",
  },
  prores: {
    name: "video-prores.mov",
    mime: "video/quicktime",
    label: "Making the video (ProRes 422 HQ)",
  },
  gif: { name: "animation.gif", mime: "image/gif", label: "Making the GIF" },
  png: {
    name: "frame.png",
    mime: "image/png",
    label: "Making the picture (PNG)",
  },
  jpg: {
    name: "frame.jpg",
    mime: "image/jpeg",
    label: "Making the picture (JPG)",
  },
  mp3: {
    name: "sound.mp3",
    mime: "audio/mpeg",
    label: "Making the sound file (MP3)",
  },
  m4a: {
    name: "sound.m4a",
    mime: "audio/mp4",
    label: "Making the sound file (M4A)",
  },
  wav: {
    name: "sound.wav",
    mime: "audio/wav",
    label: "Making the sound file (WAV)",
  },
};

/** The files a timeline export makes for each format. */
const FORMAT_KINDS: Record<ExportFormat, ComposeKind[]> = {
  mp4: ["mp4", "poster"],
  hevc: ["hevc"],
  av1: ["av1"],
  webm: ["vp9"],
  prores: ["prores"],
  "webm-alpha": ["webm"],
  "mov-alpha": ["mov"],
  pack: ["webm", "mov", "poster"],
  prores4444: ["master"],
  gif: ["gif"],
  png: ["png"],
  jpg: ["jpg"],
  mp3: ["mp3"],
  m4a: ["m4a"],
  wav: ["wav"],
};

export type Job = {
  id: string;
  videoId: string;
  createdAt: number;
  updatedAt: number;
  state: JobState;
  spec: EditSpec;
  /** A whole-timeline export (several clips, pictures, sound). Absent for single-video exports. */
  doc?: TimelineDoc;
  /** Text clips of `doc`, drawn by the browser: clip id → PNG file in the job folder. */
  texts?: Record<string, string>;
  /** The drawn backdrop (gradient / studio set) PNG in the job folder. */
  backdrop?: string;
  /** The logo badge the editor drew (lib/player/logo), in the job folder. */
  logo?: string;
  /** Typewriter texts: their PNG holds every step (lib/render/compose TextSprite), by clip id. */
  textSprites?: Record<string, TextSprite>;
  /** Elements, drawn by the browser: their PNGs in the job folder (lib/render/compose ElementSprite), by clip id. */
  elements?: Record<string, ElementSprite>;
  /** The file format asked for (timeline exports; absent = the old default for the canvas). */
  format?: ExportFormat;
  /** Pictures: the timeline time of the frame. */
  at?: number;
  /** The Free plan's mark goes on the picture (lib/billing/entitlements). */
  planMark?: boolean;
  steps: JobStep[];
  files: JobFile[];
  output: { width: number; height: number; fps: number; hasAudio: boolean };
  error: string | null;
  errorDetail: string | null;
};

type QueueState = {
  jobs: Map<string, Job>;
  waiting: string[];
  running: string | null;
  controllers: Map<string, AbortController>;
};

const g = globalThis as unknown as { __VDOQueue?: QueueState };
const Q: QueueState = (g.__VDOQueue ??= {
  jobs: new Map(),
  waiting: [],
  running: null,
  controllers: new Map(),
});

/** What the export queue is doing right now (admin system health). */
export function queueStats(): { running: string | null; waiting: number; known: number } {
  return { running: Q.running, waiting: Q.waiting.length, known: Q.jobs.size };
}

const jobJson = (id: string) => storagePath("jobs", id, "job.json");
const lastWrite = new Map<string, number>();

async function save(job: Job, force = true) {
  job.updatedAt = Date.now();
  const now = Date.now();
  if (!force && now - (lastWrite.get(job.id) ?? 0) < 1000) return;
  lastWrite.set(job.id, now);
  await writeJson(jobJson(job.id), job);
}

export async function createJob(videoId: string, spec: EditSpec): Promise<Job> {
  const video = await getVideo(videoId);
  if (!video) throw new Error("Video not found");
  const geo = outputGeometry(spec.output, video.info);
  const kinds: OutputKind[] = withoutSafariFile([
    "webm",
    "mov",
    "poster",
    ...(spec.output.master ? (["master"] as const) : []),
  ]);
  const job: Job = {
    id: newId(),
    videoId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: "queued",
    spec,
    steps: [
      ...(activeAiOp(spec)
        ? [
            {
              kind: "matte" as const,
              label: "Finding the subject (AI)",
              state: "pending" as const,
              percent: 0,
            },
          ]
        : []),
      ...(spec.output.crop.enabled
        ? [
            {
              kind: "crop" as const,
              label: "Finding the empty area",
              state: "pending" as const,
              percent: 0,
            },
          ]
        : []),
      ...kinds.map((k) => ({
        kind: k,
        label: OUTPUT_FILES[k].label,
        state: "pending" as const,
        percent: 0,
      })),
      {
        kind: "zip",
        label: "Packing the website files",
        state: "pending",
        percent: 0,
      },
    ],
    files: [],
    output: {
      width: geo.outW,
      height: geo.outH,
      fps: geo.outFps,
      hasAudio: spec.output.audio === "keep" && video.info.hasAudio,
    },
    error: null,
    errorDetail: null,
  };
  await ensureDir(jobDir(job.id));
  Q.jobs.set(job.id, job);
  Q.waiting.push(job.id);
  await save(job);
  void pump();
  return job;
}

/**
 * Export a whole timeline: MP4 on the canvas color, or (transparent canvas)
 * the website pack. AI masks for the clips that need them are made first.
 */
export async function createDocJob(
  doc: TimelineDoc,
  renders: Record<string, string> = {},
  backdropRender: string | null = null,
  opts: {
    format?: ExportFormat;
    at?: number;
    logo?: string;
    textSprites?: Record<string, TextSprite>;
    elements?: Record<string, ElementSprite>;
    planMark?: boolean;
  } = {},
): Promise<Job> {
  const ids = mediaIdsOf(doc);
  const metas = await Promise.all(ids.map(getVideo));
  if (metas.some((m) => !m))
    throw new Error("A file on the timeline is no longer here.");
  // (a timeline of only text, elements and blank scenes is fine: they're drawn, no upload needed)
  if (
    !ids.length &&
    !textClipsOf(doc).length &&
    !elementClipsOf(doc).length &&
    !mainTrack(doc).clips.length
  )
    throw new Error("Add something to the timeline first.");
  const media = composeMediaOf(
    metas.filter((m): m is NonNullable<typeof m> => !!m),
  );
  const transparent = doc.canvas.background === "transparent";
  const format = opts.format;
  if (format) {
    const why = formatBlocked(format, {
      transparent: transparent && !doc.canvas.backdrop,
      hasSound: hasSound(doc, media),
      duration: docDuration(doc),
    });
    if (why) throw new FormatError(why);
    if (format === "mov-alpha" && !APPLE_MEDIA) throw new FormatError(NO_SAFARI_ALPHA);
  }
  const kinds: ComposeKind[] = withoutSafariFile(
    format
      ? [
          ...FORMAT_KINDS[format],
          ...(format === "pack" && doc.output.master
            ? (["master"] as const)
            : []),
        ]
      : transparent
        ? [
            "webm",
            "mov",
            "poster",
            ...(doc.output.master ? (["master"] as const) : []),
          ]
        : ["mp4", "poster"],
  );
  const zip = format ? format === "pack" : transparent;
  const needsMask = doc.tracks.some((t) =>
    t.clips.some(
      (c) =>
        c.type === "video" &&
        (c as VideoClip).ops.some((o) => o.enabled && o.type === "aiMatte"),
    ),
  );
  const needsDerive =
    stabilizedClips(doc).length > 0 || reversedClips(doc).length > 0;
  const job: Job = {
    id: newId(),
    videoId: ids[0] ?? "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: "queued",
    spec: { version: 1, ops: [], output: doc.output },
    doc,
    texts: {},
    steps: [
      ...(needsMask
        ? [
            {
              kind: "matte" as const,
              label: "Finding the subjects (AI)",
              state: "pending" as const,
              percent: 0,
            },
          ]
        : []),
      ...(needsDerive
        ? [
            {
              kind: "derive" as const,
              label: reversedClips(doc).length
                ? "Preparing reversed / stabilized clips"
                : "Stabilizing the video",
              state: "pending" as const,
              percent: 0,
            },
          ]
        : []),
      ...kinds.map((k) => ({
        kind: k,
        label: DOC_FILES[k].label,
        state: "pending" as const,
        percent: 0,
      })),
      ...(zip
        ? [
            {
              kind: "zip" as const,
              label: "Packing the website files",
              state: "pending" as const,
              percent: 0,
            },
          ]
        : []),
    ],
    files: [],
    output: {
      width: doc.canvas.width,
      height: doc.canvas.height,
      fps: doc.canvas.fps,
      hasAudio:
        hasSound(doc, media) &&
        !kinds.every((k) => ["gif", "png", "jpg"].includes(k)),
    },
    ...(format ? { format } : {}),
    ...(opts.at != null ? { at: opts.at } : {}),
    ...(opts.planMark ? { planMark: true } : {}),
    error: null,
    errorDetail: null,
  };
  await ensureDir(jobDir(job.id));
  // the text pictures go into the job's folder (the shared ones expire after a day)
  let n = 0;
  for (const [clipId, renderId] of Object.entries(renders)) {
    const name = `text-${++n}.png`;
    await copyRender(renderId, storagePath("jobs", job.id, name));
    job.texts![clipId] = name;
  }
  if (backdropRender) {
    await copyRender(
      backdropRender,
      storagePath("jobs", job.id, "backdrop.png"),
    );
    job.backdrop = "backdrop.png";
  }
  if (opts.textSprites && Object.keys(opts.textSprites).length)
    job.textSprites = opts.textSprites;
  // the elements' pictures too (render ids → files here)
  if (opts.elements && Object.keys(opts.elements).length) {
    job.elements = {};
    let k = 0;
    const copy = async (renderId: string, name: string) => {
      await copyRender(renderId, storagePath("jobs", job.id, name));
      return name;
    };
    for (const [clipId, e] of Object.entries(opts.elements)) {
      const base = `element-${++k}`;
      job.elements[clipId] = {
        ...e,
        png: await copy(e.png, `${base}.png`),
        ...(e.mask ? { mask: await copy(e.mask, `${base}-shape.png`) } : {}),
        ...(e.strip
          ? {
              strip: {
                ...e.strip,
                png: await copy(e.strip.png, `${base}-words.png`),
              },
            }
          : {}),
      };
    }
  }
  if (opts.logo) {
    await copyRender(opts.logo, storagePath("jobs", job.id, "logo.png"));
    job.logo = "logo.png";
  }
  Q.jobs.set(job.id, job);
  Q.waiting.push(job.id);
  await save(job);
  void pump();
  return job;
}

/** Clips that play a stabilized copy (not with AI Removal: its mask is made from the original frames). */
function stabilizedClips(doc: TimelineDoc): VideoClip[] {
  return doc.tracks.flatMap((t) =>
    t.clips.filter(
      (c) =>
        c.type === "video" &&
        (c as VideoClip).stabilize &&
        !(c as VideoClip).ops.some((o) => o.enabled && o.type === "aiMatte"),
    ),
  ) as VideoClip[];
}

/** Clips that play backwards (not with AI Removal: its mask follows the original frames). */
function reversedClips(doc: TimelineDoc): VideoClip[] {
  return doc.tracks.flatMap((t) =>
    t.clips.filter(
      (c) =>
        c.type === "video" &&
        (c as VideoClip).reversed &&
        !(c as VideoClip).ops.some((o) => o.enabled && o.type === "aiMatte"),
    ),
  ) as VideoClip[];
}

/** An element's pictures in the job folder, as full paths (or null: left out). */
function elementFiles(job: Job, clipId: string): ElementSprite | null {
  const e = job.elements?.[clipId];
  if (!e) return null;
  const at = (name: string) => storagePath("jobs", job.id, name);
  return {
    ...e,
    png: at(e.png),
    ...(e.mask ? { mask: at(e.mask) } : {}),
    ...(e.strip ? { strip: { ...e.strip, png: at(e.strip.png) } } : {}),
  };
}

function composeMediaOf(
  metas: NonNullable<Awaited<ReturnType<typeof getVideo>>>[],
): ComposeMedia {
  return Object.fromEntries(
    metas.map((m) => [
      m.id,
      {
        path: sourcePath(m.id),
        hasAudio: m.info.hasAudio,
        width: m.info.width,
        height: m.info.height,
        still: m.kind === "image",
      },
    ]),
  );
}

/** Where someone speaks on Video 1 (timeline seconds): the clips' sound minus its pauses. For ducking. */
/** Where someone speaks on Video 1 (timeline seconds), for ducking (lib/audio/ducking: the preview uses the same). */
async function speechOnMain(doc: TimelineDoc): Promise<Range[]> {
  const metas = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof getVideo>>>
  >();
  for (const id of mediaIdsOf(doc)) {
    const m = await getVideo(id);
    if (m) metas.set(id, m);
  }
  const hasAudio = (id: string) => !!metas.get(id)?.info.hasAudio;
  const silences: Record<string, Range[]> = {};
  for (const c of speakingClips(doc, hasAudio)) {
    const m = metas.get(c.mediaId)!;
    silences[c.mediaId] ??= await detectSilences(
      m.id,
      sourcePath(m.id),
      m.info.duration,
      DUCK_DETECT,
    ).catch(() => []);
  }
  return speechRanges(doc, silences, hasAudio);
}

async function runDocJob(job: Job, doc: TimelineDoc, signal: AbortSignal) {
  const ids = mediaIdsOf(doc);
  const metas = await Promise.all(ids.map(getVideo));
  if (metas.some((m) => !m))
    throw new FfmpegError(
      "A file on the timeline is gone (it was deleted).",
      null,
      "",
    );
  const all = metas.filter((m): m is NonNullable<typeof m> => !!m);
  const media = composeMediaOf(all);
  const byId = Object.fromEntries(all.map((m) => [m.id, m]));
  const duration = Math.max(0.1, docDuration(doc));
  const masks = new Map<string, string>();
  const derived = new Map<string, string>();
  const reversed = new Map<string, string>();
  const stable = new Set(stabilizedClips(doc).map((c) => c.id));
  const maskKeyOf = (c: VideoClip) => {
    const op = c.ops.find((o) => o.enabled && o.type === "aiMatte");
    return op && op.type === "aiMatte"
      ? `${c.mediaId}|${JSON.stringify(maskParamsOf(op.params))}`
      : null;
  };
  const speech = doc.tracks.some(
    (t) => t.kind === "audio" && t.clips.some((c) => c.duck),
  )
    ? await speechOnMain(doc)
    : [];
  const dir = jobDir(job.id);
  for (const step of job.steps) {
    if (step.kind === "zip") continue;
    step.state = "running";
    await save(job);
    if (step.kind === "derive") {
      const ids = [...new Set(stabilizedClips(doc).map((c) => c.mediaId))];
      const revs = reversedClips(doc);
      const total = ids.length + revs.length;
      for (let i = 0; i < revs.length; i++) {
        const c = revs[i];
        const file = await Promise.race([
          ensureReversed(byId[c.mediaId], c.in, c.out, (pct) => {
            step.percent = Math.round(((i + pct / 100) / total) * 100);
            void save(job, false);
          }),
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(new AbortedError()), {
              once: true,
            }),
          ),
        ]);
        reversed.set(c.id, file);
      }
      for (let i = 0; i < ids.length; i++) {
        const file = await Promise.race([
          ensureDerived(byId[ids[i]], "stabilize", (pct) => {
            step.percent = Math.round(
              ((revs.length + i + pct / 100) / total) * 100,
            );
            void save(job, false);
          }),
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(new AbortedError()), {
              once: true,
            }),
          ),
        ]);
        derived.set(ids[i], file);
      }
    } else if (step.kind === "matte") {
      const clips = doc.tracks.flatMap((t) =>
        t.clips.filter((c) => c.type === "video"),
      ) as VideoClip[];
      const todo = [
        ...new Map(
          clips.filter((c) => maskKeyOf(c)).map((c) => [maskKeyOf(c)!, c]),
        ).values(),
      ];
      for (let i = 0; i < todo.length; i++) {
        const c = todo[i];
        const op = c.ops.find((o) => o.enabled && o.type === "aiMatte")!;
        if (op.type !== "aiMatte") continue;
        const file = await Promise.race([
          ensureMask(byId[c.mediaId], maskParamsOf(op.params), (pct) => {
            step.percent = Math.round(((i + pct / 100) / todo.length) * 100);
            void save(job, false);
          }),
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(new AbortedError()), {
              once: true,
            }),
          ),
        ]);
        masks.set(maskKeyOf(c)!, file);
      }
    } else {
      const kind = step.kind as ComposeKind;
      const spec = DOC_FILES[kind];
      const out = storagePath("jobs", job.id, spec.name);
      await runFfmpeg(
        buildComposeArgs(doc, media, kind, out, {
          maskOf: (c) => masks.get(maskKeyOf(c) ?? "") ?? null,
          speech,
          textOf: (c) =>
            job.texts?.[c.id]
              ? storagePath("jobs", job.id, job.texts[c.id])
              : null,
          backdropOf: () =>
            job.backdrop ? storagePath("jobs", job.id, job.backdrop) : null,
          logoOf: () =>
            job.logo ? storagePath("jobs", job.id, job.logo) : null,
          textSpriteOf: (c) => job.textSprites?.[c.id] ?? null,
          planMark: job.planMark ? join(process.cwd(), "public", "vdo-icon.png") : null,
          elementOf: (c) => elementFiles(job, c.id),
          sourceOf: (c) =>
            stable.has(c.id) ? (derived.get(c.mediaId) ?? null) : null,
          reversedOf: (c) => reversed.get(c.id) ?? null,
          at: job.at,
        }),
        {
          signal,
          timeoutMs: 30 * 60 * 1000,
          onProgress: (t) => {
            step.percent = Math.min(99, Math.round((100 * t) / duration));
            void save(job, false);
          },
        },
      );
      const checkAt =
        kind === "webm" || kind === "mov"
          ? alphaCheckTime(doc, duration)
          : null;
      if (checkAt != null && (kind === "webm" || kind === "mov")) {
        // (a timeline of only text or logos may be empty at that moment: see-through is enough)
        const ok = await verifyAlpha(out, kind, checkAt, false);
        if (!ok)
          throw new FfmpegError(
            `The ${kind === "webm" ? "Chrome" : "Safari"} file has no transparency. Turn on Background removal for the clips, or give the project a background color for a normal MP4.`,
            null,
            "",
          );
      }
      job.files.push({
        kind,
        name: spec.name,
        size: (await stat(out)).size,
        mime: spec.mime,
      });
    }
    step.state = "done";
    step.percent = 100;
    await save(job);
  }
  const zipStep = job.steps.find((s) => s.kind === "zip");
  if (zipStep) {
    zipStep.state = "running";
    await save(job);
    const zipName = "ViPlay-website-files.zip";
    await zipFiles(dir, storagePath("jobs", job.id, zipName), [
      OUTPUT_FILES.webm.name,
      OUTPUT_FILES.mov.name,
      OUTPUT_FILES.poster.name,
    ]);
    zipStep.state = "done";
    zipStep.percent = 100;
    job.files.push({
      kind: "zip",
      name: zipName,
      size: (await stat(storagePath("jobs", job.id, zipName))).size,
      mime: "application/zip",
    });
  }
}

export async function getJob(id: string): Promise<Job | null> {
  if (!isId(id)) return null;
  const mem = Q.jobs.get(id);
  if (mem) return mem;
  const disk = await readJson<Job & { settings?: Settings }>(jobJson(id));
  // jobs saved before EditSpec existed
  if (disk && !disk.spec && disk.settings)
    disk.spec = specFromSettings(disk.settings);
  if (disk && (disk.state === "queued" || disk.state === "running")) {
    disk.state = "failed";
    disk.error =
      "The editor was restarted while this was running. Click Make transparent video again.";
    await save(disk);
  }
  return disk;
}

export async function cancelJob(id: string): Promise<Job | null> {
  const job = await getJob(id);
  if (!job) return null;
  if (job.state === "queued") {
    Q.waiting = Q.waiting.filter((w) => w !== id);
    job.state = "canceled";
    await save(job);
  } else if (job.state === "running") {
    Q.controllers.get(id)?.abort();
  }
  return job;
}

/** Remove a finished job's files ("Delete now"). */
export async function deleteJob(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (!job) return false;
  if (job.state === "running" || job.state === "queued") await cancelJob(id);
  Q.jobs.delete(id);
  await removeDir(jobDir(id));
  return true;
}

/** Decode one frame and check it really has transparent and solid pixels. */
/** Does the file have see-through pixels at t (and, unless `anySolid` is false, solid ones too)? */
async function verifyAlpha(
  file: string,
  kind: "webm" | "mov",
  t: number,
  anySolid = true,
): Promise<boolean> {
  const decoder = kind === "webm" ? ["-c:v", "libvpx-vp9"] : [];
  const r = await runFfmpeg(
    [
      ...SAFE_INPUT,
      ...decoder,
      "-ss",
      t.toFixed(3),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "alphaextract,scale=160:-2",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "pipe:1",
    ],
    { collectStdout: true, timeoutMs: 30_000 },
  );
  const a = r.stdout;
  if (!a.length) return false;
  let min = 255;
  let max = 0;
  for (const v of a) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min < 10 && (!anySolid || max > 200);
}

/**
 * A stored (uncompressed: video doesn't shrink) zip of `names` from `dir`, skipping any not made (off a Mac
 * there's no Safari .mov). No zip program needed (Linux hosts have none).
 */
export async function zipFiles(dir: string, out: string, names: string[]): Promise<void> {
  const read = async (name: string) => {
    try {
      return { path: name, data: new Uint8Array(await readFile(join(dir, name))) };
    } catch {
      return null;
    }
  };
  const entries = (await Promise.all(names.map(read))).filter((e) => e !== null);
  await writeFile(out, await createZipArchive(entries));
}

async function runJob(job: Job, signal: AbortSignal) {
  if (job.doc) return runDocJob(job, job.doc, signal);
  const video = await getVideo(job.videoId);
  if (!video)
    throw new Error(
      "The uploaded video is gone (files are deleted after 24 hours).",
    );
  const dir = jobDir(job.id);
  const src = sourcePath(job.videoId);
  // progress runs over the kept parts only
  const duration = timelineDuration(
    segmentsOf(job.spec.timeline, video.info.duration),
  );
  let crop: CropBox | null = null;
  let mask: string | null = null;
  const ai = activeAiOp(job.spec);

  for (const step of job.steps) {
    if (step.kind === "zip") continue;
    if (step.kind === "matte") {
      step.state = "running";
      await save(job);
      if (!ai) throw new Error("AI step without AI Removal");
      // shared with a mask the editor may already be making; canceling the job stops waiting, the mask stays cached
      mask = await Promise.race([
        ensureMask(video, maskParamsOf(ai.params), (pct) => {
          step.percent = pct;
          void save(job, false);
        }),
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () => reject(new AbortedError()), {
            once: true,
          }),
        ),
      ]);
      step.state = "done";
      step.percent = 100;
      await save(job);
      continue;
    }
    if (step.kind === "crop") {
      step.state = "running";
      await save(job);
      crop = await findCropBox(
        job.videoId,
        src,
        video.info,
        job.spec,
        signal,
        mask,
      );
      const geo = outputGeometry(job.spec.output, video.info, crop);
      job.output = { ...job.output, width: geo.outW, height: geo.outH };
      step.state = "done";
      step.percent = 100;
      await save(job);
      continue;
    }
    if (!(step.kind in OUTPUT_FILES)) continue; // only timeline exports have the others
    const kind = step.kind as OutputKind;
    const spec = OUTPUT_FILES[kind];
    const out = storagePath("jobs", job.id, spec.name);
    step.state = "running";
    await save(job);
    await runFfmpeg(
      buildEncodeArgs(kind, job.spec, video.info, src, out, { crop, mask }),
      {
        signal,
        timeoutMs: 15 * 60 * 1000,
        onProgress: (t) => {
          step.percent = Math.min(
            99,
            Math.round((100 * t) / Math.max(0.1, duration)),
          );
          void save(job, false);
        },
      },
    );
    if (kind === "webm" || kind === "mov") {
      const ok = await verifyAlpha(out, kind, Math.min(1, duration / 2));
      if (!ok)
        throw new FfmpegError(
          `The ${kind === "webm" ? "Chrome" : "Safari"} file has no transparency. Check the key color.`,
          null,
          "",
        );
    }
    step.state = "done";
    step.percent = 100;
    job.files.push({
      kind,
      name: spec.name,
      size: (await stat(out)).size,
      mime: spec.mime,
    });
    await save(job);
  }

  const zipStep = job.steps.find((s) => s.kind === "zip")!;
  zipStep.state = "running";
  await save(job);
  const zipName = "ViPlay-website-files.zip";
  await zipFiles(dir, storagePath("jobs", job.id, zipName), [
    OUTPUT_FILES.webm.name,
    OUTPUT_FILES.mov.name,
    OUTPUT_FILES.poster.name,
  ]);
  zipStep.state = "done";
  zipStep.percent = 100;
  job.files.push({
    kind: "zip",
    name: zipName,
    size: (await stat(storagePath("jobs", job.id, zipName))).size,
    mime: "application/zip",
  });
}

async function pump() {
  if (Q.running) return;
  const id = Q.waiting.shift();
  if (!id) return;
  const job = Q.jobs.get(id);
  if (!job) return void pump();
  Q.running = id;
  const ac = new AbortController();
  Q.controllers.set(id, ac);
  job.state = "running";
  await save(job);
  try {
    await runJob(job, ac.signal);
    job.state = "done";
  } catch (err) {
    const step = job.steps.find((s) => s.state === "running");
    if (step) step.state = "failed";
    if (err instanceof AbortedError) {
      job.state = "canceled";
    } else {
      job.state = "failed";
      job.error =
        err instanceof FfmpegError && err.code === null
          ? err.message
          : `${step?.label ?? "Processing"} failed.`;
      job.errorDetail =
        err instanceof FfmpegError ? err.stderrTail : String(err);
    }
  } finally {
    Q.controllers.delete(id);
    Q.running = null;
    await save(job);
    void pump();
  }
}
