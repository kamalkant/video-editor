import { docDuration, emptyDoc, type Canvas } from "../edit/doc";
import { DEFAULT_OUTPUT } from "../edit/spec";
import type { CustomTemplateStatus } from "./custom";
import { BROADCAST_TEMPLATES_BY_ID } from "./newsTemplates";
import type { AspectRatio, BroadcastTemplate, TemplateCategory } from "./types";
import { build as buildV2 } from "./v2/build";
import { V2_TEMPLATES } from "./v2/catalog";

/**
 * Everything the Video Templates library shows besides the 24 broadcast templates, in the
 * same shape: your own templates (Create template: your video + sound + a base look) and the
 * starter templates (lib/templates.ts TEMPLATES).
 */

const CANVAS: Record<AspectRatio, Canvas> = {
  "16:9": { width: 1920, height: 1080, fps: 30, background: "#000000" },
  "9:16": { width: 1080, height: 1920, fps: 30, background: "#000000" },
  "1:1": { width: 1080, height: 1080, fps: 30, background: "#000000" },
};

export const customHubId = (id: string) => `custom-${id}`;

/** Your saved template as a library card. `build` gives the base look's project (or an empty one); the video and sound go in when it's used. */
export function customToBroadcast(c: CustomTemplateStatus): BroadcastTemplate {
  const base = c.baseId ? BROADCAST_TEMPLATES_BY_ID.get(c.baseId) : undefined;
  return {
    id: customHubId(c.id),
    name: c.name,
    category: c.category as TemplateCategory,
    description: c.description || (base ? `Your video and sound with the ${base.name} look.` : "Your video and sound."),
    aspectRatio: c.aspectRatio,
    resolution: (c.video.width ?? 0) >= 3840 || (c.video.height ?? 0) >= 3840 ? "4K" : "HD",
    duration: Math.max(1, Math.round(c.video.duration)),
    tags: ["custom", "my template", ...(base ? [base.name] : [])],
    previewCanvasEngine: base?.previewCanvasEngine,
    slots: [
      { id: "your-video", name: c.video.name, type: "background", trackKind: "main" },
      ...(base?.slots.filter((s) => s.type !== "background" && s.type !== "audio") ?? []),
      ...(c.audio ? [{ id: "your-audio", name: c.audio.name, type: "audio" as const, trackKind: "audio" as const }] : []),
    ],
    build: (custom) => (base ? base.build(custom) : emptyDoc(DEFAULT_OUTPUT, { ...CANVAS[c.aspectRatio] })),
    custom: { id: c.id, video: c.video, ...(c.audio ? { audio: c.audio } : {}), ...(c.missing ? { missing: c.missing } : {}) },
    // (a deleted video has no frame to show)
    ...(c.missing?.video ? {} : { previewImageUrl: `/api/videos/${c.video.assetId}/thumb` }),
  };
}

/** The ratio of a project canvas. */
export function ratioOfCanvas(c: { width: number; height: number }): AspectRatio {
  const r = c.width / Math.max(1, c.height);
  return r > 1.25 ? "16:9" : r < 0.8 ? "9:16" : "1:1";
}

/** The starter templates' groups, in the library's words. */
const LEGACY_GROUP: Record<string, TemplateCategory> = {
  News: "News & Broadcast",
  Presenter: "News Presenter",
  YouTube: "YouTube",
  "Shorts & Reels": "Shorts / Reels",
  "Social Media": "Social Media",
  Business: "Business",
  Ads: "Business",
  Educational: "Educational",
  Festival: "Festival",
  Gaming: "Gaming",
  Weather: "Weather News",
};

/** A starter template (canvas + backdrop + titles) as a library card. */
export function legacyToBroadcast(t: { id: string; name: string; category: string; hint: string; build: () => import("../edit/doc").TimelineDoc }): BroadcastTemplate {
  const d = t.build();
  return {
    id: `starter-${t.id}`,
    name: t.name,
    category: LEGACY_GROUP[t.category] ?? "News & Broadcast",
    description: t.hint,
    aspectRatio: ratioOfCanvas(d.canvas),
    resolution: "HD",
    duration: Math.max(1, Math.round(docDuration(d))),
    tags: ["starter", t.category],
    slots: d.tracks.flatMap((tr) => tr.clips.map((c, i) => ({ id: `${tr.id}-${i}`, name: c.type === "text" ? c.text.split("\n")[0].slice(0, 40) : c.type, type: tr.kind === "audio" ? ("audio" as const) : c.type === "element" ? ("screenGraphic" as const) : c.type === "text" ? ("lowerThird" as const) : ("background" as const), trackKind: tr.kind }))),
    build: () => t.build(),
    previewBackdrop: true,
  };
}

/** A v2 template (lib/templates/v2) in one shape, as a library card. */
export function v2ToBroadcast(spec: import("./v2/spec").TemplateSpec, ratio: AspectRatio): BroadcastTemplate {
  // (built on first use: 120 cards are listed, few are drawn)
  let d: import("../edit/doc").TimelineDoc | null = null;
  const doc = () => (d ??= buildV2(spec, ratio));
  const slots = spec.scenes.flatMap((sc, si) =>
    sc.layers
      .filter((l) => l.kind === "media")
      .map((l, i) => ({ id: `s${si}-${i}`, name: (l as { role: string }).role, type: "presenter" as const, trackKind: (l as { frame?: string }).frame ? ("overlay" as const) : ("main" as const) })),
  );
  return {
    id: `v2-${spec.id}-${ratio}`,
    name: spec.name,
    category: spec.category as TemplateCategory,
    description: `To add: ${spec.summary}.`,
    aspectRatio: ratio,
    resolution: "HD",
    duration: Math.max(1, Math.round(spec.scenes.reduce((a, s) => a + s.length, 0) - spec.scenes.reduce((a, s, i) => a + (i && s.transitionIn ? s.transitionIn.duration : 0), 0))),
    tags: ["new", ...spec.tags],
    slots: [...slots, ...(spec.music ? [{ id: "music", name: "Music bed", type: "audio" as const, trackKind: "audio" as const }] : [])],
    build: () => doc(),
    previewFrame: true,
    ...(spec.music ? { music: spec.music } : {}),
    v2: { id: spec.id, ratio, summary: spec.summary },
  };
}

/** Every v2 template in every shape, as cards (16:9 first). */
export function v2Cards(): BroadcastTemplate[] {
  return RATIO_ORDER.flatMap((r) => V2_TEMPLATES.map((t) => v2ToBroadcast(t, r)));
}
const RATIO_ORDER: AspectRatio[] = ["16:9", "9:16", "1:1"];
