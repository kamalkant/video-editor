"use client";

import { useState } from "react";
import { GeneratePanel } from "@/components/editor/GeneratePanel";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import type { EditSpec, OutputSettings as Output } from "@/lib/edit/spec";
import type { CropInfo } from "@/lib/editor/useCropBox";
import { formatOf, isAudioFormat, isStillFormat, needsAlpha, VIDEO_PRESETS, type ExportFormat, type VideoPresetId } from "@/lib/export/presets";
import { formatBytes, formatTime } from "@/lib/format";
import { estimateBytes, needsBusyness, type SizeBasis } from "@/lib/export/size";
import { useExportSize } from "@/lib/editor/useExportSize";
import type { Job } from "@/lib/jobs/queue";
import type { VideoMeta } from "@/lib/videos";
import { ExportResults, ExportSummary } from "./ExportResults";
import { FormatPicker } from "./FormatPicker";
import { OutputSettings } from "./OutputSettings";

// the same labels and order as the website pack's settings (OutputSettings)
const QUALITY_CHOICES = [
  { id: "best", label: "High" },
  { id: "balanced", label: "Balanced" },
  { id: "small", label: "Small" },
] as const;
/** Formats where the quality setting changes the file (ProRes, WAV, GIF and pictures are fixed). */
const HAS_QUALITY: ExportFormat[] = ["mp4", "hevc", "av1", "webm", "webm-alpha", "mov-alpha", "mp3"];

/** "Export & Share": format (MP4 recommended, then all the others), size, quality, progress and the finished files. */
export function ExportDialog(p: {
  open: boolean;
  onClose: () => void;
  /** The one video, when the project is just that video: the website pack then has its own settings and a size estimate. */
  video: VideoMeta | null;
  spec: EditSpec;
  patchOutput: (x: Partial<Output>) => void;
  job: Job | null;
  connection: "ok" | "retrying" | "gone";
  starting: boolean;
  startStatus?: string;
  startError: string | null;
  onCancel: () => void;
  onShowFinal: () => void;
  crop: CropInfo;
  /** The project (null = nothing on the timeline yet). `at` = the playhead, for pictures. */
  project: { width: number; height: number; duration: number; transparent: boolean; at: number } | null;
  format: ExportFormat;
  onFormat: (f: ExportFormat) => void;
  /** Why a format can't be made right now (null = it can). */
  blockedOf: (f: ExportFormat) => string | null;
  /** Start: at the project size, or at a social-media size (the project stays as it is). */
  onGenerate: (size: VideoPresetId | null) => void;
  /** Switch the project itself to a preset size. */
  onSwitchSize: (id: VideoPresetId) => void;
  /** For the size estimate: what to measure, whether there's sound, and the ProRes master of the pack. */
  sizeBasis?: SizeBasis | null;
  hasSound?: boolean;
  master?: boolean;
}) {
  const [again, setAgain] = useState(false);
  const [size, setSize] = useState<VideoPresetId | "project">("project");
  const f = formatOf(p.format) ?? formatOf("mp4")!;
  const pr = p.project;
  const done = p.job?.state === "done";
  const running = p.starting || p.job?.state === "queued" || p.job?.state === "running";
  const close = () => {
    setAgain(false);
    p.onClose();
  };
  // the website pack of a single video keeps its detailed settings (width, frame rate, crop, estimate)
  const packOfVideo = !!p.video && p.format === "pack";
  const canSize = !!pr && !isAudioFormat(p.format) && !packOfVideo;
  const chosen = canSize && size !== "project" ? (VIDEO_PRESETS.find((x) => x.id === size) ?? null) : null;
  const blocked = pr ? p.blockedOf(p.format) : "Add a video or picture first.";
  const generate = () => {
    setAgain(false);
    p.onGenerate(chosen?.id ?? null);
  };
  const W = chosen?.width ?? pr?.width ?? 0;
  const H = chosen?.height ?? pr?.height ?? 0;

  // about how big each file will be (measured from the project's own clips; quality and size need no new measurement)
  const busy = useExportSize(p.sizeBasis ?? null, p.open && !running && !done && !!pr);
  const sizeOf = (f: typeof p.format): number | null => {
    if (!pr || p.blockedOf(f) || (f === "pack" && packOfVideo)) return null;
    const size = !isAudioFormat(f) ? { width: W, height: H } : { width: pr.width, height: pr.height };
    return estimateBytes(f, {
      ...size,
      fps: p.sizeBasis?.fps ?? 30,
      duration: pr.duration,
      quality: p.spec.output.quality,
      hasSound: !!p.hasSound,
      bpp: busy.bpp,
      measuredAt: busy.measuredAt,
      master: p.master,
    });
  };
  const sizeNow = sizeOf(p.format);

  // Instant export render duration estimate based on timeline length and target format
  const estExportSec = pr
    ? isAudioFormat(p.format)
      ? Math.max(1, Math.round(pr.duration / 30))
      : isStillFormat(p.format)
        ? 1
        : Math.max(2, Math.round(pr.duration / 8))
    : 0;
  const estTimeStr = estExportSec < 60 ? `~${estExportSec}s` : `~${Math.round(estExportSec / 60)} min`;

  const sizeLine = pr && !running && !done && !blocked && !packOfVideo && (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs" data-testid="export-size" aria-live="polite">
      {sizeNow !== null ? (
        <>
          <span>
            <strong>Size:</strong> about {formatBytes(sizeNow)}
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">
            <strong>Est. time:</strong> {estTimeStr}
          </span>
        </>
      ) : (
        "Estimating the size…"
      )}
    </span>
  );

  const sizePicker = canSize && pr && (
    <fieldset className="flex flex-col gap-1" data-testid="video-sizes">
      <legend className="mb-1 text-sm font-semibold">Size</legend>
      {[{ id: "project" as const, label: `Project size (${pr.width} × ${pr.height})`, detail: "Exactly as you see it" }, ...VIDEO_PRESETS.map((x) => ({ ...x, detail: `${x.width} × ${x.height}` }))].map((x) => (
        <label key={x.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 ${size === x.id ? "border-primary bg-primary-soft" : "border-control"}`}>
          <input type="radio" name="video-size" className="size-4" checked={size === x.id} onChange={() => setSize(x.id)} />
          <span className="text-sm font-medium">{x.label}</span>
          {x.id !== "project" && <span className="ml-auto text-xs text-muted">{x.detail}</span>}
        </label>
      ))}
      {chosen && (chosen.width !== pr.width || chosen.height !== pr.height) && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          The file is made at {chosen.width} × {chosen.height}; your project stays as it is (clips are fitted).
          <button type="button" className="text-link underline" onClick={() => p.onSwitchSize(chosen.id)}>
            Also switch the project to this size
          </button>
        </p>
      )}
    </fieldset>
  );

  const qualityPicker = HAS_QUALITY.includes(p.format) && !packOfVideo && (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold">Quality</legend>
      <div className="flex gap-1" role="radiogroup" aria-label="Quality">
        {QUALITY_CHOICES.map((q) => (
          <button key={q.id} type="button" role="radio" aria-checked={p.spec.output.quality === q.id} onClick={() => p.patchOutput({ quality: q.id })} className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${p.spec.output.quality === q.id ? "border-primary bg-primary-soft font-semibold" : "border-control text-muted hover:text-ink"}`}>
            {q.label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const what = !pr
    ? "Add a video or picture to the timeline first."
    : isAudioFormat(p.format)
      ? `The sound of the whole timeline, ${formatTime(pr.duration)}. No picture.`
      : isStillFormat(p.format)
        ? `One picture, ${W} × ${H}: the frame at the playhead (${formatTime(pr.at)}). Move the playhead to pick another frame.`
        : `The whole timeline, ${W} × ${H}, ${formatTime(pr.duration)}${p.format === "gif" ? " (at most 640 px wide, 15 fps)" : ""}.`;
  const blackNote = pr?.transparent && !needsAlpha(p.format) && p.format !== "png" && !isAudioFormat(p.format);

  const label = p.format === "mp4" ? "Make video (MP4)" : p.format === "pack" ? "Make transparent video" : `Make ${f.short}`;

  let body;
  if (done && p.job && !again) {
    body = <ExportResults job={p.job} spec={p.spec} onGenerate={generate} onShowFinal={p.onShowFinal} onAgain={() => setAgain(true)} />;
  } else {
    body = (
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div inert={running} className={running ? "opacity-60" : undefined}>
          <FormatPicker
            value={p.format}
            onChange={p.onFormat}
            blockedOf={(x) => (pr ? p.blockedOf(x) : null)}
            sizeOf={(x) => {
              if (running || done) return null;
              const n = sizeOf(x);
              return n === null ? null : `~${formatBytes(n)}`;
            }}
          />
        </div>
        <div className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
          {packOfVideo && p.video ? (
            <>
              <div inert={running} className={running ? "opacity-60" : undefined}>
                <OutputSettings idPrefix="dlg" output={p.spec.output} info={p.video.info} patch={p.patchOutput} crop={p.crop} />
              </div>
              <ExportSummary video={p.video} spec={p.spec} crop={p.crop} estimateOn={p.open && !running && !blocked} />
            </>
          ) : (
            <>
              <Notice tone="info" title={f.label}>
                {what}
                {blackNote && <> The see-through parts become black. For see-through video, pick a format under “See-through video (alpha)”.</>}
                {sizeLine}
              </Notice>
              <div inert={running} className={`flex flex-col gap-4 ${running ? "opacity-60" : ""}`}>
                {sizePicker}
                {qualityPicker}
              </div>
            </>
          )}
          <GeneratePanel job={done ? null : p.job} starting={p.starting} startStatus={p.startStatus} connection={p.connection} disabledReason={blocked} startError={p.startError} onGenerate={generate} onCancel={p.onCancel} label={label} help={f.detail} />
          {done && (
            <button type="button" className="btn btn-secondary" onClick={() => setAgain(false)}>
              Back to the finished files
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={p.open} onClose={close} title="Export & Share" size={done && !again ? "md" : "lg"}>
      {body}
    </Dialog>
  );
}
