"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Switch } from "@/components/ui/Switch";
import { uploadVideo } from "@/lib/api/upload";
import type { VideoMeta } from "@/lib/api/types";
import { formatTime } from "@/lib/format";
import { useRecorder, type RecordMode } from "@/lib/record/useRecorder";

export type Recorded = { mode: RecordMode; main: VideoMeta; camera: VideoMeta | null; /** the camera as a round bubble */ bubble: boolean };

const MODES: { id: RecordMode; label: string; icon: IconName; hint: string }[] = [
  { id: "camera", label: "Camera", icon: "camera", hint: "You on camera, with your microphone." },
  { id: "screen", label: "Screen", icon: "screen", hint: "A screen, window or browser tab, with your voice." },
  { id: "screenCamera", label: "Screen + camera", icon: "layers", hint: "Your screen with you in a small box. Two clips: you can move the box or remove your background later." },
  { id: "voice", label: "Voice only", icon: "mic", hint: "A voiceover. It goes on an audio track at the playhead." },
];

/** Shows a live camera or screen stream in a <video>. */
function LiveVideo({ stream, mirror, className, label }: { stream: MediaStream | null; mirror?: boolean; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline aria-label={label} className={className} style={mirror ? { transform: "scaleX(-1)" } : undefined} />;
}

/** One recording session: choose a mode and devices, see yourself, 3-2-1, record, review, add. */
function RecordStudio({ initialMode, maxSeconds, onAdd, onBusy }: { initialMode: RecordMode; maxSeconds: number; onAdd: (r: Recorded) => void; onBusy: (busy: boolean) => void }) {
  const rec = useRecorder(maxSeconds);
  const [mode, setMode] = useState<RecordMode>(initialMode);
  const [cameraId, setCameraId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");
  const [mic, setMic] = useState(true);
  const [systemAudio, setSystemAudio] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [bubble, setBubble] = useState(true);
  const [script, setScript] = useState("");
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [saving, setSaving] = useState<{ pct: number; step: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prompter = useRef<HTMLDivElement>(null);
  const hasScreen = mode === "screen" || mode === "screenCamera";
  const hasCamera = mode === "camera" || mode === "screenCamera";
  const busy = rec.phase === "recording" || rec.phase === "paused" || rec.phase === "countdown" || !!saving;

  useEffect(() => onBusy(busy), [busy, onBusy]);
  useEffect(() => void rec.listDevices(), [rec.listDevices]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewUrl = rec.take?.url ?? null;
  // the read-along script scrolls while recording
  useEffect(() => {
    if (rec.phase !== "recording" || !prompter.current) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const el = prompter.current;
      if (el) el.scrollTop += ((now - last) / 1000) * 28 * scrollSpeed;
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rec.phase, scrollSpeed]);

  const switchMode = (m: RecordMode) => {
    if (busy) return;
    rec.release();
    rec.discard();
    setMode(m);
  };
  const prepare = () => void rec.prepare(mode, { cameraId: cameraId || undefined, micId: micId || undefined, mic: mode === "voice" || mode === "camera" ? true : mic, systemAudio });

  const add = async () => {
    const t = rec.take;
    if (!t) return;
    setSaveError(null);
    try {
      setSaving({ pct: 0, step: "Saving the recording" });
      const total = t.main.size + (t.camera?.size ?? 0);
      const main = await uploadVideo(t.main, (l) => setSaving({ pct: Math.round((l / total) * 100), step: l >= t.main.size ? "Preparing it for editing" : "Saving the recording" }), undefined, { name: t.mainName, recording: true });
      let camera: VideoMeta | null = null;
      if (t.camera && t.cameraName) camera = await uploadVideo(t.camera, (l) => setSaving({ pct: Math.round(((t.main.size + l) / total) * 100), step: "Saving the camera" }), undefined, { name: t.cameraName, recording: true });
      setSaving(null);
      onAdd({ mode: t.mode, main, camera, bubble });
    } catch (e) {
      setSaving(null);
      setSaveError((e as Error).message);
    }
  };

  const live = rec.phase === "ready" || rec.phase === "countdown" || rec.phase === "recording" || rec.phase === "paused";
  const recording = rec.phase === "recording" || rec.phase === "paused";
  const left = Math.max(0, maxSeconds - rec.seconds);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div role="radiogroup" aria-label="What to record" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              disabled={busy}
              onClick={() => switchMode(m.id)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm disabled:opacity-50 ${mode === m.id ? "border-primary bg-primary-soft font-semibold text-ink" : "border-line text-muted hover:border-control hover:text-ink"}`}
            >
              <Icon name={m.icon} className="size-4" />
              {m.label}
            </button>
          ))}
        </div>
        <p className="-mt-1 text-xs text-muted">{MODES.find((m) => m.id === mode)?.hint}</p>

        {/* the stage: live view, countdown, recording state, or the take */}
        <div className="on-dark relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-[#05080f]" data-testid="record-stage">
          {rec.phase === "review" && reviewUrl ? (
            rec.take?.mode === "voice" ? (
              <audio src={reviewUrl} controls className="w-3/4" aria-label="Your recording" data-testid="record-review" />
            ) : (
              <video src={reviewUrl} controls playsInline className="size-full object-contain" aria-label="Your recording" data-testid="record-review" />
            )
          ) : live ? (
            <>
              {hasScreen && <LiveVideo stream={rec.streams.screen} className="size-full object-contain" label="Your screen" />}
              {mode === "camera" && <LiveVideo stream={rec.streams.camera} mirror={mirror} className="size-full object-cover" label="Your camera" />}
              {mode === "screenCamera" && (
                <div className={`absolute bottom-[4%] right-[3%] overflow-hidden border-white shadow-xl ${bubble ? "aspect-square w-[16%] rounded-full border-[3px]" : "aspect-video w-[28%] rounded-md border-2"}`}>
                  <LiveVideo stream={rec.streams.camera} mirror={mirror} className="size-full object-cover" label="Your camera" />
                </div>
              )}
              {mode === "voice" && (
                <div className="flex flex-col items-center gap-3 text-white">
                  <Icon name="mic" className="size-14" />
                  <div className="flex h-10 items-end gap-1" aria-hidden="true">
                    {Array.from({ length: 16 }, (_, i) => (
                      <span key={i} className="w-1.5 rounded bg-emerald-400 transition-[height]" style={{ height: `${Math.max(8, Math.min(100, rec.level * 100 * (0.5 + Math.abs(Math.sin(i * 1.7)))))}%` }} />
                    ))}
                  </div>
                </div>
              )}
              {script.trim() && hasCamera && (
                <div ref={prompter} className="absolute inset-x-[8%] top-3 max-h-[30%] overflow-hidden rounded-md bg-black/65 px-3 py-2 text-center text-lg leading-snug text-white" aria-label="Your script">
                  <p className="whitespace-pre-wrap">{script}</p>
                  <div className="h-24" />
                </div>
              )}
              {rec.phase === "countdown" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-8xl font-bold text-white" aria-live="assertive" data-testid="record-countdown">
                  {rec.countdown}
                </span>
              )}
              {recording && (
                <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/75 px-3 py-1 text-sm font-semibold text-white" data-testid="record-timer">
                  <span className={`size-2.5 rounded-full ${rec.phase === "paused" ? "bg-amber-400" : "animate-pulse bg-red-500"}`} />
                  {rec.phase === "paused" ? "Paused" : "REC"} {formatTime(rec.seconds)}
                </span>
              )}
            </>
          ) : (
            <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-white">
              <Icon name={MODES.find((m) => m.id === mode)!.icon} className="size-10 opacity-80" />
              <p className="text-sm text-white/80">{hasScreen ? "Pick what to share: a screen, a window or a tab." : mode === "voice" ? "Turn on your microphone to record a voiceover." : "Turn on your camera to see yourself."}</p>
              <button type="button" className="btn btn-primary" onClick={prepare} disabled={rec.phase === "preparing"}>
                {rec.phase === "preparing" ? "Waiting for permission…" : hasScreen ? "Choose screen" : mode === "voice" ? "Turn on microphone" : "Turn on camera"}
              </button>
            </div>
          )}
        </div>

        {rec.error && (
          <Notice tone="error" role="alert" title="Can't record yet">
            {rec.error}
          </Notice>
        )}
        {saveError && (
          <Notice tone="error" role="alert" title="The recording wasn't saved">
            {saveError} Your take is still here: try again.
          </Notice>
        )}

        {/* controls */}
        <div className="flex flex-wrap items-center gap-2">
          {rec.phase === "ready" && (
            <>
              <button type="button" className="btn bg-red-600 text-white hover:bg-red-500" onClick={() => rec.start(3)} data-testid="record-start">
                <Icon name="record" className="size-4" /> Start recording
              </button>
              {hasScreen && (
                <button type="button" className="btn btn-secondary" onClick={prepare}>
                  Change screen
                </button>
              )}
              <span className="text-xs text-muted">Up to {formatTime(maxSeconds)}. A 3-2-1 countdown starts first.</span>
            </>
          )}
          {rec.phase === "countdown" && (
            <button type="button" className="btn btn-secondary" onClick={rec.stop}>
              Cancel
            </button>
          )}
          {recording && (
            <>
              <button type="button" className="btn btn-primary" onClick={rec.stop} data-testid="record-stop">
                <Icon name="stop" className="size-4" /> Stop
              </button>
              {rec.phase === "recording" ? (
                <button type="button" className="btn btn-secondary" onClick={rec.pause}>
                  <Icon name="pause" className="size-4" /> Pause
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={rec.resume}>
                  <Icon name="record" className="size-4 text-red-400" /> Resume
                </button>
              )}
              <span className="text-xs tabular-nums text-muted">{formatTime(left)} left</span>
            </>
          )}
          {rec.phase === "review" && rec.take && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => void add()} disabled={!!saving} data-testid="record-add">
                <Icon name="plus" className="size-4" /> Add to timeline
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!saving}
                onClick={() => {
                  rec.discard();
                  prepare();
                }}
              >
                Retake
              </button>
              <button type="button" className="btn btn-secondary" disabled={!!saving} onClick={rec.discard}>
                Discard
              </button>
              <span className="text-xs text-muted">
                {formatTime(rec.take.seconds)}
                {rec.take.camera ? " · screen + camera (2 clips)" : ""}
              </span>
            </>
          )}
        </div>
        {saving && (
          <div className="flex flex-col gap-1" aria-live="polite">
            <span className="text-sm">
              {saving.step}… {saving.pct < 100 ? `${saving.pct}%` : ""}
            </span>
            <progress className="h-1.5 w-full" value={saving.pct} max={100} aria-label={saving.step} />
          </div>
        )}
      </div>

      {/* devices and options */}
      <aside className="flex flex-col gap-3" aria-label="Recording options">
        {hasCamera && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Camera</span>
            <select className="field" value={cameraId} disabled={busy} onChange={(e) => setCameraId(e.target.value)}>
              <option value="">Default camera</option>
              {rec.devices.cameras.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Microphone</span>
          <select className="field" value={micId} disabled={busy || (!mic && mode !== "voice" && mode !== "camera")} onChange={(e) => setMicId(e.target.value)}>
            <option value="">Default microphone</option>
            {rec.devices.mics.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        {live && (
          <div className="flex items-center gap-2 text-xs text-muted" aria-label="Microphone level">
            <Icon name="mic" className="size-4" />
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-raised">
              <span className="block h-full rounded bg-emerald-400" style={{ width: `${Math.round(rec.level * 100)}%` }} />
            </span>
          </div>
        )}
        {hasScreen && <Switch label="Record my microphone" checked={mic} onCheckedChange={setMic} disabled={busy} />}
        {hasScreen && <Switch label="Include tab / computer sound" checked={systemAudio} onCheckedChange={setSystemAudio} disabled={busy} />}
        {hasCamera && <Switch label="Mirror my camera (preview)" checked={mirror} onCheckedChange={setMirror} />}
        {mode === "screenCamera" && <Switch label="Camera as a round bubble" checked={bubble} onCheckedChange={setBubble} />}
        {(rec.phase === "ready" || rec.phase === "idle") && (hasScreen || hasCamera) && <p className="-mt-1 text-[0.6875rem] text-muted">Changed a device? Click “{hasScreen ? "Change screen" : "Turn on camera"}” again.</p>}
        {hasCamera && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Script (read-along, optional)</span>
            <textarea className="field min-h-24 resize-y py-1.5 text-sm" value={script} onChange={(e) => setScript(e.target.value)} placeholder="Paste what you want to say. It scrolls on top of the preview while you record." maxLength={5000} />
          </label>
        )}
        {hasCamera && script.trim() && (
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted">Scroll speed</span>
            <input type="range" min={0.3} max={3} step={0.1} value={scrollSpeed} onChange={(e) => setScrollSpeed(Number(e.target.value))} className="w-32 accent-[var(--color-primary)]" aria-label="Script scroll speed" />
          </label>
        )}
        <p className="text-[0.6875rem] text-muted">Everything stays on this computer. Recordings are saved to My Assets.</p>
      </aside>
    </div>
  );
}

/** "Record": camera, screen, screen + camera or voice, straight onto the timeline. */
export function RecordDialog({ open, onClose, initialMode = "camera", maxSeconds, onAdd }: { open: boolean; onClose: () => void; initialMode?: RecordMode; maxSeconds: number; onAdd: (r: Recorded) => void }) {
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (busy && !window.confirm("A recording is running or being saved. Stop and close?")) return;
    setBusy(false);
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title="Record" size="lg">
      <RecordStudio
        key={initialMode}
        initialMode={initialMode}
        maxSeconds={maxSeconds}
        onBusy={setBusy}
        onAdd={(r) => {
          setBusy(false);
          onAdd(r);
          onClose();
        }}
      />
    </Dialog>
  );
}
