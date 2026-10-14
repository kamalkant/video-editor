"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { isWebKitUA } from "@/lib/embed/snippet";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { Tip } from "@/components/ui/Tip";
import { makeAlphaView } from "@/lib/editor/alphaViews";
import type { Clock } from "@/lib/editor/clock";
import { nextKept, timelineDuration, toSource, toTimeline, wholeClip, type Segment } from "@/lib/edit/timeline";
import { LiveKeyRenderer, type LiveKeyParams } from "@/lib/editor/liveKey";
import { clientToSource } from "@/lib/editor/pointerToSource";
import { sampleColorFromSource, type SampledKeyColor } from "@/lib/editor/sampleColor";
import type { PreviewResult } from "@/lib/editor/usePreview";
import { formatTime } from "@/lib/format";
import { Magnifier } from "./Magnifier";
import { SplitHandle } from "./SplitHandle";
import type { Bg, BgMedia } from "./BackgroundSwatches";
export type { Bg };
import { VideoControls } from "./VideoControls";
import { readPreviewMuted, writePreviewMuted } from "@/lib/editor/previewSound";
import { setLevel, soundLevel } from "@/lib/player/sound";

export type View = "original" | "split" | "removed" | "alpha" | "final";

export type FinalFiles = { webmUrl: string; movUrl: string; posterUrl?: string };

/** What the timeline and keyboard shortcuts can ask the player to do (times in source seconds). */
export type PlayerApi = {
  seek: (sourceT: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  step: (frames: number) => void;
  getVideoElement?: (clipId?: string) => HTMLVideoElement | null;
};

const noop = () => () => {};
const BG_CLASS: Record<Exclude<Bg, "custom">, string> = { checker: "bg-checker", white: "bg-white", black: "bg-black", image: "bg-checker", video: "bg-checker" };

type Exact = { result: PreviewResult | null; pending: boolean; busy: boolean; error: string | null; typicalMs: number; retry: () => void };

export function PreviewPane(p: {
  videoId: string;
  /** Size of the preview images (source size, capped at 1920 wide). */
  size: { width: number; height: number };
  duration: number;
  fps: number;
  hasAudio: boolean;
  live: LiveKeyParams;
  /** Background removal switched on? When off, every view shows the original video. */
  removalOn: boolean;
  exact: Exact;
  edgeOpsActive: boolean;
  view: View;
  onViewChange: (v: View) => void;
  picking: boolean;
  detectedKey?: string | null;
  onPick: (pt: { x: number; y: number }, t: number, clientSample?: SampledKeyColor | null) => void;
  onCancelPick: () => void;
  /** Reports the paused time (for the exact frame), or null while playing. */
  onPausedTimeChange: (t: number | null) => void;
  bg: Bg;
  custom: string;
  /** "Crop empty area" box in source pixels, drawn as a dashed frame. */
  cropBox?: { box: { x: number; y: number; w: number; h: number }; frame: { w: number; h: number } } | null;
  /** Picture or video behind the avatar (preview only). */
  bgMedia?: BgMedia;
  highlight: boolean;
  /** The exported files, once an export has finished (enables the "Final file" view). */
  final: FinalFiles | null;
  /** Fill the parent's height (desktop editor); otherwise the width decides the size. */
  fit?: boolean;
  /** Use lightweight 720p proxy for preview playback. */
  proxyMode?: boolean;
  /**
   * The file itself, from this computer (lib/media/localMedia): it plays from here, no server download.
   * With proxies on, the server's light copy is used once the file is there.
   */
  localSrc?: string | null;
  /** Playhead time, for the timeline. */
  clock?: Clock;
  /** Lets the timeline and shortcuts control playback. */
  playerRef?: React.RefObject<PlayerApi | null>;
  /** The kept parts of the clip (source times). Playback jumps over what was cut. */
  segments?: Segment[];
  /** Shown at the start of the view toolbar (e.g. the Program / This clip switch). */
  toolbarStart?: React.ReactNode;
  /** AI Removal is on (no live GPU key: the live layer needs the packed preview). */
  aiMode?: boolean;
  /** AI Removal's playing preview: picture on top, mask underneath, in one video. */
  packedSrc?: string | null;
  /** The clip's sound settings (volume 0–200%, clip / Video 1 mute, fades over its in–out): the clip view plays it like the program view. */
  sound?: { volume: number; muted: boolean; fadeIn: number; fadeOut: number; in: number; out: number };
  /** "Blur background" strength (source pixels): the live result shows a blurred copy behind the subject. */
  blurBehind?: number | null;
}) {
  const { bg, custom, highlight } = p;
  const [zoom, setZoom] = useState<"1" | "2" | "4">("1");
  const [split, setSplit] = useState(50);
  const [comparing, setComparing] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [derived, setDerived] = useState<{ key: string; url: string } | null>(null);
  const [videoState, setVideoState] = useState<"loading" | "ok" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  // sound on by default (a mute is remembered)
  const [muted, setMuted] = useState(readPreviewMuted);
  const [loop, setLoop] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  // the clip's loudness (volume, mutes, fades), the same as the program view and the export
  const soundRef = useRef(p.sound);
  const mutedRef = useRef(muted);
  const applySound = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const s = soundRef.current;
    setLevel(v, mutedRef.current || s?.muted ? 0 : s ? soundLevel(s, v.currentTime - s.in, s.out - s.in) : 1);
  }, []);
  useEffect(() => {
    soundRef.current = p.sound;
    mutedRef.current = muted;
    applySound();
  }, [p.sound, muted, applySound]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fallbackImgRef = useRef<HTMLImageElement>(null);
  const renderer = useRef<LiveKeyRenderer | null>(null);
  const retried = useRef(0);
  const view: View = comparing ? "original" : p.view;
  const aspect = `${p.size.width} / ${p.size.height}`;
  const liveRef = useRef(p.live);
  const clockRef = useRef(p.clock);
  const segs = p.segments?.length ? p.segments : wholeClip(p.duration);
  const segsRef = useRef(segs);
  const loopRef = useRef(true);
  // latest handlers for the player API (set after each render)
  const stepRef = useRef<(n: number) => void>(() => {});
  const togglePlayRef = useRef<() => void>(() => {});
  const cut = segs.length > 1 || segs[0].in > 0.5 / p.fps || segs[0].out < p.duration - 0.5 / p.fps;
  const modeRef = useRef<"result" | "alpha">("result");
  const onPaused = useRef(p.onPausedTimeChange);
  const fpsRef = useRef(p.fps);
  useEffect(() => {
    segsRef.current = segs;
    fpsRef.current = p.fps;
    loopRef.current = loop;
    liveRef.current = p.live;
    modeRef.current = view === "alpha" ? "alpha" : "result";
    onPaused.current = p.onPausedTimeChange;
  });
  const clock = p.clock;

  const fallback = videoState === "error";
  const packed = !!p.packedSrc;
  // AI Removal without its playing preview yet: no live layer, the exact frame shows when paused
  const liveOk = !p.aiMode || packed;
  const resumeAt = useRef(0);
  const webkit = useSyncExternalStore(noop, () => isWebKitUA(navigator.userAgent, navigator.platform, navigator.maxTouchPoints), () => false);
  const resultUrl = p.exact.result?.url ?? null;
  const derivedMode = view === "alpha" ? "mask" : highlight && view !== "original" && view !== "final" ? "highlight" : null;

  // alpha mask / highlight for the exact frame, computed in the browser from the FFmpeg PNG
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    if (!resultUrl || !derivedMode) return;
    const key = `${derivedMode}|${resultUrl}`;
    void makeAlphaView(resultUrl, derivedMode).then((u) => {
      made = u;
      if (alive) setDerived({ key, url: u });
      else URL.revokeObjectURL(u);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [resultUrl, derivedMode]);
  const exactUrl = derivedMode ? (derived?.key === `${derivedMode}|${resultUrl}` ? derived.url : null) : resultUrl;

  // live GPU key: redraw on every new video frame, and after seeks
  useEffect(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    renderer.current ??= LiveKeyRenderer.create(c);
    const r = renderer.current;
    if (!r) return;
    let stop = false;
    let handle = 0;
    const rvfc = "requestVideoFrameCallback" in v;
    const draw = () => {
      // playing over a cut part: jump to the next kept part (or back to the start / stop at the end)
      if (!v.paused && !v.seeking) {
        const sg = segsRef.current;
        const next = nextKept(sg, v.currentTime);
        if (next === null) {
          if (loopRef.current) v.currentTime = sg[0].in;
          else {
            v.pause();
            v.currentTime = Math.max(sg[sg.length - 1].in, sg[sg.length - 1].out - 1 / fpsRef.current);
          }
        } else if (next > v.currentTime + 0.001) v.currentTime = next;
      }
      r.render(v, liveRef.current, modeRef.current);
      clockRef.current?.set(v.currentTime);
    };
    const loopFn = () => {
      if (stop) return;
      draw();
      handle = rvfc ? v.requestVideoFrameCallback(loopFn) : requestAnimationFrame(loopFn);
    };
    loopFn();
    v.addEventListener("seeked", draw);
    v.addEventListener("loadeddata", draw);
    return () => {
      stop = true;
      if (rvfc) v.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      v.removeEventListener("seeked", draw);
      v.removeEventListener("loadeddata", draw);
    };
  }, []);

  // settings changed while paused: redraw the live layer once
  const liveKey = JSON.stringify(p.live) + view;
  useEffect(() => {
    const v = videoRef.current;
    if (v && renderer.current) renderer.current.render(v, liveRef.current, modeRef.current);
  }, [liveKey]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // full screen: the frame fills the screen and the picture is fitted and centered in it
  useEffect(() => {
    const onChange = () => setIsFull(!!frameRef.current && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // hold the \ key to see the original
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => e.key === "\\" && !typing(e) && setComparing(true);
    const up = (e: KeyboardEvent) => e.key === "\\" && setComparing(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!p.picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onCancelPick();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.picking, p]);

  const seek = useCallback(
    (t: number) => {
      // only kept parts can be shown: a time inside a cut moves to the next kept frame
      const sg = segsRef.current;
      const kept = nextKept(sg, Math.max(0, t)) ?? sg[sg.length - 1].out - 1 / p.fps;
      const clamped = Math.min(Math.max(0, kept), Math.max(0, p.duration - 1 / p.fps));
      // the playhead moves at once (a split right after a click must use the new time)
      clockRef.current?.set(clamped);
      const v = videoRef.current;
      if (fallback || !v) {
        setTime(clamped);
        onPaused.current(clamped);
        return;
      }
      v.pause();
      v.currentTime = clamped;
    },
    [fallback, p.duration, p.fps],
  );

  useEffect(() => {
    clockRef.current = clock;
  });
  // timeline time of the playhead, and the length of what's kept
  const tlTime = toTimeline(segs, time) ?? toTimeline(segs, nextKept(segs, time) ?? segs[segs.length - 1].out - 1 / p.fps) ?? 0;
  const tlDuration = timelineDuration(segs);
  const stepFrames = (n: number) => seek(toSource(segs, Math.min(Math.max(0, tlTime + n / p.fps), Math.max(0, tlDuration - 1 / p.fps))));

  useImperativeHandle(
    p.playerRef,
    () => ({
      seek,
      toggle: () => togglePlayRef.current(),
      play: () => {
        const v = videoRef.current;
        if (v && !fallback && v.paused) void v.play().catch(() => undefined);
      },
      pause: () => videoRef.current?.pause(),
      step: (n: number) => stepRef.current(n),
    }),
    [seek, fallback],
  );

  // parts were cut while paused on them: move the playhead to what's left
  const segKey = JSON.stringify(segs);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.paused || videoState !== "ok") return;
    if (nextKept(segsRef.current, v.currentTime) !== v.currentTime) seek(v.currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKey, videoState]);

  const getMagnifierSource = useCallback(() => (fallback ? fallbackImgRef.current : videoRef.current), [fallback]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || fallback) return;
    if (v.paused) {
      // at the end of what's kept: start again from the beginning
      if (nextKept(segsRef.current, v.currentTime + 1.5 / p.fps) === null) v.currentTime = segsRef.current[0].in;
      void v.play().catch(() => undefined);
    } else v.pause();
  };
  useEffect(() => {
    togglePlayRef.current = togglePlay;
    stepRef.current = stepFrames;
  });

  const onStagePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!p.picking) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = clientToSource(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), p.size);
    setHover(pt ? { ...pt, px: e.clientX - rect.left, py: e.clientY - rect.top } : null);
  };

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!p.picking) return;
    const pt = clientToSource(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), p.size);
    if (!pt) return;
    setHover(null);
    const source = fallback ? fallbackImgRef.current : videoRef.current;
    const clientSample = sampleColorFromSource(source, pt, p.size, p.detectedKey);
    p.onPick(pt, fallback ? time : videoRef.current?.currentTime ?? time, clientSample);
  };

  const isFinal = view === "final" && !!p.final;
  const showRemoved = view !== "original" && !isFinal && p.removalOn;
  const blurLive = !!p.blurBehind && view === "removed" && p.removalOn && liveOk;
  const originalVisible = !isFinal && (view === "original" || view === "split" || !p.removalOn || (!liveOk && playing) || blurLive);
  const showExact = showRemoved && !playing && !!exactUrl && !p.exact.pending && (!derivedMode || !!exactUrl);
  const removedClip = view === "split" ? `inset(0 0 0 ${split}%)` : undefined;
  const originalClip = view === "split" && p.removalOn ? `inset(0 ${100 - split}% 0 0)` : undefined;
  const pixelated = zoom === "4" ? ("pixelated" as const) : undefined;
  const waitMsg = p.exact.typicalMs > 1500 ? `about ${Math.round(p.exact.typicalMs / 1000)} seconds` : "about a second";

  let caption: string;
  if (isFinal) caption = `Final file · ${webkit ? "Safari file (.mov, HEVC + alpha)" : "Chrome file (.webm, VP9 + alpha)"}, exactly what your website will play`;
  else if (comparing) caption = "Original (release to go back)";
  else if (view === "original") caption = `Original video · ${formatTime(tlTime)}`;
  else if (!p.removalOn) caption = `Background removal is off · showing the original video · ${formatTime(tlTime)}`;
  else if (playing && !liveOk) caption = "Playing the original · the AI preview video is still being made; pause for the exact AI frame";
  else if (playing) caption = p.aiMode ? "AI preview while playing · pause for the exact frame" : "Live preview (very close to the final file) · pause for the exact frame";
  else if (showExact) caption = `Exact frame ${formatTime(toTimeline(segs, p.exact.result?.stats.t ?? time) ?? tlTime)} (before compression)`;
  else caption = `Live preview · exact frame in ${waitMsg}`;

  return (
    <figure className={`m-0 flex min-w-0 flex-col ${p.fit ? "h-full min-h-0" : ""}`} aria-labelledby="preview-caption" aria-busy={p.exact.busy}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-1.5 border-b border-line px-2 text-xs">
        <div className="flex items-center gap-1.5 shrink-0">
          {p.toolbarStart}
          <SegmentedControl<View>
            legend="Preview view"
            legendHidden
            variant="tabs"
            size="sm"
            fill={false}
            name="view"
            value={p.view}
            onChange={p.onViewChange}
            options={[
              {
                value: "removed",
                label: (
                  <span className="flex items-center gap-1">
                    <Icon name="wand" className="size-3.5" />
                    <span className="sr-only">Result</span>
                  </span>
                ),
                title: "Result (Background removed)",
              },
              {
                value: "original",
                label: (
                  <span className="flex items-center gap-1">
                    <Icon name="video" className="size-3.5" />
                    <span className="sr-only">Original</span>
                  </span>
                ),
                title: "Original video",
              },
              {
                value: "split",
                label: (
                  <span className="flex items-center gap-1">
                    <Icon name="compare" className="size-3.5" />
                    <span className="sr-only">Before / After</span>
                  </span>
                ),
                title: "Before / After (Split slider)",
              },
              {
                value: "alpha",
                label: (
                  <span className="flex items-center gap-1">
                    <Icon name="alpha" className="size-3.5" />
                    <span className="sr-only">Alpha mask</span>
                  </span>
                ),
                title: "Alpha mask (White = solid, black = transparent)",
              },
              ...(p.final
                ? [
                    {
                      value: "final" as const,
                      label: (
                        <span className="flex items-center gap-1">
                          <Icon name="check" className="size-3.5" />
                          <span className="sr-only">Final file</span>
                        </span>
                      ),
                      title: "Final exported video",
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {p.view !== "original" && p.view !== "final" && (
            <Tip text="Hold to see original (\ key)" side="bottom" align="right">
              <button
                type="button"
                className={`flex size-7 items-center justify-center rounded-md border select-none ${
                  comparing
                    ? "border-primary bg-primary-soft text-ink"
                    : "border-control bg-raised text-muted hover:border-control hover:text-ink hover:bg-hover"
                }`}
                aria-pressed={comparing}
                aria-label="Hold to see original"
                onPointerDown={() => setComparing(true)}
                onPointerUp={() => setComparing(false)}
                onPointerLeave={() => setComparing(false)}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setComparing(true)}
                onKeyUp={() => setComparing(false)}
              >
                <Icon name="compare" className="size-3.5" />
                <span className="sr-only">Hold to compare</span>
              </button>
            </Tip>
          )}
          <SegmentedControl<"1" | "2" | "4">
            legend="Zoom"
            legendHidden
            variant="tabs"
            size="sm"
            fill={false}
            name="zoom"
            value={zoom}
            onChange={setZoom}
            options={(["1", "2", "4"] as const).map((z) => ({ value: z, label: <><span aria-hidden="true">{z}×</span><span className="sr-only">Zoom {z} times</span></> }))}
          />
        </span>
      </div>

      <div ref={frameRef} data-testid="preview-frame" className={`group relative flex flex-col bg-[#0c1527] ${isFull ? "h-full w-full" : p.fit ? "min-h-0 flex-1" : ""}`}>
      <div
        tabIndex={0}
        aria-label="Preview. Space plays or pauses. Scroll to look around when zoomed."
        onKeyDown={(e) => {
          if (e.key === " " && e.target === e.currentTarget) {
            e.preventDefault();
            togglePlay();
          }
        }}
        className={`on-dark relative flex overflow-auto ${isFull || p.fit ? "min-h-0 flex-1 [container-type:size]" : "max-h-[70vh] [container-type:inline-size]"}`}
      >
        {/* m-auto centers the picture and still lets a zoomed picture scroll to every edge */}
        <div
          ref={stageRef}
          data-testid="preview-stage"
          className={`relative m-auto shrink-0 ${bg === "custom" ? "" : BG_CLASS[bg]} ${p.picking ? "cursor-crosshair" : ""}`}
          style={{
            width: isFull || p.fit ? `calc(${Number(zoom)} * min(100cqw, 100cqh * ${aspect}))` : `${Number(zoom) * 100}%`,
            aspectRatio: aspect,
            ...(bg === "custom" ? { background: custom } : {}),
            ...(bg === "image" && p.bgMedia?.kind === "image" ? { backgroundImage: `url(${p.bgMedia.url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
          }}
          onPointerMove={onStagePointer}
          onPointerLeave={() => setHover(null)}
          onClick={onStageClick}
        >
          {bg === "video" && p.bgMedia?.kind === "video" && (
            <video data-testid="bg-video" src={p.bgMedia.url} className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline aria-hidden="true" />
          )}
          {/* original: the playing video (or a still frame if this browser can't play the file) */}
          {fallback ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={fallbackImgRef} src={`/api/videos/${p.videoId}/frame?t=${time.toFixed(3)}`} alt="Original frame" className="absolute inset-0 size-full" draggable={false} style={{ clipPath: originalClip, opacity: originalVisible ? 1 : 0, imageRendering: pixelated }} />
          ) : null}
          {/* the packed AI preview is twice as tall (mask underneath): show only its top half here */}
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: originalClip, opacity: fallback ? 0 : originalVisible ? 1 : 0, filter: blurLive ? `blur(${Math.max(1, ((p.blurBehind ?? 0) * (stageWidth || p.size.width)) / p.size.width).toFixed(1)}px)` : undefined }}>
          <video
            ref={videoRef}
            src={p.packedSrc ?? p.localSrc ?? (p.proxyMode ? `/api/videos/${p.videoId}/proxy` : `/api/videos/${p.videoId}/play`)}
            className="absolute left-0 top-0 w-full"
            style={{ height: packed ? "200%" : "100%", imageRendering: pixelated }}
            loop={loop && !cut}
            playsInline
            preload="auto"
            aria-label="Original video"
            onLoadedMetadata={() => {
              setVideoState("ok");
              const v = videoRef.current;
              // switching to the AI preview video keeps the playhead where it was
              if (v && resumeAt.current > 0) {
                v.currentTime = Math.min(resumeAt.current, Math.max(0, v.duration - 0.05));
                resumeAt.current = 0;
              }
              onPaused.current(v?.currentTime ?? 0);
            }}
            onEmptied={() => {
              if (time > 0) resumeAt.current = time;
            }}
            onError={() => {
              // one retry (e.g. a slow first request), then fall back to still frames
              const v = videoRef.current;
              if (v && retried.current < 1) {
                retried.current++;
                setTimeout(() => v.load(), 800);
                return;
              }
              setVideoState("error");
              onPaused.current(time);
            }}
            onPlay={() => {
              setPlaying(true);
              onPaused.current(null);
            }}
            onPause={() => {
              setPlaying(false);
              onPaused.current(videoRef.current?.currentTime ?? 0);
            }}
            onSeeked={() => {
              const v = videoRef.current;
              if (!v) return;
              setTime(v.currentTime);
              if (v.paused) onPaused.current(v.currentTime);
            }}
            onTimeUpdate={() => {
              const t = videoRef.current?.currentTime ?? 0;
              setTime(t);
              clockRef.current?.set(t);
              applySound();
            }}
          />
          </div>
          {/* removed: live GPU layer while playing, exact FFmpeg frame when paused */}
          <canvas
            ref={canvasRef}
            data-testid="live-canvas"
            aria-hidden="true"
            className="absolute inset-0 size-full"
            style={{ clipPath: removedClip, visibility: showRemoved && !showExact && !fallback && liveOk ? "visible" : "hidden", imageRendering: pixelated }}
          />
          {showRemoved && showExact && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-testid="exact-frame"
              src={exactUrl!}
              alt={view === "alpha" ? "Alpha mask: white is solid, black is transparent" : "Exact preview with the background removed"}
              className="absolute inset-0 size-full"
              draggable={false}
              style={{ clipPath: removedClip, imageRendering: pixelated }}
            />
          )}
          {isFinal && (
            <video
              key={webkit ? "mov" : "webm"}
              data-testid="final-video"
              src={webkit ? p.final!.movUrl : p.final!.webmUrl}
              poster={p.final!.posterUrl}
              className="absolute inset-0 z-10 size-full"
              autoPlay
              muted
              loop
              playsInline
              aria-label="Exported transparent video"
            />
          )}
          {p.cropBox && !isFinal && (view !== "original" || !p.removalOn) && (
            <span
              aria-hidden="true"
              data-testid="crop-box"
              className="pointer-events-none absolute z-10 border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] outline outline-1 outline-black/60"
              style={{
                left: `${(100 * p.cropBox.box.x) / p.cropBox.frame.w}%`,
                top: `${(100 * p.cropBox.box.y) / p.cropBox.frame.h}%`,
                width: `${(100 * p.cropBox.box.w) / p.cropBox.frame.w}%`,
                height: `${(100 * p.cropBox.box.h) / p.cropBox.frame.h}%`,
              }}
            />
          )}
          {view === "split" && <SplitHandle value={split} onChange={setSplit} container={stageRef} />}
          {p.picking && (
            <span className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded-md bg-black/80 px-2 py-1 text-sm text-white">
              <Icon name="pipette" className="size-4" /> Click to pick color · Esc to cancel
            </span>
          )}
          {p.picking && <Magnifier getSource={getMagnifierSource} point={hover} box={p.size} stageWidth={stageWidth} />}
          {p.exact.busy && !playing && showRemoved && <span className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-black/80 px-3 py-1 text-sm text-white">Updating…</span>}
          {videoState === "loading" && (
            <span role="status" className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" data-testid="clip-loading">
              <span className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">
                <Spinner size="sm" /> Loading the clip…
              </span>
            </span>
          )}
        </div>
      </div>
        {!isFinal && <VideoControls
          playing={playing}
          canPlay={!fallback && videoState === "ok"}
          time={tlTime}
          duration={tlDuration}
          fps={p.fps}
          muted={muted}
          loop={loop}
          hasAudio={p.hasAudio}
          onTogglePlay={togglePlay}
          onSeek={(t) => seek(toSource(segs, t))}
          onStep={stepFrames}
          onToggleMute={() =>
            setMuted((m) => {
              writePreviewMuted(!m);
              return !m;
            })
          }
          onToggleLoop={() => setLoop((l) => !l)}
          fullscreen={isFull}
        onFullscreen={() => {
            const el = frameRef.current;
            if (!el) return;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void el.requestFullscreen?.().catch(() => undefined);
          }}
        />}

        {p.fit && (
          <figcaption
            id="preview-caption"
            className={`pointer-events-none absolute bottom-11 left-2 z-20 flex max-w-[80%] items-center gap-1.5 truncate rounded-md bg-black/75 px-2 py-0.5 text-[0.6875rem] text-white/80 backdrop-blur-sm shadow transition-opacity duration-200 ${
              p.exact.error ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
            aria-live="polite"
          >
            <span data-testid="preview-caption" className="truncate">{caption}</span>
            {p.exact.error && showRemoved && (
              <span className="pointer-events-auto text-red-400">
                {p.exact.error}{" "}
                <button type="button" className="underline" onClick={p.exact.retry}>
                  Try again
                </button>
              </span>
            )}
          </figcaption>
        )}
      </div>

      {!p.fit && (
        <figcaption id="preview-caption" className="flex min-h-6 flex-wrap items-center gap-x-3 px-3 py-1 text-xs text-muted" aria-live="polite">
          <span data-testid="preview-caption">{caption}</span>
          {p.edgeOpsActive && showRemoved && !showExact && <span>Edge and feather settings show on the exact frame.</span>}
          {fallback && <span>This browser can&apos;t play the file here, so the preview shows single frames.</span>}
          {highlight && showRemoved && <span className="font-medium text-ink">Pink = partly see-through (exact frame)</span>}
          {p.exact.error && showRemoved && (
            <span className="text-danger">
              {p.exact.error}{" "}
              <button type="button" className="underline" onClick={p.exact.retry}>
                Try again
              </button>
            </span>
          )}
        </figcaption>
      )}

    </figure>
  );
}
