import { activeRemovalOps, aiOp, blackOp, DEFAULT_SPEC, keyOp, sanitizeSpec, type EditSpec, type OpInstance, type OutputSettings } from "../edit/spec";
import { aiMatte, type AiMatteParams } from "../ops/aiMatte";
import { isWhole, removeRanges, removeSegment, segmentAt, segmentsOf, splitAt, trimSegment, type Range, type Segment } from "../edit/timeline";
import { blackKey, type BlackKeyParams } from "../ops/blackKey";
import { chromaKey, type ChromaKeyParams } from "../ops/chromaKey";
import { normalizeHex, PRESETS, type PresetId, type SourceLimits } from "../settings";

export type KeySource = "detected" | "picked" | "typed" | "default";

export type RemovalMethod = "color" | "black" | "ai";

export type StudioState = {
  /** Which removal the user chose; kept even while removal is switched off. */
  method: RemovalMethod;
  spec: EditSpec;
  keySource: KeySource;
  detectedKey: string | null;
  limits: SourceLimits | undefined;
};

export type StudioAction =
  | { type: "key"; patch: Partial<ChromaKeyParams> }
  | { type: "output"; patch: Partial<OutputSettings> }
  | { type: "setKey"; hex: string; source: "picked" | "typed" }
  | { type: "resetKey" }
  | { type: "applyPreset"; id: PresetId }
  | { type: "resetSection"; section: "removal" | "edge" }
  | { type: "setRemoval"; enabled: boolean }
  | { type: "setMethod"; method: RemovalMethod }
  | { type: "black"; patch: Partial<BlackKeyParams> }
  | { type: "ai"; patch: Partial<AiMatteParams> }
  /** Timeline (source times, seconds): */
  | { type: "split"; at: number }
  | { type: "deleteClip"; id: string }
  | { type: "trimClip"; id: string; edge: "in" | "out"; to: number }
  | { type: "trimToPlayhead"; at: number; edge: "in" | "out" }
  /** Cut these source ranges out (e.g. "Remove silences"), one undo step. */
  | { type: "removeRanges"; ranges: Range[] }
  | { type: "setSubject"; subject: "person" | "effects" };

function withKey(s: StudioState, fn: (p: ChromaKeyParams) => ChromaKeyParams): StudioState {
  const spec: EditSpec = {
    ...s.spec,
    ops: s.spec.ops.map((op) => (op.type === "chromaKey" ? { ...op, params: fn(op.params) } : op)),
  };
  return { ...s, spec: sanitizeSpec(spec, s.limits) };
}

/** Is background removal (green/blue screen or black background) switched on? */
export function removalOn(s: StudioState): boolean {
  return activeRemovalOps(s.spec).length > 0;
}

export function blackParams(s: StudioState): BlackKeyParams {
  return blackOp(s.spec)?.params ?? blackKey.defaults;
}

/** The kept parts of the clip (the whole clip when nothing is cut). */
export function segmentsOfState(s: StudioState): Segment[] {
  return segmentsOf(s.spec.timeline, s.limits?.duration ?? 0);
}

function withSegments(s: StudioState, segs: Segment[]): StudioState {
  const d = s.limits?.duration;
  if (!d) return s;
  const { timeline: _old, ...rest } = s.spec;
  void _old;
  // an uncut clip has no timeline at all (exports stay exactly as before)
  return { ...s, spec: isWhole(segs, d, s.limits!.fps) ? rest : { ...rest, timeline: { clips: segs } } };
}

export function aiParams(s: StudioState): AiMatteParams {
  return aiOp(s.spec)?.params ?? aiMatte.defaults;
}

/** Switch removal on with the given method (the other method off), or everything off. */
function applyRemoval(s: StudioState, method: RemovalMethod, on: boolean): StudioState {
  let ops: OpInstance[] = s.spec.ops;
  if (method === "black" && !ops.some((o) => o.type === "blackKey")) {
    // black removal runs before any other effect, in the same place as the green removal
    ops = [...ops, { id: "black", type: "blackKey", enabled: false, params: { ...blackKey.defaults } }];
  }
  if (method === "ai" && !ops.some((o) => o.type === "aiMatte")) {
    ops = [...ops, { id: "ai", type: "aiMatte", enabled: false, params: { ...aiMatte.defaults } }];
  }
  const want = { chromaKey: "color", blackKey: "black", aiMatte: "ai" } as const;
  ops = ops.map((o) => (o.type in want ? { ...o, enabled: on && method === want[o.type as keyof typeof want] } : o));
  return { ...s, method, spec: { ...s.spec, ops } };
}

function setKeyEnabled(s: StudioState, enabled: boolean): StudioState {
  return applyRemoval(s, "color", enabled);
}

export function keyParams(s: StudioState): ChromaKeyParams {
  return keyOp(s.spec)?.params ?? chromaKey.defaults;
}

export function studioReducer(s: StudioState, a: StudioAction): StudioState {
  switch (a.type) {
    case "key":
      return withKey(s, (p) => ({ ...p, ...a.patch }));
    case "output":
      return { ...s, spec: sanitizeSpec({ ...s.spec, output: { ...s.spec.output, ...a.patch } }, s.limits) };
    case "setKey":
      if (!/^#?[0-9A-Fa-f]{6}$/.test(a.hex)) return s;
      // picking a color means "remove this": switch removal on
      return setKeyEnabled({ ...withKey(s, (p) => ({ ...p, keyColor: normalizeHex(a.hex) })), keySource: a.source }, true);
    case "resetKey":
      return { ...withKey(s, (p) => ({ ...p, keyColor: s.detectedKey ?? chromaKey.defaults.keyColor })), keySource: s.detectedKey ? "detected" : "default" };
    case "applyPreset":
      return withKey(s, (p) => ({ ...p, ...PRESETS[a.id].values }));
    case "setRemoval":
      return applyRemoval(s, s.method, a.enabled);
    case "setMethod":
      // choosing a method means "remove the background this way"
      return applyRemoval(s, a.method, true);
    case "black": {
      const next = applyRemoval(s, "black", true);
      return {
        ...next,
        spec: sanitizeSpec({ ...next.spec, ops: next.spec.ops.map((o) => (o.type === "blackKey" ? { ...o, params: { ...o.params, ...a.patch } } : o)) }, s.limits),
      };
    }
    case "ai": {
      const next = applyRemoval(s, "ai", true);
      return {
        ...next,
        spec: sanitizeSpec({ ...next.spec, ops: next.spec.ops.map((o) => (o.type === "aiMatte" ? { ...o, params: { ...o.params, ...a.patch } } : o)) }, s.limits),
      };
    }
    case "split":
      return s.limits?.duration ? withSegments(s, splitAt(segmentsOfState(s), a.at, s.limits.fps)) : s;
    case "deleteClip":
      return withSegments(s, removeSegment(segmentsOfState(s), a.id));
    case "trimClip":
      return s.limits?.duration ? withSegments(s, trimSegment(segmentsOfState(s), a.id, a.edge, a.to, s.limits.duration, s.limits.fps)) : s;
    case "removeRanges":
      return s.limits?.duration ? withSegments(s, removeRanges(segmentsOfState(s), a.ranges, s.limits.fps)) : s;
    case "trimToPlayhead": {
      const segs = segmentsOfState(s);
      const g = segmentAt(segs, a.at);
      if (!g || !s.limits?.duration) return s;
      return withSegments(s, trimSegment(segs, g.id, a.edge, a.at, s.limits.duration, s.limits.fps));
    }
    case "setSubject":
      return withKey(s, (p) => ({ ...p, subject: a.subject }));
    case "resetSection": {
      const d = PRESETS.veo.values;
      return withKey(s, (p) =>
        a.section === "removal" ? { ...p, similarity: d.similarity, blend: d.blend } : { ...p, despill: d.despill, despillStrength: d.despillStrength, edgeShift: d.edgeShift, feather: d.feather },
      );
    }
  }
}

/** State for a newly loaded video: keeps the user's settings, uses the clip's own detected key. */
export function stateForVideo(
  prev: EditSpec | null,
  detectedKey: string | null,
  limits: SourceLimits,
  silentAudio: boolean,
  hints: { black?: boolean; effects?: boolean } = {},
): StudioState {
  // settings carry over to a new video; cuts belong to the old one
  const { timeline: _cuts, ...base } = prev ?? DEFAULT_SPEC;
  void _cuts;
  let s: StudioState = { method: "color", spec: base, keySource: detectedKey ? "detected" : "default", detectedKey, limits };
  s = withKey(s, (p) => ({ ...p, keyColor: detectedKey ?? p.keyColor, subject: hints.effects ? "effects" : p.subject }));
  // new clips keep their background: removal starts off (the user switches it on).
  // What was found is ready: a black-background clip is set to black mode, a green one to its green.
  if (hints.black) s = applyRemoval(s, "black", false);
  else s = applyRemoval(s, "color", false);
  if (silentAudio) s = { ...s, spec: { ...s.spec, output: { ...s.spec.output, audio: "remove" } } };
  return s;
}

export function activePresetOf(p: ChromaKeyParams): PresetId | "custom" {
  for (const [id, preset] of Object.entries(PRESETS) as [PresetId, (typeof PRESETS)[PresetId]][]) {
    const v = preset.values;
    if (v.similarity === p.similarity && v.blend === p.blend && v.despill === p.despill && v.despillStrength === p.despillStrength && v.edgeShift === p.edgeShift && v.feather === p.feather) return id;
  }
  return "custom";
}
