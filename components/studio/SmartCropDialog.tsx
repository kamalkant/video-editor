"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import type { MainClip } from "@/lib/edit/doc";
import { cropAround, median } from "@/lib/edit/reframe";
import { detectFaces } from "@/lib/tracking/opticalFlow";

type ReframeFormat = "9:16" | "1:1" | "4:3" | "16:9";

interface FormatInfo {
  id: ReframeFormat;
  label: string;
  sub: string;
  ratioW: number;
  ratioH: number;
}

const FORMATS: FormatInfo[] = [
  { id: "9:16", label: "9:16 Vertical", sub: "YouTube Shorts, TikTok, Instagram Reels", ratioW: 9, ratioH: 16 },
  { id: "1:1", label: "1:1 Square", sub: "Instagram Posts & Feed", ratioW: 1, ratioH: 1 },
  { id: "4:3", label: "4:3 Classic", sub: "Standard Television & Tablet", ratioW: 4, ratioH: 3 },
  { id: "16:9", label: "16:9 Landscape", sub: "YouTube & Widescreen Monitors", ratioW: 16, ratioH: 9 },
];

/** One frame of the clip, small, as pixels (for the face finder). */
async function framePixels(mediaId: string, t: number): Promise<ImageData | null> {
  const img = new Image();
  img.src = `/api/videos/${mediaId}/frame?t=${t.toFixed(3)}`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const w = 320;
  const h = Math.max(2, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Smart reframe: crops the clip to a new shape around its subject. "Follow the face" looks at
 * five frames across the clip, finds the face in each (lib/tracking, in the browser) and centres
 * the crop on where it usually is; the other choices place the crop by hand. Uses the clip's
 * real picture size.
 */
export function SmartCropDialog(p: {
  open: boolean;
  onClose: () => void;
  clip: MainClip | null;
  /** the clip's picture size (its upload) */
  source: { width: number; height: number } | null;
  onApplyCrop: (crop: { l: number; t: number; r: number; b: number }, note: string) => void;
}) {
  const [format, setFormat] = useState<ReframeFormat>("9:16");
  const [focus, setFocus] = useState<"auto" | "center" | "left" | "right">("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyReframe = async () => {
    const clip = p.clip;
    if (!clip || clip.type !== "video" || !p.source) return setError("Select a video clip first.");
    setBusy(true);
    setError(null);
    try {
      const selected = FORMATS.find((f) => f.id === format)!;
      const aspect = selected.ratioW / selected.ratioH;
      let fx = focus === "left" ? 1 / 3 : focus === "right" ? 2 / 3 : 0.5;
      let fy = 0.5;
      let note = focus === "auto" ? "" : "Placed by hand.";
      if (focus === "auto") {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < 5; i++) {
          const t = clip.in + ((clip.out - clip.in) * (i + 0.5)) / 5;
          const px = await framePixels(clip.mediaId, t);
          const face = px ? detectFaces(px)[0] : undefined;
          if (face) {
            xs.push(face.x);
            ys.push(face.y);
          }
        }
        const mx = median(xs);
        const my = median(ys);
        if (mx !== null) {
          fx = mx;
          fy = my ?? 0.5;
          note = `Centred on the face found in ${xs.length} of 5 frames.`;
        } else note = "No face was found, so the crop is centred.";
      }
      const crop = cropAround(p.source.width, p.source.height, aspect, fx, fy) ?? { l: 0, t: 0, r: 0, b: 0 };
      p.onApplyCrop(crop, note);
      p.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="md"
      title="Smart Reframe"
      subtitle="Crop a wide video for Shorts and Reels around the person in it"
      badge={<span className="rounded bg-emerald-600/90 px-1.5 py-px text-[0.625rem] font-semibold text-white">Finds the face · in your browser</span>}
      busy={busy}
      busyLabel="Looking for the face in 5 frames…"
      testId="smart-crop-dialog"
    >
      <div className="flex flex-col gap-4">
        {/* Format Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-300">Target Social Platform</span>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => {
              const active = format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-indigo-400 bg-indigo-500/15 text-white shadow-md ring-1 ring-indigo-500/40"
                      : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="text-xs font-semibold">{f.label}</span>
                  <span className="text-[0.625rem] text-slate-400 mt-0.5">{f.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject Focus Strategy */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-300">Subject Tracking Bias</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "auto" as const, label: "Follow the face", sub: "Finds where the person is" },
              { id: "center" as const, label: "Center Stage", sub: "The middle of the picture" },
              { id: "left" as const, label: "Rule of Thirds (Left)", sub: "Host on left side" },
              { id: "right" as const, label: "Rule of Thirds (Right)", sub: "Host on right side" },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setFocus(st.id)}
                className={`rounded-xl border p-2 text-center transition-all ${
                  focus === st.id
                    ? "border-indigo-400 bg-indigo-500/20 text-white font-semibold shadow-sm"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="text-xs block">{st.label}</span>
                <span className="text-[0.625rem] text-slate-400 block mt-0.5">{st.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Preview Frame Box */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 p-5 shadow-inner">
          <div className="relative aspect-video w-56 rounded-lg bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center">
            <span className="text-[0.625rem] text-slate-500">16:9 Landscape Source</span>
            {/* Dynamic crop preview box */}
            <div
              className="absolute inset-y-1 rounded border-2 border-indigo-400 bg-indigo-500/20 shadow-lg shadow-indigo-500/30 transition-all duration-300"
              style={{
                width: format === "9:16" ? "32%" : format === "1:1" ? "56%" : format === "4:3" ? "75%" : "96%",
                left:
                  focus === "left"
                    ? "6%"
                    : focus === "right"
                    ? format === "9:16" ? "62%" : "38%"
                    : "50%",
                transform: focus === "center" || focus === "auto" ? "translateX(-50%)" : "none",
              }}
            >
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[0.5625rem] font-bold text-white bg-black/60 px-1 py-0.5 rounded">
                  {format}
                </span>
              </div>
            </div>
          </div>
          <span className="text-[0.6875rem] text-slate-400 mt-2">
            {focus === "auto" ? `${format}: the crop goes where the face is` : `${format}: ${focus}`}
          </span>
          {error && <span className="mt-2 text-[0.6875rem] text-red-400" role="alert">{error}</span>}
        </div>

        {/* Apply Action */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void applyReframe()}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <Icon name="crop" className="size-3.5" />
          Apply Smart Reframe to Clip
        </button>
      </div>
    </GoogleAiModal>
  );
}
