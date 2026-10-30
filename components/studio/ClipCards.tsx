"use client";

import type { DenoiseLevel } from "@/lib/audio/denoise";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tip } from "@/components/ui/Tip";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TransformPanel } from "./TransformPanel";
import { LabeledSlider, SliderDensity } from "@/components/ui/LabeledSlider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import {
  CANVAS_PRESETS,
  NO_ANIM,
  type Anim,
  type AnyClip,
  type Canvas,
  type BlankClip,
  type ColorAdjust,
  type ElementClip,
  type ElementKind,
  type ElementLook,
  type TextClip,
  type Transform,
  resolveBlankFill,
} from "@/lib/edit/doc";
import { useResolvedTheme } from "@/lib/editor/theme";
import { elementName } from "@/lib/elements/catalog";
import { emojisIn } from "@/lib/elements/emoji";
import {
  BUBBLE_MASK,
  ColorSection,
  CropRotateSection,
  Fold,
  MaskSection,
  WatermarkSection,
} from "./LookSections";
import { LooksStrip } from "./LooksStrip";
import { cropForAspect } from "@/lib/player/look";
import { ANIM_LABELS, TEXT_ONLY_ANIMS } from "@/lib/player/anim";
import { TEXT_PRESETS } from "@/lib/text/layout";
import { FontPicker } from "./FontPicker";
import { RichTextField } from "./RichTextField";
import { useBrandKit } from "@/lib/editor/useBrand";
import { changedAreas, resetAllPatch, resetPatch, type ResetArea } from "@/lib/editor/clipReset";
import { clipLength, type MediaLite } from "@/lib/edit/doc";
import type { KeyframeOp } from "@/lib/edit/docEdit";
import { hasKeys, keyIndexAt, keysOf, motionAt, transformAt, visibleKeys, type MotionClip } from "@/lib/edit/keyframes";
import type { Clock } from "@/lib/editor/clock";
import { localThumb } from "@/lib/media/localMedia";

function Card({
  title,
  id,
  children,
  action,
}: {
  title: string;
  id: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="panel flex flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-line bg-surface px-3 py-2">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {action}
      </header>
      <div className="flex flex-col gap-2.5 p-3">{children}</div>
    </section>
  );
}

/** Keyframes and opacity in the inspector: the playhead, and where the changes go. */
export type MotionProps = {
  clock?: Clock;
  /** the clip's start on the timeline */
  start?: number;
  fps?: number;
  /** place, size, angle, opacity changed (with keyframes: at the playhead) */
  onEditAt?: (patch: { transform?: Partial<Transform>; opacity?: number }, group?: string) => void;
  onKeyframe?: (op: KeyframeOp) => void;
  /** move the playhead (timeline seconds) */
  onSeek?: (t: number) => void;
  /** the project's canvas (the Transform panel's pixels) */
  canvas?: { width: number; height: number };
  /** the clip is on an overlay track (blend modes) */
  overlay?: boolean;
};
const noSub = () => () => {};
const atZero = () => 0;
/** What the inspector shows for a clip: with keyframes, its look at the playhead (followed live). */
function useMotionView(clip: MotionClip, mp: MotionProps, active: boolean) {
  const keyed = hasKeys(clip);
  const live = keyed && active && !!mp.clock;
  const now = useSyncExternalStore(live ? mp.clock!.subscribe : noSub, live ? mp.clock!.get : atZero, atZero);
  const start = mp.start ?? 0;
  const len = clipLength(clip);
  const into = Math.min(len, Math.max(0, now - start));
  return {
    keyed,
    into,
    // (keyframes are changed at the playhead: it must be on the clip)
    onClip: !keyed || (now >= start - 1e-6 && now <= start + len + 1e-6),
    shown: keyed ? transformAt(clip, into) : clip.transform,
    opacity: motionAt(clip, into).opacity,
  };
}
/** The fields of `b` that differ from `a` (what a slider changed). */
function changedFields(a: Transform, b: Transform): Partial<Transform> {
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Transform>) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  return out as Partial<Transform>;
}

/**
 * ◆ Keyframes (like CapCut): add or remove one at the playhead, go to the
 * previous / next one, and how it moves on (smooth or steady).
 */
function KeyframeBar({ clip, mv, mp }: { clip: MotionClip; mv: ReturnType<typeof useMotionView>; mp: MotionProps }) {
  if (!mp.onKeyframe) return null;
  const fps = mp.fps ?? 30;
  const start = mp.start ?? 0;
  const keys = visibleKeys(clip);
  const i = mv.keyed ? keyIndexAt(clip, mv.into, fps) : -1;
  const cur = i >= 0 ? keysOf(clip)[i] : null;
  const half = 0.5 / fps;
  const prev = [...keys].reverse().find((k) => k.t < mv.into - half);
  const next = keys.find((k) => k.t > mv.into + half);
  const hasNext = i >= 0 && i < keysOf(clip).length - 1;
  const small = "flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label="Keyframes" className="flex flex-col gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1.5 overflow-hidden" data-testid="keyframe-bar">
      <div className="flex items-center gap-1.5 min-w-0 justify-between">
        <button type="button" className={`${small} shrink-0`} disabled={!prev} onClick={() => prev && mp.onSeek?.(start + prev.t)} aria-label="Previous keyframe" title="Previous keyframe">
          <Icon name="chevronRight" className="size-4 rotate-180" />
        </button>
        <button
          type="button"
          aria-label={cur ? "Remove keyframe" : "Add keyframe"}
          aria-pressed={!!cur}
          onClick={() => mp.onKeyframe?.({ kind: "toggle" })}
          disabled={!mv.onClip}
          className={`flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-medium disabled:opacity-40 transition-colors ${
            cur
              ? "border-amber-400 bg-amber-400/20 text-amber-400 shadow-sm"
              : "border-control hover:bg-raised text-muted hover:text-ink"
          }`}
          title={cur ? "Remove keyframe at playhead" : "Add keyframe at playhead (place, size, angle, opacity)"}
        >
          <Icon name="keyframe" className={`size-3.5 ${cur ? "fill-amber-400 text-amber-400" : "text-amber-400"}`} />
        </button>
        <button type="button" className={`${small} shrink-0`} disabled={!next} onClick={() => next && mp.onSeek?.(start + next.t)} aria-label="Next keyframe" title="Next keyframe">
          <Icon name="chevronRight" className="size-4" />
        </button>
        <span
          className="flex items-center gap-1 shrink-0 text-right text-2xs text-muted ml-auto font-mono"
          data-testid="keyframe-count"
          title={`${keys.length} keyframe${keys.length === 1 ? "" : "s"} on clip`}
        >
          <Icon name="keyframe" className="size-3 text-amber-400/80" />
          <span>{keys.length}</span>
        </span>
      </div>
      {!mv.onClip && <p className="text-2xs text-muted">Move the playhead onto this clip to change it.</p>}
      {keys.length > 0 && mv.onClip && !cur && <p className="text-2xs text-muted">Change the place, size, angle or opacity here to add a keyframe at the playhead.</p>}
      {cur && hasNext && (
        <div role="radiogroup" aria-label="Move to the next keyframe" className="flex items-center gap-1 text-2xs">
          <span className="text-muted">Next move</span>
          {(["smooth", "linear"] as const).map((e) => (
            <button key={e} type="button" role="radio" aria-checked={(cur.ease ?? "smooth") === e} onClick={() => mp.onKeyframe?.({ kind: "ease", index: i, ease: e })} className="rounded border border-line px-1.5 py-0.5 aria-checked:border-primary aria-checked:bg-primary-soft">
              {e === "smooth" ? "Smooth" : "Steady"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <LabeledSlider label="Opacity" value={Math.round(value * 100)} min={0} max={100} step={1} unit={{ short: "%", spoken: "percent" }} valueText={(v) => `${v} percent`} onChange={(v) => onChange(v / 100)} />;
}

function TransformFields({
  t,
  onChange,
  noFit,
  showRotation = true,
  showSkew = true,
  showFlip = true,
}: {
  t: Transform;
  onChange: (t: Transform) => void;
  noFit?: boolean;
  showRotation?: boolean;
  showSkew?: boolean;
  showFlip?: boolean;
}) {
  return (
    <>
      {!noFit && (
        <SegmentedControl<"fit" | "fill">
          legend="Fit on the canvas"
          size="sm"
          variant="tabs"
          name="fit"
          value={t.fit}
          onChange={(v) => onChange({ ...t, fit: v })}
          options={[
            { value: "fit", label: "Fit (all visible)" },
            { value: "fill", label: "Fill (cover)" },
          ]}
        />
      )}
      <LabeledSlider
        label="Size"
        value={Math.round(t.scale * 100)}
        min={10}
        max={300}
        step={5}
        unit={{ short: "%", spoken: "percent" }}
        valueText={(v) => `${v} percent`}
        onChange={(v) => onChange({ ...t, scale: v / 100 })}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          {/* <span className="text-xs font-medium text-ink">Position</span> */}
          {(t.x !== 0 || t.y !== 0) && (
            <button
              type="button"
              className="text-2xs text-link underline"
              onClick={() => onChange({ ...t, x: 0, y: 0 })}
              title="Center position"
            >
              Center
            </button>
          )}
        </div>
        <LabeledSlider
          label="Left / right"
          bipolar
          value={Math.round(t.x * 100)}
          min={-100}
          max={100}
          step={1}
          unit={{ short: "%", spoken: "percent" }}
          valueText={(v) =>
            v === 0
              ? "Centered"
              : `${Math.abs(v)} percent ${v < 0 ? "left" : "right"}`
          }
          onChange={(v) => onChange({ ...t, x: v / 100 })}
        />
        <LabeledSlider
          label="Up / down"
          bipolar
          value={Math.round(t.y * 100)}
          min={-100}
          max={100}
          step={1}
          unit={{ short: "%", spoken: "percent" }}
          valueText={(v) =>
            v === 0
              ? "Centered"
              : `${Math.abs(v)} percent ${v < 0 ? "up" : "down"}`
          }
          onChange={(v) => onChange({ ...t, y: v / 100 })}
        />
        <div className="grid grid-cols-3 gap-1 pt-0.5">
          <button
            type="button"
            className="btn btn-secondary min-h-6 px-1 text-2xs"
            onClick={() => onChange({ ...t, x: -0.3 })}
            title="Align left"
          >
            Left
          </button>
          <button
            type="button"
            className="btn btn-secondary min-h-6 px-1 text-2xs"
            onClick={() => onChange({ ...t, x: 0, y: 0 })}
            title="Center horizontally and vertically"
          >
            Center
          </button>
          <button
            type="button"
            className="btn btn-secondary min-h-6 px-1 text-2xs"
            onClick={() => onChange({ ...t, x: 0.3 })}
            title="Align right"
          >
            Right
          </button>
        </div>
      </div>

      {showRotation && (
        <div className="flex flex-col gap-1 border-t border-line/60 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink">Turn / Rotation</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-secondary min-h-6 px-1.5 text-2xs"
                title="Turn 90° counter-clockwise"
                onClick={() => {
                  const cur = t.rotation ?? 0;
                  const next = Math.round(((((cur - 90 + 180) % 360) + 360) % 360) - 180);
                  onChange({ ...t, rotation: next === 0 ? undefined : next });
                }}
              >
                ↺ -90°
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-6 px-1.5 text-2xs"
                title="Turn 90° clockwise"
                onClick={() => {
                  const cur = t.rotation ?? 0;
                  const next = Math.round(((((cur + 90 + 180) % 360) + 360) % 360) - 180);
                  onChange({ ...t, rotation: next === 0 ? undefined : next });
                }}
              >
                ↻ +90°
              </button>
              {t.rotation ? (
                <button
                  type="button"
                  className="ml-1 text-2xs text-link underline"
                  title="Reset rotation to 0°"
                  onClick={() => onChange({ ...t, rotation: undefined })}
                >
                  0°
                </button>
              ) : null}
            </div>
          </div>
          <LabeledSlider
            label="Angle"
            bipolar
            value={Math.round(t.rotation ?? 0)}
            min={-180}
            max={180}
            step={1}
            unit={{ short: "°", spoken: "degrees" }}
            valueText={(v) => (v === 0 ? "0°" : `${v}°`)}
            onChange={(v) => onChange({ ...t, rotation: v === 0 ? undefined : v })}
          />
        </div>
      )}

      {showSkew && (
        <div className="flex flex-col gap-1 border-t border-line/60 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink">Skew & Slant</span>
            {(t.skewX || t.skewY) ? (
              <button
                type="button"
                className="text-2xs text-link underline"
                onClick={() => onChange({ ...t, skewX: undefined, skewY: undefined })}
                title="Reset slant & skew"
              >
                Reset skew
              </button>
            ) : null}
          </div>
          <LabeledSlider
            label="Horizontal slant (X)"
            bipolar
            value={Math.round(t.skewX ?? 0)}
            min={-60}
            max={60}
            step={1}
            unit={{ short: "°", spoken: "degrees" }}
            valueText={(v) => (v === 0 ? "None" : `${v}°`)}
            onChange={(v) => onChange({ ...t, skewX: v === 0 ? undefined : v })}
          />
          <LabeledSlider
            label="Vertical skew (Y)"
            bipolar
            value={Math.round(t.skewY ?? 0)}
            min={-60}
            max={60}
            step={1}
            unit={{ short: "°", spoken: "degrees" }}
            valueText={(v) => (v === 0 ? "None" : `${v}°`)}
            onChange={(v) => onChange({ ...t, skewY: v === 0 ? undefined : v })}
          />
        </div>
      )}

      {showFlip && (
        <div className="flex items-center gap-2 border-t border-line/60 pt-2">
          <button
            type="button"
            className={`btn btn-secondary min-h-7 flex-1 px-2 text-xs ${t.flipX ? "border-primary bg-primary-soft text-primary font-medium" : ""}`}
            aria-pressed={!!t.flipX}
            onClick={() => onChange({ ...t, flipX: t.flipX ? undefined : true })}
          >
            Flip ↔
          </button>
          <button
            type="button"
            className={`btn btn-secondary min-h-7 flex-1 px-2 text-xs ${t.flipY ? "border-primary bg-primary-soft text-primary font-medium" : ""}`}
            aria-pressed={!!t.flipY}
            onClick={() => onChange({ ...t, flipY: t.flipY ? undefined : true })}
          >
            Flip ↕
          </button>
        </div>
      )}
    </>
  );
}

function Fades({
  c,
  onChange,
}: {
  c: { fadeIn: number; fadeOut: number };
  onChange: (p: { fadeIn?: number; fadeOut?: number }) => void;
}) {
  return (
    <>
      <LabeledSlider
        label="Fade in"
        value={c.fadeIn}
        min={0}
        max={5}
        step={0.1}
        decimals={1}
        unit={{ short: "s", spoken: "seconds" }}
        valueText={(v) => `${v.toFixed(1)} seconds`}
        onChange={(v) => onChange({ fadeIn: v })}
      />
      <LabeledSlider
        label="Fade out"
        value={c.fadeOut}
        min={0}
        max={5}
        step={0.1}
        decimals={1}
        unit={{ short: "s", spoken: "seconds" }}
        valueText={(v) => `${v.toFixed(1)} seconds`}
        onChange={(v) => onChange({ fadeOut: v })}
      />
    </>
  );
}

const ANIMS = Object.keys(ANIM_LABELS) as Anim["in"][];

const SPEEDS = [0.5, 1, 1.5, 2, 3];
/** Clip speed: 0.25× (slow motion) … 4× (fast forward). The sound keeps its pitch. */
function SpeedField({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (v: number, group?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <LabeledSlider
        label="Speed"
        value={Math.round(speed * 100)}
        min={25}
        max={400}
        step={5}
        unit={{ short: "%", spoken: "percent" }}
        valueText={(v) => `${v / 100} times`}
        onChange={(v) => onChange(v / 100, "clip:speed")}
      />
      <div role="group" aria-label="Quick speeds" className="flex gap-1">
        {SPEEDS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={Math.abs(speed - v) < 1e-6}
            onClick={() => onChange(v)}
            className="flex min-h-7 flex-1 items-center justify-center rounded-md border border-line text-2xs hover:border-control aria-pressed:border-primary aria-pressed:bg-primary-soft"
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Remove background noise" for a clip's sound. */
function DenoiseField({
  value,
  onChange,
  disabled,
}: {
  value: DenoiseLevel | undefined;
  onChange: (v: DenoiseLevel | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div inert={disabled} className={disabled ? "opacity-50" : undefined}>
      <SegmentedControl<"off" | DenoiseLevel>
        legend="Clean up the sound"
        size="sm"
        variant="tabs"
        name="denoise"
        value={value ?? "off"}
        onChange={(v) => onChange(v === "off" ? undefined : v)}
        options={[
          { value: "off", label: "Off" },
          { value: "light", label: "Light", title: "Hiss and room noise" },
          { value: "strong", label: "Strong", title: "Also hum and rumble" },
          { value: "studio", label: "Studio voice", title: "One click for phone recordings: noise out, voice evened out and clearer" },
        ]}
      />
    </div>
  );
}

/** "Beat markers": a marker on every beat of this clip's sound (cuts then snap to the music). */
function BeatMarkersField({ onAdd, disabled }: { onAdd: (every: 1 | 2 | 4) => Promise<string>; disabled?: boolean }) {
  const [every, setEvery] = useState<1 | 2 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div inert={disabled} className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-1.5">
        <select className="field min-h-0 flex-1 py-1 text-xs" value={every} onChange={(e) => setEvery(Number(e.target.value) as 1 | 2 | 4)} aria-label="How often">
          <option value={1}>Every beat</option>
          <option value={2}>Every 2 beats</option>
          <option value={4}>Every bar (4 beats)</option>
        </select>
        <button
          type="button"
          className="btn btn-secondary min-h-0 py-1 text-xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              setMsg(await onAdd(every));
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Listening…" : "♪ Add beat markers"}
        </button>
      </div>
      {msg && <p className="text-xs text-muted" role="status">{msg}</p>}
    </div>
  );
}

function AnimFields({
  anim,
  onChange,
  text,
}: {
  anim: Anim | undefined;
  onChange: (a: Anim) => void;
  /** a text clip (it can also type itself in) */
  text?: boolean;
}) {
  const a = anim ?? NO_ANIM;
  const pick = (edge: "in" | "out", label: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        className="field"
        value={a[edge]}
        onChange={(e) =>
          onChange({ ...a, [edge]: e.target.value as Anim["in"] })
        }
      >
        {ANIMS.filter((k) => text || !TEXT_ONLY_ANIMS.includes(k)).map((k) => (
          <option key={k} value={k}>
            {ANIM_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <fieldset className="flex gap-2">
      <legend className="sr-only">Animation</legend>
      {pick("in", "Comes in")}
      {pick("out", "Goes out")}
    </fieldset>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <label className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="swatch"
          aria-label={label}
        />
      </label>
      <BrandSwatches label={label} value={value} onPick={onChange} />
    </div>
  );
}

/** Brand Kit colors, one click to use (shown next to every color picker). */
export function BrandSwatches({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (hex: string) => void;
}) {
  const colors = useBrandKit()?.colors ?? [];
  if (!colors.length) return null;
  return (
    <span
      role="group"
      aria-label={`Brand colors for ${label.toLowerCase()}`}
      className="flex shrink-0 flex-wrap justify-end gap-1"
    >
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={`Brand color ${c}`}
          aria-label={`Use brand color ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
          className="size-5 rounded border border-control aria-pressed:ring-2 aria-pressed:ring-primary"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

const PRESET_IDS = Object.keys(TEXT_PRESETS) as TextClip["style"]["preset"][];

/** A text clip: the words, its style and how it comes in and goes out. */
function TextCard({
  clip,
  onPatch,
  action,
  motion = {},
}: {
  clip: TextClip;
  onPatch: (p: Record<string, unknown>, group?: string) => void;
  action: ReactNode;
  motion?: MotionProps;
}) {
  const mv = useMotionView(clip, motion, true);
  const edit = (patch: { transform?: Partial<Transform>; opacity?: number }, group?: string) =>
    motion.onEditAt ? motion.onEditAt(patch, group) : onPatch({ ...(patch.transform ? { transform: { ...clip.transform, ...patch.transform } } : {}), ...("opacity" in patch ? { opacity: patch.opacity } : {}) }, group);
  const st = clip.style;
  const brandFonts = useBrandKit()?.fonts ?? [];
  const style = (x: Partial<TextClip["style"]>, group?: string) =>
    onPatch({ style: { ...st, ...x } }, group);
  const aligned =
    st.preset === "title" || st.preset === "plain" || st.preset === "caption";
  const twoColors = st.preset === "lowerThird" || st.preset === "breaking";
  return (
    <Card title="Text" id="clip-card-title" action={action}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Text</span>
        {/* select letters to give them their own size, color, font… (lib/text/marks) */}
        <RichTextField
          id="text-content"
          clip={clip}
          onPatch={(p, group) => onPatch(p as Record<string, unknown>, group)}
          brandFonts={brandFonts}
          rows={st.preset === "lowerThird" ? 2 : 3}
          describedBy={st.preset === "lowerThird" ? "text-help" : undefined}
        />
      </div>
      {st.preset === "lowerThird" && (
        <p id="text-help" className="-mt-1.5 text-xs text-muted">
          First line: the name. Next line: the role.
        </p>
      )}
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Style</span>
          <select
            className="field"
            value={st.preset}
            onChange={(e) => {
              const p =
                TEXT_PRESETS[e.target.value as TextClip["style"]["preset"]];
              // a new look, same words and font
              onPatch({ style: { ...p.style, font: st.font } });
            }}
          >
            {PRESET_IDS.map((k) => (
              <option key={k} value={k}>
                {TEXT_PRESETS[k].label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Font</span>
          {/* the whole text's font: built in, Google Fonts (Hindi too) or your Brand Kit fonts */}
          <FontPicker value={st.font} onChange={(f) => style({ font: f })} brandFonts={brandFonts} label="Font of the whole text" />
        </div>
      </div>
      <LabeledSlider
        label="Text size"
        value={st.size}
        min={16}
        max={240}
        step={2}
        unit={{ short: "px", spoken: "pixels" }}
        valueText={(v) => `${v} pixels on a 1080 high video`}
        onChange={(v) => style({ size: v }, "text:size")}
      />
      {st.preset !== "lowerThird" && st.preset !== "breaking" && (
        <Switch
          label="Bold"
          checked={st.bold}
          onCheckedChange={(v) => style({ bold: v })}
        />
      )}
      {aligned && (
        <SegmentedControl<"left" | "center" | "right">
          legend="Align"
          size="sm"
          variant="tabs"
          name="text-align"
          value={st.align}
          onChange={(v) => style({ align: v })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      )}
      <ColorField
        label="Text color"
        value={st.color}
        onChange={(v) => style({ color: v }, "text:color")}
      />
      {!twoColors && (
        <Switch
          label="Box behind the text"
          checked={st.box !== "none"}
          onCheckedChange={(v) =>
            style({
              box: v
                ? st.preset === "caption"
                  ? "#000000"
                  : "#1d4ed8"
                : "none",
            })
          }
        />
      )}
      {st.box !== "none" && (
        <ColorField
          label={twoColors ? "Bar color" : "Box color"}
          value={st.box}
          onChange={(v) => style({ box: v }, "text:box")}
        />
      )}
      {twoColors && (
        <ColorField
          label={st.preset === "breaking" ? "Label color" : "Second line color"}
          value={st.accent}
          onChange={(v) => style({ accent: v }, "text:accent")}
        />
      )}
      {st.box === "none" && (
        <Switch
          label="Shadow (easier to read)"
          checked={st.shadow}
          onCheckedChange={(v) => style({ shadow: v })}
        />
      )}
      {/* effects: outline, a gradient, letter spacing, the box's shape, the shadow's look */}
      <Fold title="Effects" testId="text-effects">
        <Switch label="Outline" checked={!!st.outline} onCheckedChange={(v) => style({ outline: v ? { color: "#000000", width: 0.06 } : undefined })} />
        {st.outline && (
          <>
            <ColorField label="Outline color" value={st.outline.color} onChange={(v) => style({ outline: { ...st.outline!, color: v } }, "text:outline")} />
            <LabeledSlider label="Outline width" value={Math.round(st.outline.width * 100)} min={1} max={30} step={1} unit={{ short: "%", spoken: "percent of the text size" }} valueText={(v) => `${v} percent of the text size`} onChange={(v) => style({ outline: { ...st.outline!, width: v / 100 } }, "text:outline-width")} />
          </>
        )}
        <Switch label="Gradient (two colors)" checked={!!st.gradient} onCheckedChange={(v) => style({ gradient: v ? "#fbbf24" : undefined })} />
        {st.gradient && <ColorField label="Down to" value={st.gradient} onChange={(v) => style({ gradient: v }, "text:gradient")} />}
        <LabeledSlider label="Letter spacing" value={Math.round((st.spacing ?? 0) * 100)} min={-10} max={100} step={1} unit={{ short: "%", spoken: "percent of the text size" }} valueText={(v) => `${v} percent of the text size`} onChange={(v) => style({ spacing: v ? v / 100 : undefined }, "text:spacing")} />
        {st.box !== "none" && (
          <SegmentedControl<"rounded" | "pill" | "square">
            legend="Box shape"
            size="sm"
            variant="tabs"
            name="text-shape"
            value={st.shape ?? "rounded"}
            onChange={(v) => style({ shape: v === "rounded" ? undefined : v })}
            options={[
              { value: "rounded", label: "Rounded" },
              { value: "pill", label: "Pill" },
              { value: "square", label: "Square" },
            ]}
          />
        )}
        {st.box === "none" && st.shadow && (
          <>
            <SegmentedControl<"soft" | "strong" | "glow">
              legend="Shadow"
              size="sm"
              variant="tabs"
              name="text-shadow"
              value={st.shadowStyle ?? "soft"}
              onChange={(v) => style({ shadowStyle: v === "soft" ? undefined : v })}
              options={[
                { value: "soft", label: "Soft" },
                { value: "strong", label: "Strong" },
                { value: "glow", label: "Glow" },
              ]}
            />
            {st.shadowStyle === "glow" && <ColorField label="Glow color" value={st.accent} onChange={(v) => style({ accent: v }, "text:accent")} />}
          </>
        )}
      </Fold>
      <AnimFields text anim={clip.anim} onChange={(a) => onPatch({ anim: a })} />
      <LabeledSlider
        label="Length"
        value={clip.duration}
        min={0.5}
        max={60}
        step={0.5}
        decimals={1}
        unit={{ short: "s", spoken: "seconds" }}
        valueText={(v) => `${v.toFixed(1)} seconds`}
        onChange={(v) => onPatch({ duration: v }, "clip:duration")}
      />
      <details className="rounded-md border border-line px-2 py-1">
        <summary className="cursor-pointer py-1 text-xs font-medium text-muted">
          Transform & Align (Position, size, turn & skew)
        </summary>
        <div className="flex flex-col gap-2 pb-1">
          <KeyframeBar clip={clip} mv={mv} mp={motion} />
          <fieldset disabled={!mv.onClip} className="contents">
            <TransformFields
              noFit
              t={mv.shown}
              onChange={(t) => edit({ transform: changedFields(mv.shown, t) }, "clip:transform")}
            />
            <OpacityField value={mv.opacity} onChange={(v) => edit({ opacity: v }, "clip:opacity")} />
            <TransformPanel clip={clip} t={mv.shown} size={null} canvas={motion.canvas ?? null} overlay={!!motion.overlay} onTransform={(patch, group) => edit({ transform: patch }, group)} onPatch={onPatch} />
          </fieldset>
          <button
            type="button"
            className="self-start text-xs text-link underline"
            onClick={() =>
              onPatch({
                transform: {
                  ...clip.transform,
                  x: 0,
                  y: 0,
                  scale: 1,
                  rotation: undefined,
                  skewX: undefined,
                  skewY: undefined,
                  flipX: undefined,
                  flipY: undefined,
                },
                keyframes: undefined,
                opacity: undefined,
              })
            }
          >
            Reset transform
          </button>
        </div>
      </details>
    </Card>
  );
}

/** What each kind of element can change (the Element card shows only these). */
const NO_FILL_KINDS: ElementKind[] = ["rect", "ellipse", "polygon", "star", "bubble", "tag"];
const OUTLINE_KINDS: ElementKind[] = ["rect", "ellipse", "polygon", "star", "arrow", "bubble", "tag", "badge", "icon", "lowerThird", "locationBug"];
const WORD_KINDS: ElementKind[] = ["rect", "ellipse", "polygon", "star", "bubble", "tag", "ribbon", "badge", "ticker", "pulse", "lowerThird", "locationBug", "audioWave", "viewfinder"];
const SEE_THROUGH_KINDS: ElementKind[] = ["rect", "ellipse", "marker", "ticker", "pulse", "lowerThird", "locationBug"];
const FILL_LABEL: Partial<Record<ElementKind, string>> = { line: "Color", arrow: "Color", marker: "Color", icon: "Color", ribbon: "Color", badge: "Box color", progress: "Done part", ticker: "Band", pulse: "Beacon color", audioWave: "Wave color", lowerThird: "Tab color", locationBug: "Box color" };
const SECOND_LABEL: Partial<Record<ElementKind, string>> = { icon: "Marks" };

/** An element (a shape, sticker, emoji or news graphic): its look, its words, and how it comes in and goes out. */
function ElementCard({
  clip,
  onPatch,
  action,
  motion = {},
}: {
  clip: ElementClip;
  onPatch: (p: Record<string, unknown>, group?: string) => void;
  action: ReactNode;
  motion?: MotionProps;
}) {
  const mv = useMotionView(clip, motion, true);
  const edit = (patch: { transform?: Partial<Transform>; opacity?: number }, group?: string) =>
    motion.onEditAt ? motion.onEditAt(patch, group) : onPatch({ ...(patch.transform ? { transform: { ...clip.transform, ...patch.transform } } : {}), ...("opacity" in patch ? { opacity: patch.opacity } : {}) }, group);
  const el = clip.el;
  const k = el.kind;
  const set = (x: Partial<ElementLook>, group = "element:look") => onPatch({ el: { ...el, ...x } }, group);
  const brandFonts = useBrandKit()?.fonts ?? [];
  // the emoji box while you type in it (the element takes the last emoji typed)
  const [emojiDraft, setEmojiDraft] = useState<string | null>(null);
  const outline = el.stroke !== "none" && el.strokeWidth > 0;
  const font = el.font ?? "sans";
  const pct = (v: number) => `${v} percent`;
  const words = WORD_KINDS.includes(k);
  const oneLine = k === "badge" || k === "tag" || k === "ribbon" || k === "pulse" || k === "locationBug" || k === "audioWave" || k === "viewfinder";
  return (
    <Card title="Element" id="clip-card-title" action={action}>
      <p className="-mt-1 truncate text-xs text-muted" data-testid="element-name">
        {elementName(clip)}
      </p>
      {k === "emoji" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Emoji</span>
          <input
            id="element-emoji"
            className="field text-xl"
            value={emojiDraft ?? el.emoji ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setEmojiDraft(e.target.value);
              const all = emojisIn(e.target.value);
              const last = all[all.length - 1];
              if (last && last !== el.emoji) set({ emoji: last }, "element:emoji");
            }}
            onBlur={() => setEmojiDraft(null)}
            aria-describedby="element-emoji-help"
          />
          <span id="element-emoji-help" className="text-2xs text-muted">
            Type or paste one. Ctrl ⌘ Space opens every emoji.
          </span>
        </label>
      )}
      {words && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{k === "ticker" || k === "lowerThird" ? "Headline" : k === "locationBug" ? "Location" : k === "audioWave" ? "Label" : k === "viewfinder" ? "Mode / Camera ID" : "Words"}</span>
          {oneLine ? (
            <input id="element-text" aria-label="Words" className="field" maxLength={k === "badge" ? 40 : 60} value={el.text ?? ""} placeholder={k === "viewfinder" ? "REC" : undefined} onChange={(e) => set({ text: e.target.value }, "element:words")} />
          ) : (
            <textarea id="element-text" aria-label={k === "ticker" || k === "lowerThird" ? "Headline" : "Words"} className="field min-h-14 resize-y py-1.5 leading-snug" rows={2} maxLength={200} value={el.text ?? ""} onChange={(e) => set({ text: e.target.value }, "element:words")} />
          )}
        </label>
      )}
      {k === "lowerThird" && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Tab label</span>
            <input className="field" aria-label="Tab label" maxLength={24} value={el.label ?? ""} placeholder="BREAKING NEWS" onChange={(e) => set({ label: e.target.value || undefined }, "element:label")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Sub-headline</span>
            <input className="field" aria-label="Sub-headline" maxLength={120} value={el.subText ?? ""} placeholder="Live details or reporter location" onChange={(e) => set({ subText: e.target.value || undefined }, "element:subtext")} />
          </label>
        </div>
      )}
      {k === "locationBug" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Timestamp / Live status</span>
          <input className="field" aria-label="Timestamp" maxLength={40} value={el.subText ?? ""} placeholder="LIVE 10:45 AM" onChange={(e) => set({ subText: e.target.value || undefined }, "element:subtext")} />
        </label>
      )}
      {k === "ticker" && (
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Label</span>
            <input className="field" aria-label="Label" maxLength={24} value={el.label ?? ""} onChange={(e) => set({ label: e.target.value || undefined }, "element:label")} />
          </label>
        </div>
      )}
      {k === "bubble" && (
        <SegmentedControl<"speech" | "thought">
          legend="Bubble"
          size="sm"
          variant="tabs"
          name="bubble"
          value={el.variant === "thought" ? "thought" : "speech"}
          onChange={(v) => set({ variant: v })}
          options={[
            { value: "speech", label: "Speech" },
            { value: "thought", label: "Thought" },
          ]}
        />
      )}
      {k === "viewfinder" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted">Aperture / Sub-text</span>
              <input className="field" aria-label="Aperture" maxLength={16} value={el.aperture ?? "f 1.8"} placeholder="f 1.8" onChange={(e) => set({ aperture: e.target.value || undefined }, "element:aperture")} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted">Resolution</span>
              <input className="field" aria-label="Resolution" maxLength={16} value={el.resolutionTag ?? "4K HD"} placeholder="4K HD" onChange={(e) => set({ resolutionTag: e.target.value || undefined }, "element:resolution")} />
            </label>
          </div>
          <LabeledSlider
            label="Battery charge"
            value={el.batteryLevel ?? 85}
            min={0}
            max={100}
            step={5}
            unit={{ short: "%", spoken: "percent" }}
            valueText={pct}
            onChange={(v) => set({ batteryLevel: v }, "element:battery")}
          />
          <LabeledSlider
            label="Timecode start"
            value={Math.round(el.timecodeOffset ?? 38.4)}
            min={0}
            max={3600}
            step={1}
            unit={{ short: "s", spoken: "seconds" }}
            valueText={(v) => `${v}s`}
            onChange={(v) => set({ timecodeOffset: v }, "element:timecode")}
          />
        </div>
      )}
      {k === "battery" && (
        <LabeledSlider
          label="Battery charge"
          value={el.batteryLevel ?? 85}
          min={0}
          max={100}
          step={5}
          unit={{ short: "%", spoken: "percent" }}
          valueText={pct}
          onChange={(v) => set({ batteryLevel: v }, "element:battery")}
        />
      )}
      {k !== "emoji" && (
        <>
          {NO_FILL_KINDS.includes(k) && <Switch label="Fill" checked={el.fill !== "none"} onCheckedChange={(v) => set({ fill: v ? (el.stroke !== "none" ? el.stroke : "#3b82f6") : "none" })} />}
          {k !== "viewfinder" && k !== "focusTarget" && k !== "battery" && el.fill !== "none" && <ColorField label={FILL_LABEL[k] ?? "Fill"} value={el.fill} onChange={(v) => set({ fill: v }, "element:fill")} />}
          {el.fill !== "none" && SEE_THROUGH_KINDS.includes(k) && (
            <LabeledSlider label={k === "ticker" ? "Band opacity" : "Fill opacity"} value={Math.round((el.fillAlpha ?? 1) * 100)} min={5} max={100} step={5} unit={{ short: "%", spoken: "percent" }} valueText={pct} onChange={(v) => set({ fillAlpha: v >= 100 ? undefined : v / 100 }, "element:alpha")} />
          )}
          {k === "progress" && (
            <>
              <ColorField label="Still to come" value={el.track ?? "#ffffff"} onChange={(v) => set({ track: v }, "element:track")} />
              <LabeledSlider label="Its opacity" value={Math.round((el.trackAlpha ?? 0.3) * 100)} min={0} max={100} step={5} unit={{ short: "%", spoken: "percent" }} valueText={pct} onChange={(v) => set({ trackAlpha: v / 100 }, "element:track-alpha")} />
            </>
          )}
          {(words || SECOND_LABEL[k]) && <ColorField label={SECOND_LABEL[k] ?? (k === "lowerThird" ? "Headline color" : "Text color")} value={el.textColor ?? "#ffffff"} onChange={(v) => set({ textColor: v }, "element:text-color")} />}
          {(k === "ticker" || k === "lowerThird" || (k === "badge" && el.dot)) && <ColorField label={k === "ticker" ? "Label box" : k === "lowerThird" ? "Tab text color" : "Dot color"} value={el.labelColor ?? (k === "ticker" || k === "lowerThird" ? "#ffffff" : (el.textColor ?? "#ffffff"))} onChange={(v) => set({ labelColor: v }, "element:label-color")} />}
          {k === "lowerThird" && (
            <>
              <ColorField label="Headline background" value={el.subFill && el.subFill !== "none" ? el.subFill : "#0b1220"} onChange={(v) => set({ subFill: v }, "element:sub-fill")} />
              <ColorField label="Sub-headline color" value={el.subTextColor ?? "#94a3b8"} onChange={(v) => set({ subTextColor: v }, "element:sub-text-color")} />
            </>
          )}
          {k === "locationBug" && (
            <ColorField label="Tag color" value={el.subTextColor ?? "#ef4444"} onChange={(v) => set({ subTextColor: v }, "element:sub-text-color")} />
          )}
          {k === "viewfinder" && (
            <>
              <ColorField label="Frame color" value={el.stroke === "none" ? "#ffffff" : el.stroke} onChange={(v) => set({ stroke: v }, "element:stroke")} />
              <ColorField label="Accent color (REC / Crosshair)" value={el.fill === "none" ? "#ef4444" : el.fill} onChange={(v) => set({ fill: v }, "element:fill")} />
              <LabeledSlider
                label="Frame thickness"
                value={Math.round((el.strokeWidth || 0.02) * 1000) / 10}
                min={0.5}
                max={5}
                step={0.5}
                decimals={1}
                unit={{ short: "%", spoken: "percent" }}
                valueText={(v) => `${v}%`}
                onChange={(v) => set({ strokeWidth: v / 100 }, "element:stroke-width")}
              />
            </>
          )}
          {k === "focusTarget" && (
            <>
              <ColorField label="Target bracket color" value={el.stroke === "none" ? "#ffffff" : el.stroke} onChange={(v) => set({ stroke: v }, "element:stroke")} />
              <ColorField label="Crosshair color" value={el.fill === "none" ? "#ef4444" : el.fill} onChange={(v) => set({ fill: v }, "element:fill")} />
              <LabeledSlider
                label="Target thickness"
                value={Math.round((el.strokeWidth || 0.025) * 1000) / 10}
                min={0.5}
                max={6}
                step={0.5}
                decimals={1}
                unit={{ short: "%", spoken: "percent" }}
                valueText={(v) => `${v}%`}
                onChange={(v) => set({ strokeWidth: v / 100 }, "element:stroke-width")}
              />
            </>
          )}
          {k === "battery" && (
            <>
              <ColorField label="Shell color" value={el.stroke === "none" ? "#ffffff" : el.stroke} onChange={(v) => set({ stroke: v }, "element:stroke")} />
              <ColorField label="Bar color" value={el.fill === "none" ? "#22c55e" : el.fill} onChange={(v) => set({ fill: v }, "element:fill")} />
            </>
          )}
          {words && (
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted">Font</span>
                <FontPicker value={font} onChange={(f) => set({ font: f })} brandFonts={brandFonts} label="Font of the words" />
              </div>
              <Switch compact label="Bold" checked={el.bold !== false} onCheckedChange={(v) => set({ bold: v ? undefined : false })} />
            </div>
          )}
          {OUTLINE_KINDS.includes(k) && (
            <>
              <Switch label="Outline" checked={outline} onCheckedChange={(v) => set(v ? { stroke: el.stroke !== "none" ? el.stroke : "#ffffff", strokeWidth: el.strokeWidth || 0.05 } : { stroke: "none", strokeWidth: 0 })} />
              {outline && (
                <>
                  <ColorField label="Outline color" value={el.stroke === "none" ? "#ffffff" : el.stroke} onChange={(v) => set({ stroke: v }, "element:stroke")} />
                  <LabeledSlider label="Outline thickness" value={Math.round(el.strokeWidth * 100)} min={1} max={25} step={1} unit={{ short: "%", spoken: "percent" }} valueText={(v) => `${v} percent of its size`} onChange={(v) => set({ strokeWidth: v / 100 }, "element:stroke-width")} />
                </>
              )}
            </>
          )}
          {(k === "rect" || k === "badge" || k === "progress") && (
            <LabeledSlider label="Corners" value={Math.round((el.radius ?? 0) * 100)} min={0} max={50} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pct} onChange={(v) => set({ radius: v ? v / 100 : undefined }, "element:radius")} />
          )}
          {(k === "star" || k === "polygon") && (
            <LabeledSlider label={k === "star" ? "Points" : "Corners"} value={el.points ?? (k === "star" ? 5 : 3)} min={3} max={k === "star" ? 24 : 12} step={1} valueText={(v) => `${v}`} onChange={(v) => set({ points: v }, "element:points")} />
          )}
          {k === "star" && (
            <LabeledSlider label="Point depth" value={Math.round((1 - (el.inner ?? 0.45)) * 100)} min={5} max={90} step={1} unit={{ short: "%", spoken: "percent" }} valueText={pct} onChange={(v) => set({ inner: Math.round((1 - v / 100) * 100) / 100 }, "element:inner")} />
          )}
          {k === "arrow" && (
            <SegmentedControl<"none" | "end" | "both">
              legend="Arrow heads"
              size="sm"
              variant="tabs"
              name="heads"
              value={el.heads ?? "end"}
              onChange={(v) => set({ heads: v })}
              options={[
                { value: "end", label: "One end" },
                { value: "both", label: "Both" },
                { value: "none", label: "None" },
              ]}
            />
          )}
          {(k === "arrow" || (k === "line" && el.variant === "hand")) && (
            <LabeledSlider label="Bend" bipolar value={Math.round((el.curve ?? 0) * 100)} min={-100} max={100} step={5} unit={{ short: "%", spoken: "percent" }} valueText={(v) => (v === 0 ? "Straight" : `${Math.abs(v)} percent ${v > 0 ? "up" : "down"}`)} onChange={(v) => set({ curve: v ? v / 100 : undefined }, "element:curve")} />
          )}
          {k === "line" && (
            <>
              <SegmentedControl<"plain" | "fade" | "hand">
                legend="Line style"
                size="sm"
                variant="tabs"
                name="line-style"
                value={el.variant === "fade" || el.variant === "hand" ? el.variant : "plain"}
                onChange={(v) => set({ variant: v === "plain" ? undefined : v })}
                options={[
                  { value: "plain", label: "Plain" },
                  { value: "fade", label: "Fading ends" },
                  { value: "hand", label: "Hand-drawn" },
                ]}
              />
              <Switch label="Dashed" checked={!!el.dash} onCheckedChange={(v) => set({ dash: v || undefined })} />
            </>
          )}
          {k === "badge" && (
            <>
              <Switch label="Dot" checked={!!el.dot} onCheckedChange={(v) => set({ dot: v || undefined, icon: v ? undefined : el.icon })} />
              <LabeledSlider label="Slant" bipolar value={Math.round((el.skew ?? 0) * 100)} min={-40} max={40} step={2} unit={{ short: "%", spoken: "percent" }} valueText={(v) => (v === 0 ? "Upright" : `${Math.abs(v)} percent`)} onChange={(v) => set({ skew: v ? v / 100 : undefined }, "element:skew")} />
            </>
          )}
          {k === "ticker" && (
            <LabeledSlider label="Speed" value={el.speed ?? 2.2} min={0.4} max={8} step={0.2} decimals={1} valueText={(v) => `${v.toFixed(1)} times its height a second`} onChange={(v) => set({ speed: v }, "element:speed")} />
          )}
        </>
      )}
      {k !== "progress" && k !== "ticker" && <Switch label="Shadow" checked={!!el.shadow} onCheckedChange={(v) => set({ shadow: v || undefined })} />}
      <AnimFields anim={clip.anim} onChange={(a) => onPatch({ anim: a })} />
      <Fades c={clip} onChange={(p) => onPatch(p, "clip:fade")} />
      <LabeledSlider
        label="Length"
        value={clip.duration}
        min={0.5}
        max={Math.max(60, Math.ceil(clip.duration))}
        step={0.5}
        decimals={1}
        unit={{ short: "s", spoken: "seconds" }}
        valueText={(v) => `${v.toFixed(1)} seconds`}
        onChange={(v) => onPatch({ duration: v }, "clip:duration")}
      />
      <details className="rounded-md border border-line px-2 py-1">
        <summary className="cursor-pointer py-1 text-xs font-medium text-muted">Transform & Align (Position, size, turn & skew)</summary>
        <div className="flex flex-col gap-2 pb-1">
          <KeyframeBar clip={clip} mv={mv} mp={motion} />
          <fieldset disabled={!mv.onClip} className="contents">
            <TransformFields noFit showRotation={false} showSkew={false} showFlip={false} t={mv.shown} onChange={(t) => edit({ transform: changedFields(mv.shown, t) }, "clip:transform")} />
            <OpacityField value={mv.opacity} onChange={(v) => edit({ opacity: v }, "clip:opacity")} />
            <TransformPanel clip={clip} t={mv.shown} size={null} canvas={motion.canvas ?? null} overlay={!!motion.overlay} onTransform={(patch, group) => edit({ transform: patch }, group)} onPatch={onPatch} />
          </fieldset>
          <button
            type="button"
            className="self-start text-xs text-link underline"
            onClick={() =>
              onPatch({
                transform: {
                  ...clip.transform,
                  x: 0,
                  y: 0,
                  scale: 1,
                  rotation: undefined,
                  skewX: undefined,
                  skewY: undefined,
                  flipX: undefined,
                  flipY: undefined,
                },
                keyframes: undefined,
                opacity: undefined,
              })
            }
          >
            Reset transform
          </button>
        </div>
      </details>
    </Card>
  );
}

/** A blank scene on Video 1: its color and length; a title or an element to put on it. */
function BlankCard({
  clip,
  onPatch,
  action,
  onTitle,
  onElement,
}: {
  clip: BlankClip;
  onPatch: (p: Record<string, unknown>, group?: string) => void;
  action: ReactNode;
  onTitle?: () => void;
  onElement?: () => void;
}) {
  // (the theme showing: "Match my computer" on a light Mac is light too)
  const isLight = useResolvedTheme() === "light";
  const displayFill = resolveBlankFill(clip.fill, isLight);
  return (
    <Card title="Blank" id="clip-card-title" action={action}>
      <p className="-mt-1 text-xs text-muted">A plain scene on Video 1. Put a title, text or elements on it: a title card, a pause, an end screen.</p>
      <ColorField label="Color" value={displayFill} onChange={(v) => onPatch({ fill: v }, "blank:fill")} />
      <LabeledSlider
        label="Length"
        value={clip.duration}
        min={0.5}
        max={Math.max(60, Math.ceil(clip.duration))}
        step={0.5}
        decimals={1}
        unit={{ short: "s", spoken: "seconds" }}
        valueText={(v) => `${v.toFixed(1)} seconds`}
        onChange={(v) => onPatch({ duration: v }, "clip:duration")}
      />
      <Fades c={clip} onChange={(p) => onPatch(p, "clip:fade")} />
      {(onTitle || onElement) && (
        <div className="flex flex-wrap gap-2">
          {onTitle && (
            <button type="button" className="btn btn-secondary min-h-9 flex-1 px-3 text-sm" onClick={onTitle}>
              <Icon name="text" className="size-4" /> Add a title on it
            </button>
          )}
          {onElement && (
            <button type="button" className="btn btn-secondary min-h-9 flex-1 px-3 text-sm" onClick={onElement}>
              <Icon name="elements" className="size-4" /> Add an element
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Properties of the selected clip (other than background removal). */
export function ClipPropsCard({
  clip,
  name,
  onPatch,
  onDelete,
  size = null,
  onCropMode,
  onAutoColor,
  stabilize,
  reverse,
  watermark,
  onLookAll,
  motion,
  onBlankTitle,
  onBlankElement,
  onSmartMix,
  onBeatMarkers,
}: {
  clip: AnyClip;
  name: string;
  /** keyframes and opacity (the playhead, where changes go) */
  motion?: MotionProps;
  onPatch: (p: Record<string, unknown>, group?: string) => void;
  onDelete: () => void;
  /** The picture's size (for crop shapes). */
  size?: { width: number; height: number } | null;
  onCropMode?: () => void;
  onAutoColor?: () => Promise<ColorAdjust | null>;
  /** Stabilize state of a video clip: why it can't, and progress while the copy is made. */
  stabilize?: {
    blocked: string | null;
    percent: number | null;
    ready: boolean;
  };
  /** The same for Reverse. */
  reverse?: {
    blocked: string | null;
    percent: number | null;
    ready: boolean;
    error: string | null;
  };
  /** Watermark boxes: place one on the preview; pictures that can cover one. */
  watermark?: {
    onEdit: (patchId: string) => void;
    pictures: { id: string; name: string }[];
    editing: string | null;
  };
  /** Use this clip's look (and vignette) on every video and picture clip. */
  onLookAll?: (c: ColorAdjust | undefined) => void;
  /** A blank scene: put a title on it / open Elements for it. */
  onBlankTitle?: () => void;
  onBlankElement?: () => void;
  /** Jump to or open Smart Audio Mix panel */
  onSmartMix?: () => void;
  /** Markers on the beats of this clip's sound; resolves to a message for the user. */
  onBeatMarkers?: (every: 1 | 2 | 4) => Promise<string>;
}) {
  const del = (
    <button
      type="button"
      className="text-xs text-danger underline"
      onClick={onDelete}
    >
      Delete
    </button>
  );
  if (clip.type === "image")
    return (
      <Card title="Picture" id="clip-card-title" action={del}>
        <p className="truncate text-xs text-muted" title={name}>
          {name}
        </p>
        <LabeledSlider
          label="Length"
          value={clip.duration}
          min={0.5}
          max={60}
          step={0.5}
          decimals={1}
          unit={{ short: "s", spoken: "seconds" }}
          valueText={(v) => `${v.toFixed(1)} seconds`}
          onChange={(v) => onPatch({ duration: v }, "clip:duration")}
        />
        <TransformFields
          t={clip.transform}
          showRotation={false}
          showSkew={false}
          showFlip={false}
          onChange={(t) => onPatch({ transform: t }, "clip:transform")}
        />
        <CropRotateSection
          t={clip.transform}
          size={size}
          onChange={(t, g) => onPatch({ transform: t }, g)}
          onCropMode={onCropMode}
        />
        <ColorSection
          color={clip.color}
          onChange={(c, g) => onPatch({ color: c }, g)}
          onAuto={onAutoColor}
        />
        <Fold title="Looks" testId="looks-section">
          <LooksStrip
            color={clip.color}
            thumb={localThumb(clip.mediaId) ?? `/api/videos/${clip.mediaId}/thumb`}
            onChange={(c, g) => onPatch({ color: c }, g)}
            onAll={onLookAll ? () => onLookAll(clip.color) : undefined}
          />
        </Fold>
        <MaskSection
          mask={clip.mask}
          onChange={(mk, g) => onPatch({ mask: mk }, g)}
          onBubble={() =>
            onPatch({
              mask: BUBBLE_MASK,
              transform: {
                ...clip.transform,
                crop: size
                  ? cropForAspect(size.width, size.height, 1)
                  : clip.transform.crop,
              },
            })
          }
        />
        {watermark && (
          <WatermarkSection
            patches={clip.patches}
            onChange={(ps, g) => onPatch({ patches: ps }, g)}
            onEdit={watermark.onEdit}
            pictures={watermark.pictures}
            editing={watermark.editing}
          />
        )}
        <AnimFields anim={clip.anim} onChange={(a) => onPatch({ anim: a })} />
        <Fades c={clip} onChange={(p) => onPatch(p, "clip:fade")} />
      </Card>
    );
  if (clip.type === "text")
    return <TextCard clip={clip} onPatch={onPatch} action={del} motion={motion} />;
  if (clip.type === "element") return <ElementCard clip={clip} onPatch={onPatch} action={del} motion={motion} />;
  if (clip.type === "blank") return <BlankCard clip={clip} onPatch={onPatch} action={del} onTitle={onBlankTitle} onElement={onBlankElement} />;
  if (clip.type === "audio")
    return (
      <Card title="Sound" id="clip-card-title" action={del}>
        <p className="truncate text-xs text-muted" title={name}>
          {name}
        </p>
        <LabeledSlider
          label="Volume"
          value={Math.round(clip.volume * 100)}
          min={0}
          max={200}
          step={5}
          unit={{ short: "%", spoken: "percent" }}
          valueText={(v) => `${v} percent`}
          onChange={(v) => onPatch({ volume: v / 100 }, "clip:volume")}
        />
        <Fades c={clip} onChange={(p) => onPatch(p, "clip:fade")} />
        <DenoiseField
          value={clip.denoise}
          onChange={(v) => onPatch({ denoise: v })}
        />
        {onBeatMarkers && <BeatMarkersField onAdd={onBeatMarkers} />}
        <Switch
          label="Quieter while someone speaks"
          checked={clip.duck}
          onCheckedChange={(v) => onPatch({ duck: v })}
          describedBy="duck-help"
        />
        <p id="duck-help" className="-mt-1.5 text-xs text-muted">
          Automatic ducking: music goes down under the voice on Video 1.
        </p>
        <Switch
          label="Loudness levelling"
          checked={!!clip.loudness}
          onCheckedChange={(v) => onPatch({ loudness: v ? true : undefined })}
          describedBy="audio-loudness-help"
        />
        <p id="audio-loudness-help" className="-mt-1.5 text-xs text-muted">
          EBU R128 (-16 LUFS): evens out volume across clips.
        </p>
        <div className="flex flex-col gap-1.5 pt-2 border-t border-line/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Smart Dialogue Ducking</span>
            {(clip as { volumeAutomation?: unknown[] }).volumeAutomation?.length ? (
              <span className="text-2xs text-emerald-400 font-medium">
                Active ({(clip as { volumeAutomation?: unknown[] }).volumeAutomation!.length} keyframes)
              </span>
            ) : null}
          </div>
          {onSmartMix && (
            <button
              type="button"
              onClick={onSmartMix}
              className="flex items-center justify-between rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-xs font-medium hover:bg-surface hover:border-sky-500/40 text-ink transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Icon name="volume" className="size-3.5 text-sky-400" />
                <span>Smart Mix / Ducking Settings</span>
              </span>
              <span className="text-2xs text-muted">Configure →</span>
            </button>
          )}
          {(clip as { volumeAutomation?: unknown[] }).volumeAutomation?.length ? (
            <button
              type="button"
              onClick={() => onPatch({ volumeAutomation: undefined }, "clip:clearAutomation")}
              className="text-2xs text-muted hover:text-red-400 self-end transition-colors"
            >
              Clear Clip Automation
            </button>
          ) : null}
        </div>
      </Card>
    );
  if (clip.type === "video")
    return (
      <Card title="Clip" id="clip-card-title" action={del}>
        <p className="truncate text-xs text-muted" title={name}>
          {name}
        </p>
        <Switch
          label="Clip sound"
          checked={!clip.muted}
          onCheckedChange={(v) => onPatch({ muted: !v })}
        />
        <LabeledSlider
          label="Volume"
          value={Math.round(clip.volume * 100)}
          min={0}
          max={200}
          step={5}
          unit={{ short: "%", spoken: "percent" }}
          valueText={(v) => `${v} percent`}
          onChange={(v) => onPatch({ volume: v / 100 }, "clip:volume")}
          disabled={clip.muted}
        />
        <DenoiseField
          value={clip.denoise}
          onChange={(v) => onPatch({ denoise: v })}
          disabled={clip.muted}
        />
        {onBeatMarkers && <BeatMarkersField onAdd={onBeatMarkers} disabled={clip.muted} />}
        <Switch
          label="Loudness levelling"
          checked={!!clip.loudness}
          onCheckedChange={(v) => onPatch({ loudness: v ? true : undefined })}
          disabled={clip.muted}
          describedBy="video-loudness-help"
        />
        <p id="video-loudness-help" className="-mt-1.5 text-xs text-muted">
          EBU R128 (-16 LUFS): evens out volume across clips.
        </p>
        <SpeedField
          speed={clip.speed ?? 1}
          onChange={(v, g) => onPatch({ speed: v === 1 ? undefined : v }, g)}
        />
        <Switch
          label="Play backwards (reverse)"
          checked={!!clip.reversed}
          onCheckedChange={(v) => onPatch({ reversed: v || undefined })}
          disabled={!!reverse?.blocked && !clip.reversed}
          describedBy="rev-help"
        />
        <p
          id="rev-help"
          className="-mt-1.5 text-xs text-muted"
          data-testid="reverse-status"
        >
          {reverse?.error ??
            reverse?.blocked ??
            (clip.reversed
              ? reverse?.ready
                ? "Reversed ✓"
                : `Making the reversed copy… ${reverse?.percent ?? 0}%`
              : "The clip plays from its end to its start.")}
        </p>
        <Switch
          label="Stabilize (remove camera shake)"
          checked={!!clip.stabilize}
          onCheckedChange={(v) => onPatch({ stabilize: v || undefined })}
          disabled={!!stabilize?.blocked && !clip.stabilize}
          describedBy="stab-help"
        />
        <p
          id="stab-help"
          className="-mt-1.5 text-xs text-muted"
          data-testid="stabilize-status"
        >
          {stabilize?.blocked ??
            (clip.stabilize
              ? stabilize?.ready
                ? "Stabilized ✓ (the preview shows it)"
                : `Making the stabilized copy… ${stabilize?.percent ?? 0}%`
              : "Smooths out shaky handheld video.")}
        </p>
        <TransformFields
          t={clip.transform}
          showRotation={false}
          showSkew={false}
          showFlip={false}
          onChange={(t) => onPatch({ transform: t }, "clip:transform")}
        />
        <CropRotateSection
          t={clip.transform}
          size={size}
          onChange={(t, g) => onPatch({ transform: t }, g)}
          onCropMode={onCropMode}
        />
        <ColorSection
          color={clip.color}
          onChange={(c, g) => onPatch({ color: c }, g)}
          onAuto={onAutoColor}
        />
        <Fold title="Looks" testId="looks-section">
          <LooksStrip
            color={clip.color}
            thumb={localThumb(clip.mediaId) ?? `/api/videos/${clip.mediaId}/thumb`}
            onChange={(c, g) => onPatch({ color: c }, g)}
            onAll={onLookAll ? () => onLookAll(clip.color) : undefined}
          />
        </Fold>
        <MaskSection
          mask={clip.mask}
          onChange={(mk, g) => onPatch({ mask: mk }, g)}
          onBubble={() =>
            onPatch({
              mask: BUBBLE_MASK,
              transform: {
                ...clip.transform,
                crop: size
                  ? cropForAspect(size.width, size.height, 1)
                  : clip.transform.crop,
              },
            })
          }
        />
        {watermark && (
          <WatermarkSection
            patches={clip.patches}
            onChange={(ps, g) => onPatch({ patches: ps }, g)}
            onEdit={watermark.onEdit}
            pictures={watermark.pictures}
            editing={watermark.editing}
          />
        )}
        <Fades c={clip} onChange={(p) => onPatch(p, "clip:fade")} />
      </Card>
    );
  return null;
}

/** Nothing selected: the project's canvas (size and background). */
/** The inspector's tabs for a video or picture clip (one shows at a time). */
export type InspectorTab =
  | "basic"
  | "background"
  | "color"
  | "audio"
  | "speed"
  | "tracking"
  | "smartMix"
  | "more";
export const TAB_INFO: Record<
  InspectorTab,
  { label: string; icon: IconName; hint: string }
> = {
  basic: {
    label: "Basic",
    icon: "resize",
    hint: "Size, crop, rotate and shape",
  },
  background: {
    label: "Cutout",
    icon: "background",
    hint: "Remove the background (green screen, black, AI)",
  },
  color: {
    label: "Color",
    icon: "palette",
    hint: "Brightness, color and looks",
  },
  audio: {
    label: "Audio",
    icon: "audio",
    hint: "Sound, volume, noise and fades",
  },
  speed: {
    label: "Speed",
    icon: "speed",
    hint: "Speed, reverse and stabilize",
  },
  tracking: {
    label: "Track",
    icon: "motionTrack",
    hint: "Motion Tracking & Attach",
  },
  smartMix: {
    label: "Smart Mix",
    icon: "volume",
    hint: "Smart Audio Mix & Dialogue Ducking",
  },
  more: { label: "More", icon: "more", hint: "Logo boxes and file info" },
};
/** Which tabs a clip has. */
export const tabsFor = (type: "video" | "image"): InspectorTab[] =>
  type === "video"
    ? ["basic", "background", "color", "audio", "speed", "tracking", "more"]
    : ["basic", "color", "more"];

/**
 * The inspector for a video or picture clip: a row of icon tabs (Basic ·
 * Remove BG · Color · Audio · Speed · More), one shown at a time, so the
 * panel stays short. `background`: the Background Removal controls (videos).
 */
export function ClipInspector(
  p: Parameters<typeof ClipPropsCard>[0] & {
    clip: Extract<AnyClip, { type: "video" | "image" }>;
    tab: InspectorTab;
    onTab: (t: InspectorTab) => void;
    background?: ReactNode;
    info?: ReactNode;
    tracking?: ReactNode;
    smartMix?: ReactNode;
    /** The clip's upload (a Cutout reset goes back to its own detected key). */
    media?: MediaLite;
  },
) {
  const {
    clip,
    onPatch,
    size,
    onCropMode,
    onAutoColor,
    stabilize,
    reverse,
    watermark,
    onLookAll,
  } = p;
  const tabs = tabsFor(clip.type);
  const tab = tabs.includes(p.tab) || p.tab === "smartMix" ? p.tab : "basic";
  // keyframes: the Basic tab shows (and changes) the look at the playhead
  const mp = p.motion ?? {};
  const mv = useMotionView(clip, mp, tab === "basic");
  const edit = (patch: { transform?: Partial<Transform>; opacity?: number }, group?: string) =>
    mp.onEditAt ? mp.onEditAt(patch, group) : onPatch({ ...(patch.transform ? { transform: { ...clip.transform, ...patch.transform } } : {}), ...("opacity" in patch ? { opacity: patch.opacity } : {}) }, group);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // tabs with changes show a dot; their settings can be put back with Reset
  const media = p.media;
  const changed = useMemo(() => changedAreas(clip, media), [clip, media]);
  const reset = (all: boolean) => onPatch(all ? resetAllPatch(clip, media) : resetPatch(clip, tab as ResetArea, media));
  // the ↺ menu (always in the header, so nothing moves when something changes)
  const [resetMenu, setResetMenu] = useState<{ x: number; y: number } | null>(null);
  const resetBtn = useRef<HTMLButtonElement>(null);
  // (a click on ↺ while the menu is open closes it: the menu's own "click outside" already did)
  const closedAt = useRef(0);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    p.onTab(tabs[n]);
    refs.current[n]?.focus();
  };
  const looks = (
    <LooksStrip
      color={clip.color}
      thumb={localThumb(clip.mediaId) ?? `/api/videos/${clip.mediaId}/thumb`}
      onChange={(c, g) => onPatch({ color: c }, g)}
      onAll={onLookAll ? () => onLookAll(clip.color) : undefined}
    />
  );
  const mask = (
    <MaskSection
      mask={clip.mask}
      onChange={(mk, g) => onPatch({ mask: mk }, g)}
      onBubble={() =>
        onPatch({
          mask: BUBBLE_MASK,
          transform: {
            ...clip.transform,
            crop: size
              ? cropForAspect(size.width, size.height, 1)
              : clip.transform.crop,
          },
        })
      }
    />
  );
  const title = clip.type === "video" ? "Clip" : "Picture";

  let body: ReactNode = null;
  if (tab === "basic")
    body = (
      <>
        {clip.type === "image" && (
          <LabeledSlider
            label="Length"
            value={clip.duration}
            min={0.5}
            max={60}
            step={0.5}
            decimals={1}
            unit={{ short: "s", spoken: "seconds" }}
            valueText={(v) => `${v.toFixed(1)} seconds`}
            onChange={(v) => onPatch({ duration: v }, "clip:duration")}
          />
        )}
        <KeyframeBar clip={clip} mv={mv} mp={mp} />
        {/* (with keyframes: the look at the playhead; a change goes into a keyframe there) */}
        <fieldset disabled={!mv.onClip} className="contents">
          <TransformFields
            t={mv.shown}
            showRotation={false}
            showSkew={false}
            showFlip={false}
            onChange={(t) => edit({ transform: changedFields(mv.shown, t) }, "clip:transform")}
          />
          <OpacityField value={mv.opacity} onChange={(v) => edit({ opacity: v }, "clip:opacity")} />
          <TransformPanel clip={clip} t={mv.shown} size={size ?? null} canvas={mp.canvas ?? null} overlay={!!mp.overlay} onTransform={(patch, group) => edit({ transform: patch }, group)} onPatch={onPatch} />
          <CropRotateSection
            open
            t={mv.shown}
            size={size ?? null}
            onChange={(t, g) => edit({ transform: changedFields(mv.shown, t) }, g)}
            onCropMode={onCropMode}
          />
        </fieldset>
        {mask}
        {clip.type === "image" && (
          <AnimFields anim={clip.anim} onChange={(a) => onPatch({ anim: a })} />
        )}
        {clip.type === "image" && (
          <Fades c={clip} onChange={(x) => onPatch(x, "clip:fade")} />
        )}
      </>
    );
  else if (tab === "background") body = p.background ?? null;
  else if (tab === "color")
    body = (
      <>
        <ColorSection
          open
          color={clip.color}
          onChange={(c, g) => onPatch({ color: c }, g)}
          onAuto={onAutoColor}
        />
        <Fold title="Looks" testId="looks-section" defaultOpen>
          {looks}
        </Fold>
      </>
    );
  else if (tab === "audio" && clip.type === "video")
    body = (
      <>
        <Switch
          label="Clip sound"
          checked={!clip.muted}
          onCheckedChange={(v) => onPatch({ muted: !v })}
        />
        <LabeledSlider
          label="Volume"
          value={Math.round(clip.volume * 100)}
          min={0}
          max={200}
          step={5}
          unit={{ short: "%", spoken: "percent" }}
          valueText={(v) => `${v} percent`}
          onChange={(v) => onPatch({ volume: v / 100 }, "clip:volume")}
          disabled={clip.muted}
        />
        <DenoiseField
          value={clip.denoise}
          onChange={(v) => onPatch({ denoise: v })}
          disabled={clip.muted}
        />
        <Fades c={clip} onChange={(x) => onPatch(x, "clip:fade")} />
        <div className="flex flex-col gap-1.5 pt-2 border-t border-line/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">Smart Dialogue Ducking</span>
            {(clip as { volumeAutomation?: unknown[] }).volumeAutomation?.length ? (
              <span className="text-2xs text-emerald-400 font-medium">
                Active ({(clip as { volumeAutomation?: unknown[] }).volumeAutomation!.length} keyframes)
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={p.onSmartMix ? p.onSmartMix : () => p.onTab("smartMix")}
            className="flex items-center justify-between rounded-lg border border-line bg-surface/60 px-2.5 py-1.5 text-xs font-medium hover:bg-surface hover:border-sky-500/40 text-ink transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Icon name="volume" className="size-3.5 text-sky-400" />
              <span>Smart Audio Mix Settings</span>
            </span>
            <span className="text-2xs text-muted">Open →</span>
          </button>
          {(clip as { volumeAutomation?: unknown[] }).volumeAutomation?.length ? (
            <button
              type="button"
              onClick={() => onPatch({ volumeAutomation: undefined }, "clip:clearAutomation")}
              className="text-2xs text-muted hover:text-red-400 self-end transition-colors"
            >
              Clear Clip Automation
            </button>
          ) : null}
        </div>
      </>
    );
  else if (tab === "speed" && clip.type === "video")
    body = (
      <>
        <SpeedField
          speed={clip.speed ?? 1}
          onChange={(v, g) => onPatch({ speed: v === 1 ? undefined : v }, g)}
        />
        <div className="flex flex-col gap-0.5">
          <Switch
            label="Play backwards (reverse)"
            checked={!!clip.reversed}
            onCheckedChange={(v) => onPatch({ reversed: v || undefined })}
            disabled={!!reverse?.blocked && !clip.reversed}
            describedBy="rev-help"
          />
          <p
            id="rev-help"
            className="text-2xs text-muted"
            data-testid="reverse-status"
          >
            {reverse?.error ??
              reverse?.blocked ??
              (clip.reversed
                ? reverse?.ready
                  ? "Reversed ✓"
                  : `Making the reversed copy… ${reverse?.percent ?? 0}%`
                : "Plays from its end to its start.")}
          </p>
        </div>
        <div className="flex flex-col gap-0.5">
          <Switch
            label="Stabilize (remove camera shake)"
            checked={!!clip.stabilize}
            onCheckedChange={(v) => onPatch({ stabilize: v || undefined })}
            disabled={!!stabilize?.blocked && !clip.stabilize}
            describedBy="stab-help"
          />
          <p
            id="stab-help"
            className="text-2xs text-muted"
            data-testid="stabilize-status"
          >
            {stabilize?.blocked ??
              (clip.stabilize
                ? stabilize?.ready
                  ? "Stabilized ✓ (the preview shows it)"
                  : `Making the stabilized copy… ${stabilize?.percent ?? 0}%`
                : "Smooths out shaky video.")}
          </p>
        </div>
      </>
    );
  else if (tab === "tracking" && clip.type === "video")
    body = p.tracking ?? null;
  else if (tab === "smartMix")
    body = p.smartMix ?? null;
  else if (tab === "more")
    body = (
      <>
        {watermark ? (
          <WatermarkSection
            patches={clip.patches}
            onChange={(ps, g) => onPatch({ patches: ps }, g)}
            onEdit={watermark.onEdit}
            pictures={watermark.pictures}
            editing={watermark.editing}
          />
        ) : null}
        {p.info}
      </>
    );

  return (
    <section
      aria-labelledby="clip-card-title"
      className="panel flex min-h-0 flex-col overflow-hidden"
      data-testid="clip-inspector"
    >
      {/* the header and the tabs stay in sight while the settings scroll */}
      <div
        className="sticky top-0 z-10 rounded-t-xl bg-surface"
        data-testid="clip-inspector-head"
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Icon
            name={clip.type === "video" ? "video" : "image"}
            className="size-4 shrink-0 text-muted"
          />
          <h2 id="clip-card-title" className="text-sm font-semibold">
            {title}
          </h2>
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted"
            title={p.name}
          >
            {p.name}
          </span>
          <Tip text={changed.size ? "Reset settings" : "Nothing to reset yet"} align="right" side="bottom">
            <button
              ref={resetBtn}
              type="button"
              className={`flex size-7 shrink-0 items-center justify-center rounded ${changed.size ? "text-muted hover:bg-raised hover:text-ink" : "cursor-default text-muted/40"}`}
              aria-label="Reset"
              aria-haspopup="menu"
              aria-expanded={!!resetMenu}
              aria-disabled={!changed.size}
              data-testid="reset-menu-button"
              onClick={(e) => {
                if (!changed.size || e.timeStamp - closedAt.current < 250) return;
                const r = e.currentTarget.getBoundingClientRect();
                setResetMenu({ x: r.right - 224, y: r.bottom + 4 });
              }}
            >
              <Icon name="reset" className="size-4" />
            </button>
          </Tip>
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center rounded text-muted hover:bg-danger-soft hover:text-danger"
            onClick={p.onDelete}
            aria-label="Delete"
            title="Delete the clip"
          >
            <Icon name="trash" className="size-4" />
          </button>
        </header>
        {(clip as any).generation && (
          <div className="border-b border-primary bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900/60 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-link">
                <span className={`size-2 rounded-full ${(clip as any).generation.status === "generating" ? "bg-indigo-400 animate-pulse" : (clip as any).generation.status === "failed" ? "bg-rose-400" : "bg-emerald-400"}`} />
                AI {(clip as any).generation.mediaType === "video" ? "Veo Video" : (clip as any).generation.mediaType === "image" ? "Imagen" : "Voiceover"}
              </span>
              <span className="font-semibold text-white tabular-nums">
                {(clip as any).generation.status === "generating" ? `${Math.round((clip as any).generation.progress ?? 0)}%` : (clip as any).generation.status}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-2xs italic text-slate-300">
              &quot;{(clip as any).generation.prompt}&quot;
            </p>
          </div>
        )}
        <div
          role="tablist"
          aria-label={`${title} settings`}
          className="flex border-b border-line px-1"
        >
          {tabs.map((t, i) => {
            const on = t === tab;
            return (
              <button
                key={t}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`insp-tab-${t}`}
                aria-selected={on}
                aria-controls="insp-panel"
                tabIndex={on ? 0 : -1}
                title={TAB_INFO[t].hint}
                onClick={() => p.onTab(t)}
                onKeyDown={(e) => onKey(e, i)}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 text-2xs leading-tight ${on ? "font-semibold text-ink" : "text-muted hover:text-ink"}`}
              >
                <Icon
                  name={TAB_INFO[t].icon}
                  className={`size-4 ${on ? "text-link" : ""}`}
                />
                <span className="max-w-full truncate">{TAB_INFO[t].label}</span>
                {changed.has(t as ResetArea) && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-[calc(50%-0.875rem)] size-1.5 rounded-full bg-primary"
                    data-testid="tab-changed"
                  />
                )}
                {on && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        id="insp-panel"
        aria-labelledby={`insp-tab-${tab}`}
        className="flex flex-col gap-1 p-3"
        data-testid={`insp-${tab}`}
      >
        <SliderDensity.Provider value="compact">{body}</SliderDensity.Provider>
      </div>
      {resetMenu && (
        <ContextMenu
          x={resetMenu.x}
          y={resetMenu.y}
          label="Reset"
          onClose={() => {
            setResetMenu(null);
            closedAt.current = performance.now();
            resetBtn.current?.focus();
          }}
          items={[
            { label: `Reset ${TAB_INFO[tab].label}`, disabled: !changed.has(tab as ResetArea), onSelect: () => reset(false) },
            { label: "Reset all", disabled: !changed.size, onSelect: () => reset(true) },
          ]}
        />
      )}
    </section>
  );
}

export function ProjectCard({
  canvas,
  onCanvas,
  onSmartMix,
  smartMixActive,
}: {
  canvas: Canvas;
  onCanvas: (c: Partial<Canvas> & { applyToAllTracks?: boolean }) => void;
  onSmartMix?: () => void;
  smartMixActive?: boolean;
}) {
  const [applyToAll, setApplyToAll] = useState(false);
  const preset =
    CANVAS_PRESETS.find(
      (p) => p.width === canvas.width && p.height === canvas.height,
    )?.id ?? "custom";
  const activeFit = canvas.fit ?? (canvas.height > canvas.width ? "fill" : "fit");

  return (
    <Card title="Project" id="project-card-title">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Canvas size</span>
        <select
          className="field"
          aria-label="Canvas size"
          value={preset}
          onChange={(e) => {
            const p = CANVAS_PRESETS.find((x) => x.id === e.target.value);
            if (p) {
              const isVertical = p.height > p.width;
              onCanvas({
                width: p.width,
                height: p.height,
                ...(isVertical ? { fit: "fill" } : {}),
                applyToAllTracks: applyToAll,
              });
            }
          }}
        >
          {CANVAS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.width} × {p.height})
            </option>
          ))}
          {preset === "custom" && (
            <option value="custom">
              From the first video ({canvas.width} × {canvas.height})
            </option>
          )}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <SegmentedControl<"fit" | "fill">
          legend="Canvas fit"
          size="sm"
          variant="tabs"
          name="canvas-fit"
          value={activeFit}
          onChange={(v) => onCanvas({ fit: v, applyToAllTracks: applyToAll })}
          options={[
            { value: "fit", label: "Fit", title: "Show whole video with borders" },
            { value: "fill", label: "Fill", title: "Fill height to cover canvas without blank space" },
          ]}
        />
        <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer hover:text-ink select-none mt-0.5">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="size-3 rounded border-control accent-primary"
          />
          Apply to overlay tracks too
        </label>
      </div>
      <SegmentedControl<"transparent" | "color">
        legend="Background"
        size="sm"
        variant="tabs"
        name="canvas-bg"
        value={canvas.background === "transparent" ? "transparent" : "color"}
        onChange={(v) =>
          onCanvas({
            background: v === "transparent" ? "transparent" : "#000000",
          })
        }
        options={[
          { value: "transparent", label: "Transparent", title: "Transparent (website overlay)" },
          { value: "color", label: "Color" },
        ]}
      />
      {canvas.background !== "transparent" && (
        <label className="flex items-center gap-2 text-sm">
          Background color
          <input
            type="color"
            value={canvas.background}
            onChange={(e) => onCanvas({ background: e.target.value })}
            className="swatch"
            aria-label="Background color"
          />
        </label>
      )}
      <p className="text-xs text-muted">
        {canvas.background === "transparent"
          ? "Transparent: an MP4 puts it on black. To keep it see-through, pick WebM (VP9 + alpha), MOV (HEVC + alpha) or the website pack in Export."
          : "Exports as a normal video (MP4) on this color."}
      </p>
      {onSmartMix && (
        <div className="pt-2 border-t border-line/70">
          <button
            type="button"
            onClick={onSmartMix}
            className="flex w-full items-center justify-between rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs font-medium hover:bg-surface hover:border-sky-500/40 text-ink transition-colors"
          >
            <span className="flex items-center gap-2">
              <Icon name="volume" className="size-4 text-sky-400" />
              <span>Smart Audio Mix / Ducking</span>
            </span>
            {smartMixActive ? (
              <span className="text-2xs text-emerald-400 font-semibold flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            ) : (
              <span className="text-2xs text-muted">Configure →</span>
            )}
          </button>
        </div>
      )}
    </Card>
  );
}
