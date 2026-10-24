"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { localFrame } from "@/lib/media/localMedia";

/** A YouTube thumbnail (1280 × 720) or a Shorts cover (1080 × 1920). */
const SIZES = {
  youtube: { w: 1280, h: 720, label: "YouTube 16:9" },
  shorts: { w: 1080, h: 1920, label: "Shorts cover 9:16" },
} as const;
type SizeId = keyof typeof SIZES;
type Place = "top" | "middle" | "bottom";

const CLASSIC = ["#ffffff", "#facc15", "#ef4444", "#22c55e", "#38bdf8"];

/**
 * Thumbnail maker: the frame at the playhead, made punchier, with a big outlined headline
 * and an optional badge, saved as PNG or JPG. Everything is drawn in the browser.
 */
export function ThumbnailDialog({
  open,
  onClose,
  frameAt,
  brandColors,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  /** the frame at the playhead: which file and the second in it, or null for a plain background */
  frameAt: { mediaId: string; t: number } | null;
  brandColors: string[];
  projectName: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<SizeId>("youtube");
  const [headline, setHeadline] = useState("");
  const [badge, setBadge] = useState("");
  const [color, setColor] = useState("#facc15");
  const [place, setPlace] = useState<Place>("bottom");
  const [scale, setScale] = useState(1);
  const [punch, setPunch] = useState(true);
  const [upper, setUpper] = useState(true);
  const [frame, setFrame] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // the frame picture, loaded once per opening: taken from this computer's file when it's here (the server
  // may not have it yet), else made by the server
  useEffect(() => {
    if (!open || !frameAt) return;
    let gone = false;
    let own: string | null = null;
    const img = new Image();
    img.onload = () => setFrame(img);
    img.onerror = () => setError("Couldn't load the frame at the playhead.");
    void localFrame(frameAt.mediaId, frameAt.t).then((blob) => {
      if (gone) return;
      img.src = blob ? (own = URL.createObjectURL(blob)) : `/api/videos/${frameAt.mediaId}/frame?t=${frameAt.t.toFixed(3)}`;
    });
    return () => {
      gone = true;
      img.onload = null;
      img.onerror = null;
      if (own) URL.revokeObjectURL(own);
    };
  }, [open, frameAt]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !open) return;
    const { w, h } = SIZES[size];
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, w, h);
    if (frame) {
      // cover the thumbnail (crop the sides or top), a little brighter and bolder when "punch" is on
      const k = Math.max(w / frame.naturalWidth, h / frame.naturalHeight);
      const dw = frame.naturalWidth * k;
      const dh = frame.naturalHeight * k;
      ctx.filter = punch ? "contrast(1.15) saturate(1.3) brightness(1.05)" : "none";
      ctx.drawImage(frame, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.filter = "none";
    }
    const text = (upper ? headline.toUpperCase() : headline).trim();
    if (text) {
      // a dark band behind the words so they read on any picture
      const fontSize = Math.round(h * (size === "youtube" ? 0.16 : 0.08) * scale);
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = wrap(ctx, text, w * 0.9);
      const lh = fontSize * 1.05;
      const block = lh * lines.length;
      const y0 = place === "top" ? h * 0.08 + lh / 2 : place === "middle" ? h / 2 - block / 2 + lh / 2 : h * 0.92 - block + lh / 2;
      const grad = ctx.createLinearGradient(0, y0 - lh, 0, y0 + block);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.45)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y0 - lh, w, block + lh);
      lines.forEach((line, i) => {
        const y = y0 + i * lh;
        ctx.lineJoin = "round";
        ctx.lineWidth = fontSize * 0.14;
        ctx.strokeStyle = "#000000";
        ctx.strokeText(line, w / 2, y);
        ctx.fillStyle = color;
        ctx.fillText(line, w / 2, y);
      });
    }
    const b = badge.trim().toUpperCase();
    if (b) {
      const fs = Math.round(h * (size === "youtube" ? 0.06 : 0.03));
      ctx.font = `800 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const bw = ctx.measureText(b).width + fs * 1.2;
      const bh = fs * 1.6;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.roundRect(w * 0.04, h * 0.05, bw, bh, bh * 0.25);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(b, w * 0.04 + fs * 0.6, h * 0.05 + bh / 2);
    }
  }, [open, size, headline, badge, color, place, scale, punch, upper, frame]);

  const download = (type: "image/png" | "image/jpeg") => {
    const cv = canvas.current;
    if (!cv) return;
    cv.toBlob(
      (blob) => {
        if (!blob) return setError("Couldn't save the picture.");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const base = (projectName || "thumbnail").replace(/[^\w\- ]+/g, "").trim() || "thumbnail";
        a.download = `${base} thumbnail.${type === "image/png" ? "png" : "jpg"}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      },
      type,
      0.92,
    );
  };

  const swatches = [...new Set([...brandColors, ...CLASSIC])].slice(0, 10);
  return (
    <Dialog open={open} onClose={onClose} title="Thumbnail maker">
      <div className="flex flex-col gap-3 text-xs">
        <div className="relative">
          <canvas ref={canvas} className="w-full rounded-md border border-line bg-black" style={{ aspectRatio: `${SIZES[size].w} / ${SIZES[size].h}`, maxHeight: "50vh", objectFit: "contain" }} aria-label="Thumbnail preview" />
          {frameAt && !frame && !error && (
            <span role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-white">
                <Spinner size="sm" /> Getting the frame…
              </span>
            </span>
          )}
        </div>
        {!frameAt && <p className="text-muted">Tip: put the playhead on a video frame first to use it as the background.</p>}
        {error && <p className="text-red-500" role="alert">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-muted">
            Headline
            <input className="field" value={headline} maxLength={60} onChange={(e) => setHeadline(e.target.value)} placeholder="I tried this for 30 days" />
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Badge (optional)
            <input className="field" value={badge} maxLength={16} onChange={(e) => setBadge(e.target.value)} placeholder="NEW / PART 2" />
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Size
            <select className="field" value={size} onChange={(e) => setSize(e.target.value as SizeId)}>
              {(Object.keys(SIZES) as SizeId[]).map((id) => (
                <option key={id} value={id}>
                  {SIZES[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Text place
            <select className="field" value={place} onChange={(e) => setPlace(e.target.value as Place)}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Text size
            <input type="range" min={0.6} max={1.6} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </label>
          <div className="flex flex-col gap-1 text-muted">
            Text colour
            <div className="flex flex-wrap gap-1">
              {swatches.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-6 rounded-full border ${color === c ? "ring-2 ring-primary" : "border-line"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={punch} onChange={(e) => setPunch(e.target.checked)} /> Make the picture pop
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> CAPITALS
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" className="btn btn-secondary" onClick={() => download("image/jpeg")}>
            Save JPG
          </button>
          <button type="button" className="btn btn-primary" onClick={() => download("image/png")}>
            Save PNG
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Words → lines no wider than max (at most 3 lines; the rest is cut with "…"). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2]}…`] : lines;
}
