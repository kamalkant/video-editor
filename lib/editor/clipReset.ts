import { DEFAULT_TRANSFORM, type ImageClip, type MediaLite, type VideoClip } from "../edit/doc";
import type { OpInstance } from "../edit/spec";
import { aiMatte } from "../ops/aiMatte";
import { blackKey } from "../ops/blackKey";
import { NEUTRAL } from "../player/look";
import { stateForVideo } from "./studioReducer";

/**
 * "Reset" in the clip inspector: put one tab's settings (or all of them) back
 * to how a fresh clip starts. Timing (trim, place, a picture's length) and the
 * transition into the clip are never reset.
 */
export type ResetArea = "basic" | "background" | "color" | "audio" | "speed" | "tracking" | "more";
type Clip = VideoClip | ImageClip;

/** JSON with sorted keys and no `undefined` / default-looking values, for "is this the same?". */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined && x !== false && x !== 0)
          .sort(([k1], [k2]) => (k1 < k2 ? -1 : 1))
          .map(([k, x]) => [k, norm(x)]),
      );
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** The Background Removal a fresh clip of this upload starts with (removal off, its own detected key). */
function freshRemoval(m: MediaLite | undefined) {
  const limits = m ? { width: m.width, fps: m.fps, duration: m.duration } : { width: 1920, fps: 30 };
  const s = stateForVideo(null, m?.suggestedKey ?? null, limits, false, { black: m?.keyKind === "black", effects: m?.keyVia === "frame" });
  return { ops: s.spec.ops, ui: { method: s.method, keySource: s.keySource } };
}

function removalChanged(ops: OpInstance[], m: MediaLite | undefined): boolean {
  if (ops.some((o) => o.enabled)) return true;
  const fresh = freshRemoval(m).ops;
  // (a clip made before its background was found, in this browser or on the server, still has the plain start)
  const plain = m ? freshRemoval({ ...m, suggestedKey: null, keyKind: null, keyVia: undefined }).ops : fresh;
  const key = (l: OpInstance[]) => l.find((f) => f.type === "chromaKey")?.params;
  return ops.some((o) => {
    if (o.type === "chromaKey") return !same(o.params, key(fresh)) && !same(o.params, key(plain));
    return !same(o.params, o.type === "blackKey" ? blackKey.defaults : aiMatte.defaults);
  });
}

/** Which tabs have changes (they show a dot and a Reset button). */
export function changedAreas(c: Clip, m?: MediaLite): Set<ResetArea> {
  const out = new Set<ResetArea>();
  const pic = !same({ ...DEFAULT_TRANSFORM, ...c.transform }, DEFAULT_TRANSFORM) || !!c.mask || !!c.keyframes?.length || (c.opacity ?? 1) < 1 || (!!c.blend && c.blend !== "normal");
  if (c.type === "image") {
    if (pic || (c.anim && (c.anim.in !== "none" || c.anim.out !== "none")) || c.fadeIn > 0 || c.fadeOut > 0) out.add("basic");
  } else {
    if (pic) out.add("basic");
    if (removalChanged(c.ops, m)) out.add("background");
    if (c.muted || c.volume !== 1 || c.denoise || c.fadeIn > 0 || c.fadeOut > 0) out.add("audio");
    if ((c.speed ?? 1) !== 1 || c.reversed || c.stabilize) out.add("speed");
  }
  if (c.color && !same({ ...NEUTRAL, ...c.color }, NEUTRAL)) out.add("color");
  if (c.patches?.length) out.add("more");
  if (c.type === "video" && (c as VideoClip).tracking?.points?.length) out.add("tracking");
  return out;
}

/** The patch (for setClip) that resets one tab. */
export function resetPatch(c: Clip, area: ResetArea, m?: MediaLite): Record<string, unknown> {
  switch (area) {
    case "basic":
      return c.type === "image"
        ? { transform: { ...DEFAULT_TRANSFORM }, mask: undefined, anim: undefined, fadeIn: 0, fadeOut: 0, keyframes: undefined, opacity: undefined, blend: undefined }
        : { transform: { ...DEFAULT_TRANSFORM }, mask: undefined, keyframes: undefined, opacity: undefined, blend: undefined };
    case "background":
      return c.type === "video" ? freshRemoval(m) : {};
    case "color":
      return { color: undefined };
    case "audio":
      return c.type === "video" ? { muted: false, volume: 1, denoise: undefined, fadeIn: 0, fadeOut: 0 } : {};
    case "speed":
      return c.type === "video" ? { speed: undefined, reversed: undefined, stabilize: undefined } : {};
    case "tracking":
      return c.type === "video" ? { tracking: undefined } : {};
    case "more":
      return { patches: undefined };
  }
}

/** Reset every tab at once ("Reset all"). */
export function resetAllPatch(c: Clip, m?: MediaLite): Record<string, unknown> {
  return [...changedAreas(c, m)].reduce((p, a) => ({ ...p, ...resetPatch(c, a, m) }), {});
}
