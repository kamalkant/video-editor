/**
 * Backdrops: what's behind everything on the canvas (Replace Background).
 * Studio sets and gradients are drawn with code — no image files — by the
 * same function for the preview, the thumbnails and the export (the export
 * gets the drawing as a PNG, like text).
 */

export type Backdrop =
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "set"; id: string }
  | { kind: "media"; mediaId: string };

type Ctx = CanvasRenderingContext2D;

/** Repeatable "random" numbers (the same set looks the same every time). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function linear(ctx: Ctx, W: number, H: number, stops: [number, string][], angle = 180) {
  const a = ((angle - 90) * Math.PI) / 180;
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace("ALPHA", String(alpha)));
  g.addColorStop(1, color.replace("ALPHA", "0"));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function vignette(ctx: Ctx, W: number, H: number, strength: number) {
  radial(ctx, W / 2, H / 2, Math.hypot(W, H) / 1.6, [
    [0.45, "rgba(0,0,0,0)"],
    [1, `rgba(0,0,0,${strength})`],
  ]);
}

/** The built-in studio sets. */
export const STUDIO_SETS: { id: string; label: string; draw: (ctx: Ctx, W: number, H: number) => void }[] = [
  {
    id: "newsroom",
    label: "Newsroom blue",
    draw: (ctx, W, H) => {
      linear(ctx, W, H, [[0, "#06163a"], [0.55, "#0b2f7a"], [1, "#051129"]]);
      // tall light panels
      for (let i = 0; i < 7; i++) {
        const x = (W * (i + 0.5)) / 7;
        ctx.fillStyle = `rgba(90,160,255,${0.05 + (i % 2) * 0.05})`;
        ctx.fillRect(x - W * 0.035, 0, W * 0.07, H * 0.72);
      }
      // horizon bands and the desk glow
      ctx.fillStyle = "rgba(120,190,255,0.16)";
      ctx.fillRect(0, H * 0.63, W, H * 0.012);
      ctx.fillRect(0, H * 0.67, W, H * 0.004);
      glow(ctx, W / 2, H * 0.95, W * 0.55, "rgba(60,140,255,ALPHA)", 0.45);
      ctx.fillStyle = "rgba(2,8,24,0.85)";
      ctx.fillRect(0, H * 0.8, W, H * 0.2);
      ctx.fillStyle = "rgba(80,170,255,0.55)";
      ctx.fillRect(0, H * 0.8, W, H * 0.006);
      vignette(ctx, W, H, 0.55);
    },
  },
  {
    id: "studio-grey",
    label: "Studio grey",
    draw: (ctx, W, H) => {
      radial(ctx, W / 2, H * 0.42, Math.hypot(W, H) * 0.62, [[0, "#9aa1ab"], [0.5, "#5b616b"], [1, "#1f2328"]]);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
    },
  },
  {
    id: "office",
    label: "Warm office (blurred)",
    draw: (ctx, W, H) => {
      linear(ctx, W, H, [[0, "#6b4a2f"], [0.5, "#a37a52"], [1, "#3b2a1c"]], 160);
      const r = rng(7);
      for (let i = 0; i < 26; i++) glow(ctx, r() * W, r() * H * 0.85, (0.04 + r() * 0.1) * H, r() > 0.5 ? "rgba(255,214,150,ALPHA)" : "rgba(255,245,225,ALPHA)", 0.18 + r() * 0.25);
      ctx.fillStyle = "rgba(40,25,15,0.35)";
      ctx.fillRect(0, H * 0.82, W, H * 0.18);
      vignette(ctx, W, H, 0.45);
    },
  },
  {
    id: "tech-grid",
    label: "Tech grid",
    draw: (ctx, W, H) => {
      linear(ctx, W, H, [[0, "#020617"], [1, "#0b1e3f"]]);
      ctx.strokeStyle = "rgba(34,211,238,0.28)";
      ctx.lineWidth = Math.max(1, H / 540);
      const hz = H * 0.58;
      for (let i = -12; i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * W * 0.02, hz);
        ctx.lineTo(W / 2 + i * W * 0.16, H);
        ctx.stroke();
      }
      for (let j = 0; j < 9; j++) {
        const y = hz + (H - hz) * Math.pow(j / 8, 1.8);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      glow(ctx, W / 2, hz, W * 0.5, "rgba(56,189,248,ALPHA)", 0.35);
      vignette(ctx, W, H, 0.5);
    },
  },
  {
    id: "classroom",
    label: "Classroom board",
    draw: (ctx, W, H) => {
      linear(ctx, W, H, [[0, "#1f3b2f"], [1, "#12251d"]]);
      const r = rng(3);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 40; i++) {
        ctx.lineWidth = 1 + r() * 2;
        ctx.beginPath();
        const y = r() * H * 0.8;
        ctx.moveTo(r() * W, y);
        ctx.lineTo(r() * W, y + (r() - 0.5) * H * 0.05);
        ctx.stroke();
      }
      linear(ctx, W, H * 0.02, [[0, "#6b4423"], [1, "#4a2f18"]]);
      ctx.fillStyle = "#5b3a1e";
      ctx.fillRect(0, H * 0.86, W, H * 0.14);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, H * 0.86, W, H * 0.01);
      vignette(ctx, W, H, 0.4);
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    draw: (ctx, W, H) => {
      linear(ctx, W, H, [[0, "#2a1b5c"], [0.45, "#b83a7a"], [0.75, "#f08a4b"], [1, "#fcd28b"]]);
      glow(ctx, W * 0.5, H * 0.78, H * 0.28, "rgba(255,236,170,ALPHA)", 0.9);
    },
  },
  {
    id: "city-night",
    label: "City lights (blurred)",
    draw: (ctx, W, H) => {
      linear(ctx, W, H, [[0, "#050816"], [1, "#101a3a"]]);
      const r = rng(11);
      const colors = ["rgba(255,196,80,ALPHA)", "rgba(255,120,80,ALPHA)", "rgba(120,170,255,ALPHA)", "rgba(255,255,255,ALPHA)"];
      for (let i = 0; i < 60; i++) glow(ctx, r() * W, H * (0.25 + r() * 0.7), (0.015 + r() * 0.06) * H, colors[Math.floor(r() * colors.length)], 0.2 + r() * 0.5);
      vignette(ctx, W, H, 0.4);
    },
  },
  {
    id: "soft",
    label: "Soft gradient",
    draw: (ctx, W, H) => linear(ctx, W, H, [[0, "#c7d2fe"], [0.5, "#f5d0fe"], [1, "#fde68a"]], 135),
  },
  {
    id: "globe-3d",
    label: "3D World Globe",
    draw: (ctx, W, H) => {
      // Deep navy broadcast space
      const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, "#0a1936");
      bg.addColorStop(0.5, "#040d21");
      bg.addColorStop(1, "#010511");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const radius = Math.min(W, H) * 0.36;
      // Halo
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, radius * 1.35);
      halo.addColorStop(0, "rgba(56, 189, 248, 0.35)");
      halo.addColorStop(1, "rgba(14, 165, 233, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();
      // Sphere
      const sphereBg = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
      sphereBg.addColorStop(0, "#082f49");
      sphereBg.addColorStop(1, "#020a17");
      ctx.fillStyle = sphereBg;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      // Latitude / Longitude lines
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.lineWidth = 1.2;
      for (const lat of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const latY = cy + lat * radius;
        const latR = radius * Math.cos(Math.asin(Math.abs(lat)));
        ctx.beginPath();
        ctx.ellipse(cx, latY, latR, latR * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * Math.abs(Math.cos(angle)), radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  {
    id: "newsroom-matrix",
    label: "Digital Newsroom Wall",
    draw: (ctx, W, H) => {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#090d16");
      bg.addColorStop(0.5, "#0d1b33");
      bg.addColorStop(1, "#02040a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const horizon = H * 0.42;
      ctx.strokeStyle = "rgba(30, 64, 175, 0.45)";
      ctx.lineWidth = 1;
      for (let y = horizon; y <= H; y += Math.max(8, (y - horizon) * 0.15)) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let x = -W * 0.2; x <= W * 1.2; x += 80) {
        ctx.beginPath();
        ctx.moveTo(W / 2, horizon);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      // Monitors
      const mW = W * 0.16;
      const mH = H * 0.18;
      const mY = horizon - mH * 1.1;
      for (let i = 0; i < 5; i++) {
        const mx = W * 0.05 + i * (mW + W * 0.035);
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mx, mY, mW, mH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(37, 99, 235, 0.25)";
        ctx.fillRect(mx + 4, mY + 4, mW - 8, mH - 8);
      }
    },
  },
  {
    id: "radar-sweep",
    label: "Weather Doppler Radar",
    draw: (ctx, W, H) => {
      const bg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, "#021a1a");
      bg.addColorStop(1, "#00080a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(W, H) * 0.42;
      ctx.strokeStyle = "rgba(20, 184, 166, 0.3)";
      ctx.lineWidth = 1.2;
      for (let r = maxR * 0.25; r <= maxR; r += maxR * 0.25) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();
      // Precipitation echoes
      ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
      ctx.beginPath();
      ctx.arc(cx + maxR * 0.35, cy - maxR * 0.25, maxR * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(234, 179, 8, 0.45)";
      ctx.beginPath();
      ctx.arc(cx + maxR * 0.42, cy - maxR * 0.22, maxR * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // Sweep line
      ctx.strokeStyle = "#5eead4";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * 0.7, cy - maxR * 0.7);
      ctx.stroke();
    },
  },
  {
    id: "breaking-pulse",
    label: "Breaking News Red Alert",
    draw: (ctx, W, H) => {
      const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
      bg.addColorStop(0, "rgba(185, 28, 28, 0.45)");
      bg.addColorStop(0.55, "#3b0707");
      bg.addColorStop(1, "#0f0202");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.rotate(-0.06);
      ctx.fillStyle = "rgba(220, 38, 38, 0.08)";
      for (let x = -W * 0.2; x < W * 1.4; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, -50);
        ctx.lineTo(x + 50, -50);
        ctx.lineTo(x - 50, H + 50);
        ctx.lineTo(x - 100, H + 50);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(239, 68, 68, 0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  {
    id: "podcast-wave",
    label: "Acoustic Podcast Neon",
    draw: (ctx, W, H) => renderProceduralMotion("podcastWave", ctx, W, H, 1.0),
  },
  {
    id: "market-ticker",
    label: "Wall Street Financial",
    draw: (ctx, W, H) => renderProceduralMotion("marketTicker", ctx, W, H, 1.0),
  },
  {
    id: "sports-arena",
    label: "Sports Arena Championship",
    draw: (ctx, W, H) => renderProceduralMotion("sportsArena", ctx, W, H, 1.0),
  },
  {
    id: "sunrise-briefing",
    label: "Morning Sunrise Briefing",
    draw: (ctx, W, H) => renderProceduralMotion("sunriseBriefing", ctx, W, H, 1.0),
  },
  {
    id: "vip-glamour",
    label: "VIP Hollywood Glamour",
    draw: (ctx, W, H) => renderProceduralMotion("vipGlamour", ctx, W, H, 1.0),
  },
  {
    id: "election-desk",
    label: "Election Decision Desk",
    draw: (ctx, W, H) => renderProceduralMotion("electionDesk", ctx, W, H, 1.0),
  },
  {
    id: "social-square",
    label: "Social Square Feed",
    draw: (ctx, W, H) => renderProceduralMotion("socialSquare", ctx, W, H, 1.0),
  },
  {
    id: "vertical-reels",
    label: "Vertical Reels Flash",
    draw: (ctx, W, H) => renderProceduralMotion("verticalReels", ctx, W, H, 1.0),
  },
  {
    id: "explainer-doc",
    label: "Explainer Documentary Blueprint",
    draw: (ctx, W, H) => renderProceduralMotion("explainerDoc", ctx, W, H, 1.0),
  },
];

/** Ready-made gradients for the Background panel. */
export const GRADIENTS: { label: string; from: string; to: string; angle: number }[] = [
  { label: "Deep blue", from: "#0f172a", to: "#1d4ed8", angle: 160 },
  { label: "Purple", from: "#3b0764", to: "#db2777", angle: 135 },
  { label: "Teal", from: "#042f2e", to: "#14b8a6", angle: 160 },
  { label: "Warm", from: "#7c2d12", to: "#f59e0b", angle: 135 },
  { label: "Mint", from: "#ecfeff", to: "#a7f3d0", angle: 160 },
  { label: "Charcoal", from: "#111827", to: "#4b5563", angle: 180 },
];

import { renderProceduralMotion, type MotionEngineKind } from "./templates/motionEngine";

export const SET_TO_MOTION_ENGINE: Record<string, MotionEngineKind> = {
  "globe-3d": "globe3d",
  "newsroom": "newsroomMatrix",
  "newsroom-matrix": "newsroomMatrix",
  "breaking-pulse": "breakingPulse",
  "radar-sweep": "radarSweep",
  "market-ticker": "marketTicker",
  "podcast-wave": "podcastWave",
  "sports-arena": "sportsArena",
  "tech-grid": "techGrid",
  "sunrise-briefing": "sunriseBriefing",
  "vip-glamour": "vipGlamour",
  "election-desk": "electionDesk",
  "social-square": "socialSquare",
  "vertical-reels": "verticalReels",
  "explainer-doc": "explainerDoc",
};

export const MOTION_SETS = new Set(Object.keys(SET_TO_MOTION_ENGINE));
export const isMotionSet = (id: string) => MOTION_SETS.has(id);

export const setLabel = (id: string) => STUDIO_SETS.find((s) => s.id === id)?.label ?? "Studio set";

/** Draw a code-drawn backdrop (gradient or studio set) at W × H. Media backdrops are drawn by the player. */
export function drawBackdrop(ctx: Ctx, b: Backdrop, W: number, H: number, t = 0): boolean {
  if (b.kind === "gradient") {
    linear(ctx, W, H, [[0, b.from], [1, b.to]], b.angle);
    return true;
  }
  if (b.kind === "set") {
    const engine = SET_TO_MOTION_ENGINE[b.id];
    if (engine && (t > 0 || isMotionSet(b.id))) {
      renderProceduralMotion(engine, ctx, W, H, t);
      return true;
    }
    const set = STUDIO_SETS.find((s) => s.id === b.id);
    if (!set) return false;
    ctx.save();
    set.draw(ctx, W, H);
    ctx.restore();
    return true;
  }
  return false;
}

/** The backdrop as a PNG the size of the canvas (for the export). */
export async function renderBackdropPng(b: Backdrop, W: number, H: number): Promise<Blob | null> {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx || !drawBackdrop(ctx, b, W, H)) return null;
  return new Promise((resolve) => cv.toBlob((x) => resolve(x), "image/png"));
}
