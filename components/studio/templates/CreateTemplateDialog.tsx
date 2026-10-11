"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { AUDIO_ACCEPT, precheck, uploadVideo, VIDEO_ACCEPT, VIDEO_FORMATS } from "@/lib/api/upload";
import type { VideoMeta } from "@/lib/api/types";
import { formatTime } from "@/lib/format";
import { limitSizeLabel } from "@/lib/settings";
import type { CustomTemplate } from "@/lib/templates/custom";
import { ratioOfCanvas } from "@/lib/templates/hubTemplates";
import { BROADCAST_TEMPLATES } from "@/lib/templates/newsTemplates";

const MY = "My Templates";
type Slot = { meta: VideoMeta | null; progress: number | null; error: string | null };
const EMPTY: Slot = { meta: null, progress: null, error: null };

/**
 * "+ Create template" (Video Templates): your video (on Video 1), your sound (an audio track)
 * and a base look (a broadcast template's titles, ticker and graphics on top, or none). The
 * files are uploaded like any other (they land in My Assets); the template is kept on the server.
 */
export function CreateTemplateDialog({
  open,
  onClose,
  onSaved,
  groups,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (t: CustomTemplate) => void;
  /** groups to offer (your own template groups and the library's) */
  groups: string[];
  /** from the template pane: its look and the clip / sound picked there */
  initial?: { baseId?: string | null; video?: VideoMeta | null; audio?: VideoMeta | null };
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState(MY);
  const [baseId, setBaseId] = useState<string>(initial?.baseId ?? "");
  const [video, setVideo] = useState<Slot>({ ...EMPTY, meta: initial?.video ?? null });
  const [audio, setAudio] = useState<Slot>({ ...EMPTY, meta: initial?.audio ?? null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  const ratio = video.meta ? ratioOfCanvas({ width: video.meta.info.width, height: video.meta.info.height }) : null;
  // the looks made for this video's shape (all of them until a video is chosen)
  const looks = BROADCAST_TEMPLATES.filter((t) => !ratio || t.aspectRatio === ratio);
  const base = BROADCAST_TEMPLATES.find((t) => t.id === baseId);
  const baseOk = !base || !ratio || base.aspectRatio === ratio;
  const busy = video.progress !== null || audio.progress !== null || saving;

  const upload = async (f: File, want: "video" | "audio", set: (s: Slot) => void) => {
    const bad = precheck(f);
    if (bad) return set({ ...EMPTY, error: bad === "too_big" ? `This file is too big. The limit is ${limitSizeLabel()}.` : want === "video" ? `Use a video: ${VIDEO_FORMATS}.` : "Use a sound: MP3, WAV, M4A, AAC, OGG or Opus." });
    set({ ...EMPTY, progress: 0 });
    try {
      const m = await uploadVideo(f, (done, total) => set({ ...EMPTY, progress: total ? Math.min(99, Math.round((done / total) * 100)) : 0 }));
      if ((m.kind ?? "video") !== want) return set({ ...EMPTY, error: want === "video" ? "That's not a video. Choose a video file." : "That's not a sound. Choose an audio file." });
      set({ ...EMPTY, meta: m });
      if (want === "video" && !name.trim()) setName(m.fileName.replace(/\.[^/.]+$/, "").slice(0, 60));
    } catch (err) {
      set({ ...EMPTY, error: err instanceof Error && err.message ? err.message : "The upload stopped. Try again." });
    }
  };

  const save = async () => {
    if (!video.meta || !name.trim() || !baseOk) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category: group, baseId: baseId || null, videoId: video.meta.id, ...(audio.meta ? { audioId: audio.meta.id } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as { template?: CustomTemplate; error?: { message?: string } } | null;
      if (!res.ok || !j?.template) throw new Error(j?.error?.message ?? "Couldn't save the template. Try again.");
      onSaved(j.template);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a template"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" aria-disabled={!video.meta || !name.trim() || busy || !baseOk} onClick={() => void save()}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3" data-testid="create-template">
        <p className="text-sm text-muted">Your video and sound, with a ready-made look on top. It shows in Video Templates → {MY}.</p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Name</span>
          <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="My news show" aria-label="Template name" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Group</span>
          <select className="field" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Template group">
            {[...new Set([MY, ...groups])].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <FileRow label="Video" s={video} pick={() => videoInput.current?.click()} clear={null} kind="video" />
        <FileRow label="Audio" s={audio} pick={() => audioInput.current?.click()} clear={() => setAudio(EMPTY)} kind="audio" />
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Base look</span>
          <select className="field" value={baseId} onChange={(e) => setBaseId(e.target.value)} aria-label="Base look">
            <option value="">None (just your video and sound)</option>
            {looks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.category}
              </option>
            ))}
            {base && !looks.includes(base) && <option value={base.id}>{base.name} (made for {base.aspectRatio})</option>}
          </select>
          <span className="text-[0.6875rem] text-muted">{base ? `Its titles, ticker and graphics go over your video (${base.slots.length} layers). You can change the words after.` : "No titles or graphics: add them in the editor."}</span>
        </label>
        {!baseOk && base && ratio && (
          <Notice tone="warning" title={`${base.name} is made for ${base.aspectRatio} videos`}>
            Your video is {ratio}. Choose another look, or None.
          </Notice>
        )}
        {error && (
          <Notice tone="error" role="alert" title="Not saved">
            {error}
          </Notice>
        )}
        <input ref={videoInput} type="file" accept={VIDEO_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="create-template-video-input" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f, "video", setVideo);
        }} />
        <input ref={audioInput} type="file" accept={AUDIO_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="create-template-audio-input" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f, "audio", setAudio);
        }} />
      </div>
    </Dialog>
  );
}

/** One file of the template (its video or its sound): pick, progress, what it is. */
function FileRow({ label, s, pick, clear, kind }: { label: string; s: Slot; pick: () => void; clear: (() => void) | null; kind: "video" | "audio" }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-canvas p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{label}</span>
        <span className="flex items-center gap-1.5">
          {clear && s.meta && (
            <button type="button" className="text-[0.6875rem] text-muted hover:text-danger" onClick={clear}>
              Remove
            </button>
          )}
          <button type="button" className="btn btn-secondary text-xs" onClick={pick} disabled={s.progress !== null}>
            <Icon name="upload" className="size-3.5" /> {s.meta ? "Change" : kind === "video" ? "Upload video" : "Upload audio"}
          </button>
        </span>
      </div>
      {s.progress !== null && (
        <div className="flex items-center gap-2 text-[0.6875rem] text-muted" aria-live="polite">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
            <span className="block h-full bg-primary transition-[width]" style={{ width: `${s.progress}%` }} />
          </span>
          {s.progress < 99 ? `Uploading… ${s.progress}%` : "Preparing…"}
        </div>
      )}
      {s.meta && (
        <div className="flex items-center gap-2 text-[0.6875rem]" data-testid={`create-template-${kind}`}>
          {kind === "video" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/videos/${s.meta.id}/thumb`} alt="" className="h-10 w-16 rounded object-cover" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded bg-raised">
              <Icon name="audio" className="size-4 text-primary" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{s.meta.fileName}</span>
            <span className="text-muted">
              {formatTime(s.meta.info.duration)}
              {kind === "video" && ` · ${s.meta.info.width} × ${s.meta.info.height} · ${ratioOfCanvas({ width: s.meta.info.width, height: s.meta.info.height })}`}
            </span>
          </span>
        </div>
      )}
      {s.error && (
        <p role="alert" className="text-[0.6875rem] text-danger">
          {s.error}
        </p>
      )}
      {!s.meta && !s.error && s.progress === null && <p className="text-[0.6875rem] text-muted">{kind === "video" ? `${VIDEO_FORMATS}. It goes on Video 1.` : "Optional. MP3, WAV, M4A, AAC, OGG. It plays under the video and shows in Audio → My uploads."}</p>}
    </div>
  );
}
