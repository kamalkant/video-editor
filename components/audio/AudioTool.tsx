"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioToolById, type AudioToolId } from "@/lib/audio/tools/catalog";
import { canEncode, decodeAudio, encodeAudio, FORMATS, previewUrl, type AudioFormat } from "@/lib/audio/tools/encode";
import { duration, gain, integratedLoudness, peakDb, planNormalize, resample, toMono, trim, type Pcm } from "@/lib/audio/tools/pcm";

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
};
const stem = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, "") || "audio";

interface Source {
  name: string;
  size: number;
  pcm: Pcm;
}

interface Result {
  name: string;
  bytes: Uint8Array;
  mime: string;
  url: string;
  note?: string;
}

function download(r: Result) {
  const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: r.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = r.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ─── Waveform with an optional selection ─────────────────────────────────────

function Waveform({ pcm, range, onRange }: { pcm: Pcm; range?: [number, number]; onRange?: (r: [number, number]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const total = duration(pcm);
  const peaks = useMemo(() => {
    const W = 800;
    const ch = pcm.channels[0];
    const per = Math.max(1, Math.floor(ch.length / W));
    const out = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let m = 0;
      for (let i = x * per; i < Math.min(ch.length, (x + 1) * per); i++) m = Math.max(m, Math.abs(ch[i]));
      out[x] = m;
    }
    return out;
  }, [pcm]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const mid = c.height / 2;
    for (let x = 0; x < c.width; x++) {
      const t = (x / c.width) * total;
      const inside = !range || (t >= range[0] && t <= range[1]);
      g.fillStyle = inside ? "#8b80ff" : "#3b3f4c";
      const h = Math.max(1, peaks[Math.floor((x / c.width) * peaks.length)] * mid * 0.95);
      g.fillRect(x, mid - h, 1, h * 2);
    }
  }, [peaks, range, total]);

  const drag = useRef<0 | 1 | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total));
  };
  return (
    <div
      className="relative h-28 w-full touch-none select-none rounded-lg bg-canvas"
      onPointerDown={(e) => {
        if (!onRange || !range) return;
        const t = at(e);
        drag.current = Math.abs(t - range[0]) < Math.abs(t - range[1]) ? 0 : 1;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onRange(drag.current === 0 ? [Math.min(t, range[1] - 0.05), range[1]] : [range[0], Math.max(t, range[0] + 0.05)]);
      }}
      onPointerMove={(e) => {
        if (drag.current === null || !onRange || !range) return;
        const t = at(e);
        onRange(drag.current === 0 ? [Math.min(t, range[1] - 0.05), range[1]] : [range[0], Math.max(t, range[0] + 0.05)]);
      }}
      onPointerUp={() => (drag.current = null)}
      data-testid="waveform"
    >
      <canvas ref={canvas} className="h-full w-full" role="img" aria-label={`Waveform, ${fmtTime(total)} long`} />
      {range &&
        range.map((t, i) => (
          <span key={i} aria-hidden className="absolute top-0 h-full w-0.5 bg-warn-line" style={{ left: `${(t / total) * 100}%` }} />
        ))}
    </div>
  );
}

// ─── Recorder ────────────────────────────────────────────────────────────────

const REC_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

function Recorder({ onDone }: { onDone: (s: Source) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "reading">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; started: number } | null>(null);

  const stopAll = () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    cancelAnimationFrame(r.raf);
    r.stream.getTracks().forEach((t) => t.stop());
    if (r.ctx.state !== "closed") void r.ctx.close();
  };
  useEffect(() => () => stopAll(), []);

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === "NotAllowedError" ? "The browser blocked the microphone. Allow it in the address bar, then try again." : name === "NotFoundError" ? "No microphone was found." : "The microphone could not be started.");
      return;
    }
    const type = REC_TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stopAll();
      setState("reading");
      try {
        const blob = new Blob(chunks, { type: mr.mimeType });
        const pcm = await decodeAudio(await blob.arrayBuffer());
        onDone({ name: `Recording ${new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/[/:,]/g, "-")}`, size: blob.size, pcm });
      } catch (e) {
        setError((e as Error).message);
      }
      setState("idle");
    };
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      const r = rec.current;
      if (!r) return;
      setLevel(peak);
      setSeconds((performance.now() - r.started) / 1000);
      r.raf = requestAnimationFrame(loop);
    };
    rec.current = { mr, stream, ctx, raf: 0, started: performance.now() };
    mr.start(250);
    setState("recording");
    loop();
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-4">
        {state === "recording" ? (
          <button className="btn btn-danger" onClick={() => rec.current?.mr.stop()} data-testid="stop-recording">
            ■ Stop
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => void start()} disabled={state === "reading"} data-testid="start-recording">
            ● Record
          </button>
        )}
        <span className="font-mono text-lg tabular-nums" aria-live="off">
          {fmtTime(state === "recording" ? seconds : 0)}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <div className={`h-full ${level > 0.9 ? "bg-danger" : "bg-on"}`} style={{ width: `${Math.min(100, level * 100)}%`, transition: "width 60ms" }} />
        </div>
      </div>
      {state === "reading" && <p className="text-sm text-muted">Reading the recording…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">Recorded in your browser; nothing is uploaded. Echo cancellation and noise suppression are on.</p>
    </div>
  );
}

// ─── The tool ────────────────────────────────────────────────────────────────

export function AudioTool({ id }: { id: AudioToolId }) {
  const tool = audioToolById(id)!;
  const [src, setSrc] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [supported, setSupported] = useState<Record<AudioFormat, boolean>>({ mp3: true, wav: true, webm: false, m4a: false });

  const [format, setFormat] = useState<AudioFormat>(id === "compress" ? "mp3" : id === "record" ? "mp3" : "mp3");
  const [kbps, setKbps] = useState(id === "compress" ? 96 : 192);
  const [mono, setMono] = useState(id === "compress");
  const [rate, setRate] = useState<0 | 44100 | 22050>(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [fades, setFades] = useState<[number, number]>([0, 0]);
  const [target, setTarget] = useState(-14);
  const [loudness, setLoudness] = useState<{ lufs: number; peak: number } | null>(null);

  useEffect(() => {
    void Promise.all((["webm", "m4a"] as const).map(async (f) => [f, await canEncode(f)] as const)).then((r) => setSupported((s) => ({ ...s, ...Object.fromEntries(r) })));
  }, []);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const accept = useCallback((s: Source) => {
    setSrc(s);
    setResult(null);
    setError(null);
    setRange([0, duration(s.pcm)]);
    setLoudness(id === "normalize" ? { lufs: integratedLoudness(s.pcm), peak: peakDb(s.pcm) } : null);
  }, [id]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      accept({ name: file.name, size: file.size, pcm: await decodeAudio(await file.arrayBuffer()) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const run = async () => {
    if (!src) return;
    setBusy(0);
    setError(null);
    try {
      let pcm = src.pcm;
      let note: string | undefined;
      if (id === "trim") pcm = trim(pcm, range[0], range[1], fades[0], fades[1]);
      if (id === "normalize") {
        const plan = planNormalize(pcm, target);
        pcm = gain(pcm, plan.gain);
        note = `${plan.before.toFixed(1)} → ${plan.after.toFixed(1)} LUFS (${plan.gain >= 0 ? "+" : ""}${plan.gain.toFixed(1)} dB)${plan.limitedByPeak ? ". Held back so the loudest peak stays under −1 dB: no clipping." : "."}`;
      }
      if (id === "compress") {
        if (mono) pcm = toMono(pcm);
        if (rate) pcm = resample(pcm, rate);
      }
      const bytes = await encodeAudio(pcm, format, kbps, (f) => setBusy(f));
      const f = FORMATS[format];
      if (id === "compress") note = `${fmtBytes(src.size)} → ${fmtBytes(bytes.length)} (${Math.round((1 - bytes.length / src.size) * 100)}% smaller)`;
      const suffix = id === "trim" ? "-trimmed" : id === "normalize" ? "-normalized" : id === "compress" ? "-small" : "";
      setResult({ name: `${stem(src.name)}${suffix}.${f.ext}`, bytes, mime: f.mime, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.mime })), note });
    } catch (e) {
      setError(`It could not be saved: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const preview = useMemo(() => (src ? previewUrl(src.pcm) : null), [src]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const formatOptions = (Object.keys(FORMATS) as AudioFormat[]).filter((f) => supported[f]);

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <p className="text-sm text-muted">
        <Link href="/audio" className="text-link hover:underline">
          Audio tools
        </Link>{" "}
        / {tool.title}
      </p>
      <header>
        <h1 className="text-2xl font-bold">{tool.title}</h1>
        <p className="mt-1 text-muted">{tool.description}</p>
      </header>

      {!src && id === "record" && <Recorder onDone={accept} />}
      {!src && id !== "record" && (
        <label
          className="card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-control py-10 text-center hover:bg-hover"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void pick(e.dataTransfer.files[0]);
          }}
        >
          <span className="font-semibold">{loading ? "Reading…" : "Choose a sound or video file"}</span>
          <span className="text-sm text-muted">MP3, WAV, M4A, AAC, OGG, WebM, FLAC, or the sound of an MP4 video. Nothing is uploaded.</span>
          <input type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.webm,.flac,.mp4,.mov" className="sr-only" data-testid="audio-input" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      )}

      {src && (
        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold" data-testid="source-name">
                {src.name}
              </p>
              <p className="text-sm text-muted">
                {fmtTime(duration(src.pcm))} · {src.pcm.channels.length === 1 ? "mono" : "stereo"} · {(src.pcm.sampleRate / 1000).toFixed(1)} kHz · {fmtBytes(src.size)}
              </p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSrc(null);
                setResult(null);
              }}
            >
              {id === "record" ? "Record again" : "Change file"}
            </button>
          </div>
          {preview && <audio controls src={preview} className="w-full" aria-label="Listen to the original" />}

          {id === "trim" && (
            <>
              <Waveform pcm={src.pcm} range={range} onRange={setRange} />
              <div className="grid gap-3 sm:grid-cols-4">
                {(
                  [
                    ["Start (s)", range[0], (v: number) => setRange([Math.min(v, range[1] - 0.05), range[1]])],
                    ["End (s)", range[1], (v: number) => setRange([range[0], Math.max(v, range[0] + 0.05)])],
                    ["Fade in (s)", fades[0], (v: number) => setFades([v, fades[1]])],
                    ["Fade out (s)", fades[1], (v: number) => setFades([fades[0], v])],
                  ] as const
                ).map(([label, v, set]) => (
                  <label key={label} className="flex flex-col gap-1 text-sm text-muted">
                    {label}
                    <input className="field" type="number" min={0} max={duration(src.pcm)} step={0.1} value={Number(v.toFixed(2))} onChange={(e) => set(Math.max(0, Math.min(duration(src.pcm), +e.target.value || 0)))} />
                  </label>
                ))}
              </div>
              <p className="text-sm text-muted">Keeping {fmtTime(range[1] - range[0])}. Drag on the waveform to move the start or the end.</p>
            </>
          )}
          {id !== "trim" && id !== "record" && <Waveform pcm={src.pcm} />}

          {id === "normalize" && loudness && (
            <div className="space-y-2">
              <p className="text-sm">
                Now: <b>{Number.isFinite(loudness.lufs) ? `${loudness.lufs.toFixed(1)} LUFS` : "silent"}</b>, loudest peak {Number.isFinite(loudness.peak) ? `${loudness.peak.toFixed(1)} dB` : "—"}
              </p>
              <label className="flex flex-col gap-1 text-sm text-muted">
                Target loudness
                <select className="field" value={target} onChange={(e) => setTarget(+e.target.value)}>
                  <option value={-14}>−14 LUFS: YouTube, Spotify, Instagram</option>
                  <option value={-16}>−16 LUFS: podcasts, Apple</option>
                  <option value={-19}>−19 LUFS: quiet speech, audiobooks</option>
                  <option value={-23}>−23 LUFS: TV and radio (EBU R128)</option>
                </select>
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-muted">
              Save as
              <select className="field" value={format} onChange={(e) => setFormat(e.target.value as AudioFormat)} data-testid="format">
                {formatOptions.map((f) => (
                  <option key={f} value={f}>
                    {FORMATS[f].label}
                  </option>
                ))}
              </select>
              <span className="text-xs">{FORMATS[format].detail}</span>
            </label>
            {FORMATS[format].lossy && (
              <label className="flex flex-col gap-1 text-sm text-muted">
                Quality
                <select className="field" value={kbps} onChange={(e) => setKbps(+e.target.value)} data-testid="bitrate">
                  {[32, 48, 64, 96, 128, 160, 192, 256, 320].map((k) => (
                    <option key={k} value={k}>
                      {k} kbps{k <= 64 ? " (speech)" : k >= 256 ? " (highest)" : k === 192 ? " (music)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {id === "compress" && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} /> Mono (half the size; fine for speech)
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted">
                  Sample rate
                  <select className="field" value={rate} onChange={(e) => setRate(+e.target.value as 0 | 44100 | 22050)}>
                    <option value={0}>Keep ({(src.pcm.sampleRate / 1000).toFixed(1)} kHz)</option>
                    <option value={44100}>44.1 kHz</option>
                    <option value={22050}>22.05 kHz (speech)</option>
                  </select>
                </label>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={() => void run()} disabled={busy !== null} data-testid="run-audio">
              {busy !== null ? `Working… ${Math.round(busy * 100)}%` : id === "record" ? "Save recording" : id === "normalize" ? "Normalize" : id === "trim" ? "Trim" : id === "compress" ? "Compress" : "Convert"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="card text-sm text-danger">
          {error}
        </p>
      )}

      {result && (
        <section className="card space-y-3" data-testid="audio-result">
          <p className="font-semibold">Done: {result.name}</p>
          {result.note && <p className="text-sm text-muted">{result.note}</p>}
          <audio controls src={result.url} className="w-full" aria-label="Listen to the result" />
          <button className="btn btn-primary" onClick={() => download(result)} data-testid="download-audio">
            Download ({fmtBytes(result.bytes.length)})
          </button>
        </section>
      )}

      <p className="text-xs text-muted">
        Need more? Put the sound in the{" "}
        <Link href="/editor" className="text-link hover:underline">
          video editor
        </Link>{" "}
        to mix it with music, add captions or a picture.
      </p>
    </main>
  );
}
