"use client";

import { Icon } from "@/components/ui/Icon";
import { formatTime } from "@/lib/format";

/** Player bar under the preview (as in the mockup). */
export function VideoControls(p: {
  playing: boolean;
  canPlay: boolean;
  time: number;
  duration: number;
  fps: number;
  muted: boolean;
  loop: boolean;
  hasAudio: boolean;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onStep: (frames: number) => void;
  onToggleMute: () => void;
  onToggleLoop: () => void;
  onFullscreen: () => void;
  fullscreen?: boolean;
  /** "timeline": in the timeline's toolbar (as in Clideo): previous, play, next and the time; no position slider to see. */
  variant?: "bar" | "timeline";
}) {
  const inTimeline = p.variant === "timeline";
  const step = 1 / p.fps;
  const max = Math.max(0, p.duration - step);
  const value = Math.min(p.time, max);
  const btn = "flex size-hit shrink-0 items-center justify-center rounded-md text-ink hover:bg-raised disabled:opacity-40";
  return (
    <div
      role="group"
      aria-label="Video controls"
      data-variant={p.variant ?? "bar"}
      className={
        inTimeline
          ? "relative flex items-center gap-0.5 text-ink [&_button]:size-8"
          : "on-dark relative z-30 flex items-center gap-1 border-t border-line bg-preview-bar px-2 py-0.5 text-ink"
      }
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      {inTimeline && (
        <button type="button" className={btn} onClick={() => p.onStep(-1)} disabled={!p.canPlay} aria-label="Previous frame">
          <Icon name="prevFrame" className="size-4" />
        </button>
      )}
      <button
        type="button"
        className={inTimeline ? `${btn} rounded-full! bg-raised hover:bg-hover` : btn}
        onClick={p.onTogglePlay}
        disabled={!p.canPlay}
        aria-label={p.playing ? "Pause" : "Play"}
      >
        <Icon name={p.playing ? "pause" : "play"} className="size-4" />
      </button>
      {inTimeline && (
        <button type="button" className={btn} onClick={() => p.onStep(1)} disabled={!p.canPlay} aria-label="Next frame">
          <Icon name="nextFrame" className="size-4" />
        </button>
      )}
      <input
        type="range"
        className={inTimeline ? "sr-only" : "range min-w-16 flex-1"}
        aria-label="Video position"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${formatTime(p.time)} of ${formatTime(p.duration)}`}
        style={{ ["--fill" as string]: `${max ? (value / max) * 100 : 0}%` }}
        onChange={(e) => p.onSeek(Number(e.target.value))}
      />
      <span className="shrink-0 px-1 text-xs tabular-nums text-muted" aria-hidden="true">
        {formatTime(p.time)} / {formatTime(p.duration)}
      </span>
      {!inTimeline && (
        <>
          <button type="button" className={`${btn} max-sm:hidden`} onClick={() => p.onStep(-1)} aria-label="Previous frame">
            <Icon name="prevFrame" className="size-4" />
          </button>
          <button type="button" className={`${btn} max-sm:hidden`} onClick={() => p.onStep(1)} aria-label="Next frame">
            <Icon name="nextFrame" className="size-4" />
          </button>
        </>
      )}
      {inTimeline && <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />}
      <button
        type="button"
        className={`${btn} ${p.muted ? "text-warn-line opacity-80" : ""}`}
        onClick={p.onToggleMute}
        aria-pressed={!p.muted}
        aria-label={p.muted ? "Volume is OFF (Turn ON)" : "Volume is ON (Turn OFF)"}
        title={p.muted ? "Volume is OFF (Click to turn ON)" : "Volume is ON (Click to turn OFF)"}
      >
        <Icon name={p.muted ? "mute" : "volume"} className="size-4.5" />
      </button>
      <button type="button" className={`${btn} max-sm:hidden ${p.loop ? "text-link" : "opacity-60"}`} onClick={p.onToggleLoop} aria-pressed={p.loop} aria-label="Loop">
        <Icon name="loop" className="size-4.5" />
      </button>
      <button type="button" className={btn} onClick={p.onFullscreen} aria-label={p.fullscreen ? "Exit full screen" : "Full screen"}>
        <Icon name="fullscreen" className="size-4.5" />
      </button>
    </div>
  );
}
