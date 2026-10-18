import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EditSpec } from "../edit/spec";
import { segmentsOf, timelineDuration } from "../edit/timeline";
import { getCapabilities } from "./capabilities";
import { findCropBox } from "./cropbox";
import { buildEncodeArgs, type OutputKind } from "./encode";
import type { VideoInfo } from "./probe";
import { runFfmpeg } from "./run";

export type SizeEstimate = {
  webm: number;
  mov: number;
  master: number | null;
  sampleSeconds: number;
};

const SAMPLE = 2;
const g = globalThis as unknown as {
  __VDOEstimates?: Map<string, SizeEstimate>;
};
const cache = (g.__VDOEstimates ??= new Map());

/**
 * Estimate the export file sizes by encoding a short sample from the middle of
 * the clip with the real settings, then scaling to the full length.
 */
export async function estimateSizes(
  key: string,
  path: string,
  info: VideoInfo,
  spec: EditSpec,
  signal?: AbortSignal,
  mask?: string | null,
): Promise<SizeEstimate> {
  const cacheKey = `${key}|${JSON.stringify(spec)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const duration = info.duration;
  const len = Math.min(SAMPLE, duration);
  const start =
    duration <= SAMPLE + 1 ? 0 : Math.max(0, duration / 2 - len / 2);
  // the sample comes from the source; the files only hold the kept parts
  const scale = timelineDuration(segmentsOf(spec.timeline, duration)) / len;
  const crop = spec.output.crop.enabled
    ? await findCropBox(key, path, info, spec, signal, mask)
    : null;
  const dir = await mkdtemp(join(tmpdir(), "VDO-est-"));
  try {
    const size = async (kind: OutputKind, ext: string) => {
      const out = join(dir, `sample.${ext}`);
      await runFfmpeg(
        buildEncodeArgs(kind, spec, info, path, out, {
          progress: false,
          range: { start, duration: len },
          crop,
          mask,
          timeline: false,
          movEncoder: (await getCapabilities()).movEncoder,
        }),
        { signal, timeoutMs: 120_000 },
      );
      return Math.round((await stat(out)).size * scale);
    };
    const webm = await size("webm", "webm");
    const mov = await size("mov", "mov");
    const master = spec.output.master
      ? await size("master", "prores.mov")
      : null;
    const est = { webm, mov, master, sampleSeconds: len };
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, est);
    return est;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
