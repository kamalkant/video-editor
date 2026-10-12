"use client";

import { useState, type ReactNode } from "react";
import { KeyColorControl } from "@/components/editor/KeyColorControl";
import { Icon } from "@/components/ui/Icon";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Notice } from "@/components/ui/Notice";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { Tip } from "@/components/ui/Tip";
import {
  activePresetOf,
  aiParams,
  blackParams,
  removalOn,
} from "@/lib/editor/studioReducer";
import { AI_RANGES, aiMatte, NO_AI_REMOVAL, type AiMatteParams } from "@/lib/ops/aiMatte";
import { useServerCaps } from "@/lib/editor/useServerCaps";
import {
  BLACK_RANGES,
  blackKey,
  type BlackKeyParams,
} from "@/lib/ops/blackKey";
import type { ChromaKeyParams } from "@/lib/ops/chromaKey";
import { PRESETS, RANGES, type PresetId } from "@/lib/settings";
import type { ToolPanelProps } from "./registry";

type Mode = "color" | "ai" | "cutout" | "live";

const KEEP: {
  value: AiMatteParams["mode"];
  label: string;
  quality: AiMatteParams["quality"];
  hint: string;
}[] = [
  {
    value: "hybrid",
    label: "Person + what they hold",
    quality: "balanced",
    hint: "Best for presenters: solid edges, held objects kept, logos and furniture dropped.",
  },
  {
    value: "person",
    label: "Person only (soft hair)",
    quality: "accurate",
    hint: "Softest hair. Things they hold can turn partly see-through.",
  },
  {
    value: "subject",
    label: "Main object",
    quality: "balanced",
    hint: "Any object: a product, a card, a car. Touching things stay together.",
  },
];

function AiSettings({
  on,
  ai,
  ad,
  patchAi,
  aiMask,
  onRetry,
}: {
  on: boolean;
  ai: AiMatteParams;
  ad: AiMatteParams;
  patchAi: (x: Partial<AiMatteParams>) => void;
  aiMask: ToolPanelProps["aiMask"];
  onRetry: () => void;
}) {
  const keep = KEEP.find((k) => k.value === ai.mode) ?? KEEP[0];
  return (
    <div
      inert={!on}
      className={
        on ? "flex flex-col gap-2.5" : "flex flex-col gap-2.5 opacity-50"
      }
    >
      <div aria-live="polite" data-testid="ai-status">
        {on && aiMask.state === "working" && (
          <div className="flex flex-col gap-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
            <span className="flex items-center justify-between">
              <span className="font-medium text-ink">
                AI is finding the subject in every frame…
              </span>
              <span className="tabular-nums">{aiMask.percent}%</span>
            </span>
            <progress
              className="h-1.5 w-full"
              aria-label="Finding the subject"
              value={aiMask.percent}
              max={100}
            />
            <span className="text-muted">
              The paused preview works already. Playing and export use the
              finished result.
            </span>
          </div>
        )}
        {on && aiMask.state === "ready" && (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <Icon name="check" className="size-3.5" strokeWidth={3} /> Subject
            found in every frame
            {aiMask.packed ? "" : " · making the playing preview…"}
          </p>
        )}
        {on && aiMask.state === "failed" && (
          <Notice
            tone="error"
            title="AI Removal didn't work on this video"
            actions={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRetry}
              >
                Try again
              </button>
            }
          >
            {aiMask.error}
          </Notice>
        )}
      </div>
      <Group title="What to keep">
        <SegmentedControl<AiMatteParams["mode"]>
          legend="What to keep"
          legendHidden
          size="sm"
          name="ai-keep"
          value={ai.mode}
          onChange={(v) =>
            patchAi({
              mode: v,
              quality: KEEP.find((k) => k.value === v)!.quality,
            })
          }
          options={KEEP.map((k) => ({
            value: k.value,
            label: k.label,
            title: k.hint,
          }))}
        />
        <p className="text-xs text-muted">{keep.hint}</p>
        {ai.mode !== "subject" && (
          <SegmentedControl<AiMatteParams["quality"]>
            legend="Quality"
            size="sm"
            variant="tabs"
            name="ai-quality"
            value={ai.quality}
            onChange={(v) => patchAi({ quality: v })}
            options={[
              { value: "balanced", label: "Balanced (fast)" },
              { value: "accurate", label: "Accurate (best hair)" },
            ]}
          />
        )}
        <Switch
          label="Remove specks and watermarks"
          checked={ai.despeckle}
          onCheckedChange={(v) => patchAi({ despeckle: v })}
          describedBy="ai-despeckle-help"
        />
        <p id="ai-despeckle-help" className="-mt-1.5 text-xs text-muted">
          Drops small spots, like the sparkle logo in a corner.
        </p>
      </Group>
      <Group title="Background">
        <SegmentedControl<"transparent" | "blur">
          legend="The background"
          legendHidden
          size="sm"
          variant="tabs"
          name="ai-background"
          value={ai.background === "blur" ? "blur" : "transparent"}
          onChange={(v) =>
            patchAi(
              v === "blur"
                ? { background: "blur", blur: ai.blur ?? 12 }
                : { background: "transparent" },
            )
          }
          options={[
            { value: "transparent", label: "Remove (see-through)" },
            { value: "blur", label: "Blur it" },
          ]}
        />
        {ai.background === "blur" && (
          <>
            <LabeledSlider
              label="Blur strength"
              value={ai.blur ?? 12}
              {...AI_RANGES.blur}
              valueText={(v) => `${v}`}
              onChange={(v) => patchAi({ blur: v })}
            />
            <p className="text-xs text-muted">
              A blurred background makes the video solid: it exports as MP4
              (give the project a background color).
            </p>
          </>
        )}
      </Group>
      <Group
        title="Refine edges"
        onReset={
          ai.smooth !== ad.smooth ||
          ai.edgeShift !== ad.edgeShift ||
          ai.feather !== ad.feather ||
          ai.hardness !== ad.hardness
            ? () =>
                patchAi({
                  smooth: ad.smooth,
                  edgeShift: ad.edgeShift,
                  feather: ad.feather,
                  hardness: ad.hardness,
                })
            : undefined
        }
      >
        <SegmentedControl<"0" | "1" | "2">
          legend="Flicker smoothing"
          size="sm"
          variant="tabs"
          name="ai-smooth"
          value={String(ai.smooth) as "0" | "1" | "2"}
          onChange={(v) => patchAi({ smooth: Number(v) })}
          options={[
            { value: "0", label: "Off" },
            { value: "1", label: "Light" },
            { value: "2", label: "Strong" },
          ]}
        />
        <LabeledSlider
          label="Edge shrink"
          minLabel="Tighter"
          maxLabel="Wider"
          bipolar
          value={ai.edgeShift}
          {...AI_RANGES.edgeShift}
          unit={{ short: "px", spoken: "pixels" }}
          valueText={(v) =>
            v === 0
              ? "No change"
              : `${Math.abs(v)} pixel${Math.abs(v) > 1 ? "s" : ""} ${v < 0 ? "tighter" : "wider"}`
          }
          onChange={(v) => patchAi({ edgeShift: v })}
        />
        <LabeledSlider
          label="Feather"
          value={ai.feather}
          {...AI_RANGES.feather}
          unit={{ short: "px", spoken: "pixels" }}
          valueText={(v) => `${v} pixels`}
          onChange={(v) => patchAi({ feather: v })}
          help="Softens the cut edge."
        />
        <LabeledSlider
          label="Edge hardness"
          value={ai.hardness}
          {...AI_RANGES.hardness}
          valueText={(v) =>
            v === 0 ? "As found" : `${Math.round(v * 100)} percent`
          }
          onChange={(v) => patchAi({ hardness: v })}
          help="Makes soft edges crisper, e.g. on white websites."
        />
        <p className="text-xs text-muted">
          Smoothing, edge and feather show on the paused (exact) frame.
        </p>
      </Group>
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Icon name="info" className="mt-0.5 size-3.5" /> Smoke, fire or sparks?
        AI can&apos;t cut those. Use Color Key (Effects) or Black background.
      </p>
    </div>
  );
}

function Group({
  title,
  onReset,
  resetLabel = "Reset",
  children,
}: {
  title: string;
  onReset?: () => void;
  resetLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2.5">
      {/* a fixed height: Reset appearing after the first change mustn't push the sliders down */}
      <div className="flex min-h-7 items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {title}
        </h3>
        {onReset && (
          <button
            type="button"
            className="min-h-7 text-xs text-link underline"
            onClick={onReset}
          >
            {resetLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function CutoutSettings({
  on,
  ai,
  patchAi,
  dispatch,
}: {
  on: boolean;
  ai: AiMatteParams;
  patchAi: (x: Partial<AiMatteParams>) => void;
  dispatch: ToolPanelProps["dispatch"];
}) {
  const [tool, setTool] = useState<"point" | "box" | "brush">("point");
  const [target, setTarget] = useState<"foreground" | "custom">("foreground");
  const [edgeExpand, setEdgeExpand] = useState<number>(ai.edgeShift ?? 0);
  const [feather, setFeather] = useState<number>(ai.feather ?? 3);
  const [applied, setApplied] = useState<boolean>(true);

  const handleApply = () => {
    patchAi({
      mode: target === "foreground" ? "hybrid" : "subject",
      edgeShift: edgeExpand,
      feather: feather,
      quality: "accurate",
    });
    if (!on) {
      dispatch({ type: "setRemoval", enabled: true });
    }
    setApplied(true);
  };

  return (
    <div
      inert={!on}
      className={
        on ? "flex flex-col gap-2.5" : "flex flex-col gap-2.5 opacity-50"
      }
    >
      <Notice
        tone="info"
        title="Interactive Cutout"
      >
        Select subjects in the preview canvas to isolate them from any background with AI edge refinement.
      </Notice>

      <Group title="Selection Tool">
        <SegmentedControl<"point" | "box" | "brush">
          legend="Cutout tool"
          legendHidden
          size="sm"
          name="cutout-tool"
          value={tool}
          onChange={setTool}
          options={[
            { value: "point", label: "Point Click", title: "Click subject to select" },
            { value: "box", label: "Bounding Box", title: "Drag rectangle around subject" },
            { value: "brush", label: "Smart Brush", title: "Brush over subject area" },
          ]}
        />
        <p className="text-xs text-muted">
          {tool === "point"
            ? "Click anywhere on the subject in the preview canvas."
            : tool === "box"
              ? "Drag a bounding box over the subject in the canvas."
              : "Paint rough strokes over the target subject to isolate."}
        </p>
      </Group>

      <Group title="Segmentation Target">
        <SegmentedControl<"foreground" | "custom">
          legend="Segmentation target"
          legendHidden
          size="sm"
          variant="tabs"
          name="cutout-target"
          value={target}
          onChange={(v) => {
            setTarget(v);
            if (v === "foreground") {
              patchAi({ mode: "hybrid" });
            } else {
              patchAi({ mode: "subject" });
            }
          }}
          options={[
            { value: "foreground", label: "Foreground Subject" },
            { value: "custom", label: "Custom Object" },
          ]}
        />
      </Group>

      <Group title="Matte Refinement">
        <LabeledSlider
          label="Edge expansion"
          minLabel="Contract"
          maxLabel="Expand"
          bipolar
          value={edgeExpand}
          min={-15}
          max={15}
          step={1}
          unit={{ short: "px", spoken: "pixels" }}
          valueText={(v) =>
            v === 0 ? "Exact edge" : `${Math.abs(v)}px ${v < 0 ? "inward" : "outward"}`
          }
          onChange={(v) => {
            setEdgeExpand(v);
            patchAi({ edgeShift: v });
          }}
        />
        <LabeledSlider
          label="Feather softness"
          value={feather}
          min={0}
          max={20}
          step={0.5}
          unit={{ short: "px", spoken: "pixels" }}
          valueText={(v) => `${v}px`}
          onChange={(v) => {
            setFeather(v);
            patchAi({ feather: v });
          }}
        />
      </Group>

      <div className="pt-1">
        <button
          type="button"
          className="btn btn-primary w-full text-xs font-semibold py-1.5 flex items-center justify-center gap-1.5"
          onClick={handleApply}
        >
          <Icon name="check" className="size-3.5" />
          Apply AI Cutout Matte
        </button>
      </div>

      {applied && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <Icon name="check" className="size-3.5" strokeWidth={3} />
          Active cutout mask applied to clip
        </p>
      )}
    </div>
  );
}

function LiveSettings({
  on,
  ai,
  patchAi,
  dispatch,
}: {
  on: boolean;
  ai: AiMatteParams;
  patchAi: (x: Partial<AiMatteParams>) => void;
  dispatch: ToolPanelProps["dispatch"];
}) {
  const [backdrop, setBackdrop] = useState<"alpha" | "office" | "bokeh" | "cyberpunk">("alpha");
  const [smoothLevel, setSmoothLevel] = useState<"0" | "1" | "2">("1");
  const [bokehStrength, setBokehStrength] = useState<number>(ai.blur ?? 16);

  const handleBackdropChange = (v: "alpha" | "office" | "bokeh" | "cyberpunk") => {
    setBackdrop(v);
    if (v === "bokeh") {
      patchAi({ background: "blur", blur: bokehStrength });
    } else {
      patchAi({ background: "transparent" });
    }
  };

  return (
    <div
      inert={!on}
      className={
        on ? "flex flex-col gap-2.5" : "flex flex-col gap-2.5 opacity-50"
      }
    >
      <div className="flex items-center justify-between rounded-lg border border-line bg-canvas/60 p-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-success" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-ink">Live Stream Ready</span>
            <span className="text-[11px] text-muted">60 FPS GPU-accelerated background isolation</span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary text-xs px-2 py-1"
          onClick={() => dispatch({ type: "setRemoval", enabled: !on })}
        >
          {on ? "Stop Live" : "Start Live"}
        </button>
      </div>

      <Group title="Virtual Studio Backdrop">
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "alpha", label: "Transparent", sub: "Clean cutout", icon: "video" },
            { id: "bokeh", label: "Depth Bokeh", sub: "DSLR blur", icon: "camera" },
            { id: "office", label: "Studio Office", sub: "Pro workspace", icon: "elements" },
            { id: "cyberpunk", label: "Cyber Neon", sub: "Vibrant gradient", icon: "effects" },
          ].map((b) => {
            const active = backdrop === b.id;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleBackdropChange(b.id as any)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition ${
                  active
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-line bg-surface hover:border-line-strong hover:bg-canvas"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon name={b.icon as any} className={`size-3.5 ${active ? "text-primary" : "text-muted"}`} />
                  <span className="text-xs font-semibold text-ink">{b.label}</span>
                </div>
                <span className="text-[10px] text-muted">{b.sub}</span>
              </button>
            );
          })}
        </div>

        {backdrop === "bokeh" && (
          <div className="mt-2 flex flex-col gap-1.5">
            <LabeledSlider
              label="Bokeh blur strength"
              value={bokehStrength}
              min={4}
              max={32}
              step={1}
              valueText={(v) => `${v}px`}
              onChange={(v) => {
                setBokehStrength(v);
                patchAi({ background: "blur", blur: v });
              }}
            />
          </div>
        )}
      </Group>

      <Group title="Temporal Filter">
        <SegmentedControl<"0" | "1" | "2">
          legend="Stream anti-flicker"
          size="sm"
          variant="tabs"
          name="live-smooth"
          value={smoothLevel}
          onChange={(v) => {
            setSmoothLevel(v);
            patchAi({ smooth: Number(v) });
          }}
          options={[
            { value: "0", label: "Fast (0ms)" },
            { value: "1", label: "Smooth" },
            { value: "2", label: "Ultra-Stable" },
          ]}
        />
        <p className="text-xs text-muted">
          Temporal accumulation prevents edge jitter during rapid hand and head movements.
        </p>
      </Group>
    </div>
  );
}

/** Background Removal (inspector card): Color Key, AI Removal, AI Cutout, and Live. */
export function RemoveBackgroundPanel({
  state,
  keyParams: p,
  dispatch,
  seeThrough,
  keyControl,
  video,
  aiMask,
  onRetryAi,
  bare,
}: ToolPanelProps) {
  const [selectedTab, setSelectedTab] = useState<Mode | null>(null);
  const mode: Mode = selectedTab ?? (state.method === "ai" ? "ai" : "color");
  // AI Removal / Cutout need Apple's Vision framework: off a Mac the tab explains instead of starting a job
  const { aiRemoval } = useServerCaps();
  const setMode = (m: Mode) => {
    setSelectedTab(m);
    if (!aiRemoval && (m === "ai" || m === "cutout")) return;
    if (m === "ai" || m === "cutout" || m === "live") {
      dispatch({ type: "setMethod", method: "ai" });
    } else if (m === "color") {
      dispatch({
        type: "setMethod",
        method: video?.keyKind === "black" ? "black" : "color",
      });
    }
  };
  const ai = aiParams(state);
  const ad = aiMatte.defaults;
  const patchAi = (x: Partial<AiMatteParams>) =>
    dispatch({ type: "ai", patch: x }, `ai:${Object.keys(x).join(",")}`);
  const patch = (x: Partial<ChromaKeyParams>, group?: string) =>
    dispatch(
      { type: "key", patch: x },
      group ?? `key:${Object.keys(x).join(",")}`,
    );
  const preset = activePresetOf(p);
  const d = PRESETS.veo.values;
  const on = removalOn(state);
  const method = state.method;
  const black = blackParams(state);
  const bd = blackKey.defaults;
  const patchBlack = (x: Partial<BlackKeyParams>) =>
    dispatch({ type: "black", patch: x }, `black:${Object.keys(x).join(",")}`);
  const effects = p.subject === "effects";
  // Fine-tune starts open for custom settings, then stays as the user leaves it (undo or Reset don't fold it away)
  const [fineOpen, setFineOpen] = useState(preset === "custom");

  return (
    <section
      aria-labelledby="bgr-title"
      className={bare ? "flex flex-col" : "panel flex flex-col"}
    >
      <header
        className={`flex items-center justify-between gap-2 ${bare ? "pb-1" : "border-b border-line px-3 py-1.5"}`}
      >
        <h2
          id="bgr-title"
          className={bare ? "text-xs font-semibold" : "text-sm font-semibold"}
        >
          Background Removal
        </h2>
        <Switch
          label="Background removal"
          hideLabel
          compact
          checked={on}
          onCheckedChange={(v) => dispatch({ type: "setRemoval", enabled: v })}
          describedBy="removal-state"
        />
      </header>
      <div className={`flex flex-col gap-2.5 ${bare ? "" : "p-3"}`}>
        <SegmentedControl<Mode>
          legend="Removal mode"
          legendHidden
          variant="tabs"
          size="sm"
          name="removal-mode"
          fill={false}
          value={mode}
          onChange={setMode}
          options={[
            { value: "color", label: "Color Key" },
            {
              value: "ai",
              label: "AI Removal",
              title: "Any background, no green screen needed",
            },
            {
              value: "cutout",
              label: "AI Cutout",
              title: "Interactive point & box segmentation to isolate any subject",
            },
            {
              value: "live",
              label: "Live",
              title: "Real-time webcam & virtual backdrop replacement",
            },
          ]}
        />
        {!on && video?.keyKind && mode === "color" && (
          <Notice
            tone="info"
            title={
              video.keyKind === "black"
                ? "Black background found"
                : `${video.keyKind === "blue" ? "Blue" : "Green"} screen found`
            }
            actions={
              <button
                type="button"
                className="btn btn-primary"
                data-testid="remove-found"
                onClick={() =>
                  dispatch(
                    video.keyKind === "black"
                      ? { type: "setMethod", method: "black" }
                      : { type: "setRemoval", enabled: true },
                  )
                }
              >
                Remove it
              </button>
            }
          >
            It stays until you remove it.
          </Notice>
        )}
        <p id="removal-state" className="text-xs text-muted">
          {!on
            ? "Off: you see the original video."
            : mode === "cutout"
              ? "AI Cutout isolates the selected subject from background."
              : mode === "live"
                ? "Live removal applies real-time matte and virtual backdrop."
                : method === "ai"
                  ? "AI keeps the person and removes the rest."
                  : method === "black"
                    ? "Black is removed; bright parts stay."
                    : "The key color is removed."}
        </p>

        {!aiRemoval && (mode === "ai" || mode === "cutout") ? (
          <Notice tone="info" title="Not on this server yet">
            {NO_AI_REMOVAL}
          </Notice>
        ) : mode === "ai" ? (
          <AiSettings
            on={on}
            ai={ai}
            ad={ad}
            patchAi={patchAi}
            aiMask={aiMask}
            onRetry={onRetryAi}
          />
        ) : mode === "cutout" ? (
          <CutoutSettings
            on={on}
            ai={ai}
            patchAi={patchAi}
            dispatch={dispatch}
          />
        ) : mode === "live" ? (
          <LiveSettings
            on={on}
            ai={ai}
            patchAi={patchAi}
            dispatch={dispatch}
          />
        ) : (
          <>
            {/* the type as two icon buttons: a click always means "remove this kind of background" (also the one already chosen) */}
            <div className="flex items-center gap-2">
              <span id="bgtype-label" className="text-xs font-medium">
                Background type
              </span>
              <div role="group" aria-labelledby="bgtype-label" className="flex gap-1.5">
                {(
                  [
                    { id: "color", label: "Green / blue screen", tip: "Green or blue screen: removes the solid color behind the person.", swatch: "bg-gradient-to-br from-[#2fd35a] to-[#0b8a28]", icon: "person" },
                    { id: "black", label: "Black background", tip: "Black background: for fire, sparks and smoke shot on black.", swatch: "bg-gradient-to-br from-[#3a3f4b] to-black", icon: "effects" },
                  ] as const
                ).map((t) => {
                  const pressed = on && method === t.id;
                  return (
                    <Tip key={t.id} text={t.tip}>
                      <button type="button" aria-label={t.label} aria-pressed={pressed} onClick={() => dispatch({ type: "setMethod", method: t.id })} className={`flex size-8 items-center justify-center rounded-lg border border-white/15 shadow-sm transition ${t.swatch} ${pressed ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : method === t.id ? "ring-1 ring-control ring-offset-1 ring-offset-surface" : "opacity-60 hover:opacity-100"}`}>
                        <Icon name={t.icon} className="size-4 text-white drop-shadow" />
                      </button>
                    </Tip>
                  );
                })}
              </div>
              {method === "color" && video?.keyKind === "black" && (
                <Tip text="This clip has a black background. Click to use Black background (fire, sparks, smoke)." align="right">
                  <button type="button" aria-label="This clip has a black background: use Black background" onClick={() => dispatch({ type: "setMethod", method: "black" })} className="ml-auto flex size-7 items-center justify-center rounded-md text-link hover:bg-primary-soft">
                    <Icon name="info" className="size-4" />
                  </button>
                </Tip>
              )}
              {method === "color" && video && !video.keyKind && (
                <Tip text="No green or blue screen in this clip. Color Key needs one; for a normal video (a room, a street), click to use AI Removal." align="right">
                  <button type="button" aria-label="No green or blue background found: use AI Removal" onClick={() => setMode("ai")} className="ml-auto flex size-7 items-center justify-center rounded-md text-warn-line hover:bg-warn-soft" data-testid="no-key-hint">
                    <Icon name="alert" className="size-4" />
                  </button>
                </Tip>
              )}
            </div>

            {method === "black" ? (
              <div
                inert={!on}
                className={
                  on
                    ? "flex flex-col gap-2.5"
                    : "flex flex-col gap-2.5 opacity-50"
                }
              >
                <Group
                  title="Black removal"
                  onReset={
                    black.threshold !== bd.threshold ||
                    black.restoreColor !== bd.restoreColor
                      ? () => patchBlack({ ...bd })
                      : undefined
                  }
                >
                  <LabeledSlider
                    label="Dark removal"
                    minLabel="Less"
                    maxLabel="More"
                    value={black.threshold}
                    {...BLACK_RANGES.threshold}
                    valueText={(v) =>
                      `${v.toFixed(2)}${v === bd.threshold ? ", recommended" : ""}`
                    }
                    onChange={(v) => patchBlack({ threshold: v })}
                    help="How dark a pixel must be to disappear. Raise it if a dark haze is left."
                  />
                  <Switch
                    label="Keep glow brightness"
                    checked={black.restoreColor}
                    onCheckedChange={(v) => patchBlack({ restoreColor: v })}
                    describedBy="restore-help"
                  />
                  <p id="restore-help" className="-mt-1.5 text-xs text-muted">
                    Sparks and flames stay bright on light websites instead of
                    looking dim.
                  </p>
                </Group>
              </div>
            ) : (
              <>
                {/* picking a color stays possible while off: it switches removal back on */}
                <Group title="Key color">
                  <KeyColorControl
                    {...keyControl}
                    hideHeading
                    value={p.keyColor}
                    detected={state.detectedKey}
                    source={state.keySource}
                  />
                </Group>
                {/* while removal is off the other settings stay visible but can't be changed */}
                <div
                  inert={!on}
                  className={
                    on
                      ? "flex flex-col gap-2.5"
                      : "flex flex-col gap-2.5 opacity-50"
                  }
                >
                  <Group title="What's in the clip?">
                    <SegmentedControl<"person" | "effects">
                      legend="What's in the clip?"
                      legendHidden
                      size="sm"
                      name="subject"
                      value={p.subject}
                      onChange={(v) =>
                        dispatch({ type: "setSubject", subject: v })
                      }
                      options={[
                        { value: "person", label: "Person or object" },
                        {
                          value: "effects",
                          label: "Effects (smoke, fire, sparks)",
                        },
                      ]}
                    />
                    <p className="text-[0.6875rem] text-muted">
                      {effects
                        ? "Partly see-through on purpose: no warning."
                        : "You are warned if parts turn see-through."}
                    </p>
                  </Group>
                  {/* the warning stays in sight; the fine-tuning folds away */}
                  <div id="see-through-warning" aria-live="polite">
                    {seeThrough && !effects && (
                      <Notice
                        tone="warning"
                        title="Parts of the person are turning see-through"
                        actions={
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              dispatch({
                                type: "setSubject",
                                subject: "effects",
                              })
                            }
                          >
                            This is an effects clip (smoke, fire, sparks)
                          </button>
                        }
                      >
                        White or gray clothes are most at risk. Lower{" "}
                        <strong>Green removal</strong> or{" "}
                        <strong>Edge softness</strong>. Turn on &quot;Highlight
                        see-through areas&quot; to see where.
                      </Notice>
                    )}
                  </div>
                  <details className="group rounded-md border border-line" data-testid="fine-tune" open={fineOpen} onToggle={(e) => setFineOpen((e.currentTarget as HTMLDetailsElement).open)}>
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-semibold">
                      <Icon
                        name="chevronRight"
                        className="size-3.5 text-muted transition-transform group-open:rotate-90"
                      />
                      Fine-tune
                      <span className="font-normal text-muted">
                        · presets, edges, spill
                      </span>
                    </summary>
                    <div className="flex flex-col gap-2.5 border-t border-line p-2">
                      <Group
                        title="Presets"
                        onReset={
                          preset !== "veo"
                            ? () => dispatch({ type: "applyPreset", id: "veo" })
                            : undefined
                        }
                        resetLabel="Reset to recommended"
                      >
                        <SegmentedControl<PresetId | "custom">
                          legend="Preset"
                          legendHidden
                          size="sm"
                          name="preset"
                          value={preset}
                          onChange={(id) =>
                            id !== "custom" &&
                            dispatch({ type: "applyPreset", id })
                          }
                          options={[
                            ...(
                              Object.entries(PRESETS) as [
                                PresetId,
                                (typeof PRESETS)[PresetId],
                              ][]
                            ).map(([id, x]) => ({
                              value: id,
                              label: x.label,
                              title: x.hint,
                            })),
                            // always listed (picked by moving a slider), so the row never wraps when it appears
                            {
                              value: "custom" as const,
                              label: "Custom",
                              title: "Set by moving a slider",
                              disabled: preset !== "custom",
                            },
                          ]}
                        />
                      </Group>
                      <Group
                        title="Removal"
                        onReset={
                          p.similarity !== d.similarity || p.blend !== d.blend
                            ? () =>
                                dispatch({
                                  type: "resetSection",
                                  section: "removal",
                                })
                            : undefined
                        }
                      >
                        <LabeledSlider
                          label="Green removal"
                          value={p.similarity}
                          {...RANGES.similarity}
                          valueText={(v) =>
                            `${v.toFixed(3)}${v === d.similarity ? ", recommended" : ""}`
                          }
                          onChange={(v) => patch({ similarity: v })}
                          describedBy="see-through-warning"
                          help="Similarity: how wide a range of green is removed."
                        />
                        <LabeledSlider
                          label="Edge softness"
                          value={p.blend}
                          {...RANGES.blend}
                          valueText={(v) =>
                            `${v.toFixed(2)}${v === d.blend ? ", recommended" : ""}`
                          }
                          onChange={(v) => patch({ blend: v })}
                          describedBy="see-through-warning"
                          help="Blend: soft edges look natural on hair. Too soft makes the person see-through."
                        />
                      </Group>
                      <Group
                        title="Advanced · edges & spill"
                        onReset={
                          p.despill !== d.despill ||
                          p.despillStrength !== d.despillStrength ||
                          p.edgeShift !== d.edgeShift ||
                          p.feather !== d.feather
                            ? () =>
                                dispatch({
                                  type: "resetSection",
                                  section: "edge",
                                })
                            : undefined
                        }
                      >
                        <Switch
                          label="Green spill removal"
                          checked={p.despill}
                          onCheckedChange={(v) => patch({ despill: v })}
                        />
                        <LabeledSlider
                          label="Spill strength"
                          value={p.despillStrength}
                          {...RANGES.despillStrength}
                          unit={{ short: "%", spoken: "percent" }}
                          valueText={(v) => `${v} percent`}
                          onChange={(v) => patch({ despillStrength: v })}
                          disabled={!p.despill}
                          help={
                            p.despill
                              ? "Removes the green glow on edges. Skin inside stays the same."
                              : "Turn on Green spill removal to use this."
                          }
                        />
                        <LabeledSlider
                          label="Edge shrink"
                          minLabel="Tighter"
                          maxLabel="Wider"
                          bipolar
                          value={p.edgeShift}
                          {...RANGES.edgeShift}
                          unit={{ short: "px", spoken: "pixels" }}
                          valueText={(v) =>
                            v === 0
                              ? "No change"
                              : `${Math.abs(v)} pixel${Math.abs(v) > 1 ? "s" : ""} ${v < 0 ? "tighter" : "wider"}`
                          }
                          onChange={(v) => patch({ edgeShift: v })}
                        />
                        <LabeledSlider
                          label="Feather"
                          value={p.feather}
                          {...RANGES.feather}
                          unit={{ short: "px", spoken: "pixels" }}
                          valueText={(v) => `${v} pixels`}
                          onChange={(v) => patch({ feather: v })}
                          help="Smooths the edge a little. 0 is usually best."
                        />
                      </Group>
                    </div>
                  </details>
                </div>
              </>
            )}
          </>
        )}
        {video === null && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Icon name="info" className="size-3.5" /> Upload a video to use
            these settings.
          </p>
        )}
      </div>
    </section>
  );
}
