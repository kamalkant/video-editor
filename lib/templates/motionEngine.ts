/**
 * Hybrid Procedural Motion Engine
 * Real-time 60fps Canvas 2D motion loops for broadcast news backdrops and animated previews.
 * Offline-ready, zero-latency, and zero external bandwidth.
 */

import type { MotionEngineKind } from "./types";
export type { MotionEngineKind };


export function drawGlobe3D(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Deep broadcast navy/space backdrop
  const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, "#0a1936");
  bg.addColorStop(0.5, "#040d21");
  bg.addColorStop(1, "#010511");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Background star field / digital grid
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < W; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.min(W, H) * 0.36;
  const rot = (t * 0.45) % (Math.PI * 2);

  // Atmospheric outer glow
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, radius * 1.35);
  halo.addColorStop(0, "rgba(56, 189, 248, 0.35)");
  halo.addColorStop(0.6, "rgba(14, 165, 233, 0.12)");
  halo.addColorStop(1, "rgba(14, 165, 233, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // Globe dark base
  const sphereBg = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
  sphereBg.addColorStop(0, "#082f49");
  sphereBg.addColorStop(0.7, "#03172e");
  sphereBg.addColorStop(1, "#020a17");
  ctx.fillStyle = sphereBg;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Clip to globe circle for interior 3D lines
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Latitude circles (parallels)
  ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
  ctx.lineWidth = 1.2;
  const latitudes = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
  for (const lat of latitudes) {
    const latY = cy + lat * radius;
    const latR = radius * Math.cos(Math.asin(Math.abs(lat)));
    ctx.beginPath();
    ctx.ellipse(cx, latY, latR, latR * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Longitude meridians rotating smoothly
  const meridianCount = 14;
  for (let i = 0; i < meridianCount; i++) {
    const angle = rot + (i * Math.PI) / (meridianCount / 2);
    const cosAngle = Math.cos(angle);
    // Draw only front-facing or semi-transparent back
    const isFront = Math.sin(angle) >= 0;
    ctx.strokeStyle = isFront ? "rgba(56, 189, 248, 0.55)" : "rgba(56, 189, 248, 0.12)";
    ctx.lineWidth = isFront ? 1.5 : 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * Math.abs(cosAngle), radius, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Continental landmass dot clusters in orbit
  const clusterCount = 48;
  for (let i = 0; i < clusterCount; i++) {
    const phi = ((i * 137.5) * Math.PI) / 180;
    const theta = Math.asin(-1 + (2 * i) / clusterCount);
    const globeAngle = phi + rot;
    const z = Math.cos(theta) * Math.cos(globeAngle);
    if (z > -0.1) {
      const px = cx + radius * Math.cos(theta) * Math.sin(globeAngle);
      const py = cy + radius * Math.sin(theta);
      const alpha = Math.max(0.1, (z + 0.1) * 0.9);
      ctx.fillStyle = `rgba(125, 211, 252, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + z * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // Equator highlight ring
  ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Outer orbital satellite ring
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.28);
  ctx.strokeStyle = "rgba(14, 165, 233, 0.35)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.42, radius * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Satellite beacon dot
  const satAngle = (t * 0.8) % (Math.PI * 2);
  const satX = radius * 1.42 * Math.cos(satAngle);
  const satY = radius * 0.45 * Math.sin(satAngle);
  ctx.setLineDash([]);
  ctx.fillStyle = "#38bdf8";
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(satX, satY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawNewsroomMatrix(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Modern digital newsroom set with depth & cyber matrix
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#090d16");
  bg.addColorStop(0.45, "#0d1b33");
  bg.addColorStop(0.85, "#060a14");
  bg.addColorStop(1, "#02040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Perspective floor grid
  const horizon = H * 0.42;
  ctx.save();
  ctx.strokeStyle = "rgba(30, 64, 175, 0.45)";
  ctx.lineWidth = 1;

  // Horizontal floor lines moving towards camera
  const speed = 25;
  const offset = (t * speed) % 40;
  for (let y = horizon; y <= H; y += Math.max(4, (y - horizon) * 0.12)) {
    const actualY = y + (offset * (y - horizon)) / (H - horizon);
    if (actualY <= H) {
      ctx.beginPath();
      ctx.moveTo(0, actualY);
      ctx.lineTo(W, actualY);
      ctx.stroke();
    }
  }

  // Vanishing perspective rays
  const vanX = W / 2;
  for (let x = -W * 0.5; x <= W * 1.5; x += 60) {
    ctx.beginPath();
    ctx.moveTo(vanX, horizon);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  // Background monitor walls (newsroom monitors)
  const monitorW = W * 0.16;
  const monitorH = H * 0.18;
  const monitorY = horizon - monitorH * 1.1;

  for (let i = 0; i < 5; i++) {
    const mx = W * 0.05 + i * (monitorW + W * 0.035);
    // Monitor frame
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mx, monitorY, monitorW, monitorH, 6);
    ctx.fill();
    ctx.stroke();

    // Screen dynamic content glow
    const phase = Math.sin(t * 1.5 + i) * 0.5 + 0.5;
    const screenGlow = ctx.createLinearGradient(mx, monitorY, mx, monitorY + monitorH);
    screenGlow.addColorStop(0, `rgba(37, 99, 235, ${0.15 + phase * 0.2})`);
    screenGlow.addColorStop(1, `rgba(30, 58, 138, ${0.1 + phase * 0.15})`);
    ctx.fillStyle = screenGlow;
    ctx.fillRect(mx + 4, monitorY + 4, monitorW - 8, monitorH - 8);

    // Screen mini-data lines
    ctx.fillStyle = "rgba(147, 197, 253, 0.35)";
    for (let l = 0; l < 4; l++) {
      ctx.fillRect(mx + 10, monitorY + 12 + l * 12, (monitorW - 20) * (0.4 + ((i + l) % 3) * 0.25), 3);
    }
  }

  // Ambient center presenter light cone
  const spot = ctx.createRadialGradient(W / 2, H * 0.65, 30, W / 2, H * 0.65, W * 0.45);
  spot.addColorStop(0, "rgba(59, 130, 246, 0.25)");
  spot.addColorStop(0.5, "rgba(30, 58, 138, 0.1)");
  spot.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);
}

export function drawRadarSweep(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Severe weather Doppler radar environment
  const bg = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, "#021a1a");
  bg.addColorStop(0.6, "#011214");
  bg.addColorStop(1, "#00080a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(W, H) * 0.42;

  // Concentric range rings (50km, 100km, 150km, 200km)
  ctx.strokeStyle = "rgba(20, 184, 166, 0.25)";
  ctx.lineWidth = 1.2;
  for (let r = maxR * 0.25; r <= maxR; r += maxR * 0.25) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crosshairs & degree compass
  ctx.beginPath();
  ctx.moveTo(cx - maxR, cy);
  ctx.lineTo(cx + maxR, cy);
  ctx.moveTo(cx, cy - maxR);
  ctx.lineTo(cx, cy + maxR);
  ctx.stroke();

  // Simulated weather storm precipitation echoes (blobs)
  const clouds = [
    { x: cx + maxR * 0.35, y: cy - maxR * 0.25, r: maxR * 0.22, color: "rgba(34, 197, 94, 0.35)" },
    { x: cx + maxR * 0.42, y: cy - maxR * 0.22, r: maxR * 0.14, color: "rgba(234, 179, 8, 0.45)" },
    { x: cx + maxR * 0.45, y: cy - maxR * 0.20, r: maxR * 0.08, color: "rgba(239, 68, 68, 0.65)" },
    { x: cx - maxR * 0.4, y: cy + maxR * 0.3, r: maxR * 0.18, color: "rgba(34, 197, 94, 0.3)" },
    { x: cx - maxR * 0.36, y: cy + maxR * 0.32, r: maxR * 0.1, color: "rgba(234, 179, 8, 0.4)" },
  ];

  for (const c of clouds) {
    const drift = Math.sin(t * 0.3) * 6;
    const cg = ctx.createRadialGradient(c.x + drift, c.y + drift, 2, c.x + drift, c.y + drift, c.r);
    cg.addColorStop(0, c.color);
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(c.x + drift, c.y + drift, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rotating phosphor sweep beam with persistence trail
  const sweepAngle = (t * 1.8) % (Math.PI * 2);
  const trailSegments = 24;
  for (let i = 0; i < trailSegments; i++) {
    const a1 = sweepAngle - (i * 0.04);
    const a2 = sweepAngle - ((i + 1) * 0.04);
    const alpha = (1 - i / trailSegments) * 0.35;
    ctx.fillStyle = `rgba(45, 212, 191, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, a2, a1, false);
    ctx.closePath();
    ctx.fill();
  }

  // Bright sweep line
  ctx.strokeStyle = "#5eead4";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#5eead4";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + maxR * Math.cos(sweepAngle), cy + maxR * Math.sin(sweepAngle));
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawMarketTicker(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Financial markets & Bloomberg-style corporate backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#080c14");
  bg.addColorStop(0.5, "#0b1528");
  bg.addColorStop(1, "#030712");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle financial grid
  ctx.strokeStyle = "rgba(71, 85, 105, 0.15)";
  ctx.lineWidth = 1;
  for (let y = 50; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Floating stock candlestick charts in background
  const candles = 28;
  const candleW = W / (candles * 1.5);
  for (let i = 0; i < candles; i++) {
    const x = i * (candleW * 1.5) + 30;
    const wave = Math.sin(t * 0.8 + i * 0.5) * 40 + Math.cos(i * 0.3) * 60;
    const baseY = H * 0.5 + wave;
    const height = 20 + Math.abs(Math.sin(i * 1.7)) * 50;
    const isUp = Math.sin(i * 0.7 + t * 0.5) > 0;

    ctx.strokeStyle = isUp ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)";
    ctx.fillStyle = isUp ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)";
    ctx.lineWidth = 1.5;

    // Wick
    ctx.beginPath();
    ctx.moveTo(x + candleW / 2, baseY - height * 0.5 - 12);
    ctx.lineTo(x + candleW / 2, baseY + height * 0.5 + 12);
    ctx.stroke();

    // Body
    ctx.fillRect(x, baseY - height * 0.5, candleW, height);
    ctx.strokeRect(x, baseY - height * 0.5, candleW, height);
  }

  // Glowing moving index line
  ctx.save();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 20) {
    const y = H * 0.52 + Math.sin((x * 0.008) + t * 1.2) * 55 + Math.cos((x * 0.015) - t * 0.8) * 30;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBreakingPulse(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Urgent Breaking News crimson & dark carbon motion set
  const pulse = Math.sin(t * 3.5) * 0.15 + 0.85;

  const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
  bg.addColorStop(0, `rgba(185, 28, 28, ${0.45 * pulse})`);
  bg.addColorStop(0.55, "#3b0707");
  bg.addColorStop(1, "#0f0202");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Diagonal animated hazard chevron bars
  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(-0.06);
  const barSpeed = (t * 80) % 120;
  ctx.fillStyle = "rgba(220, 38, 38, 0.07)";
  for (let x = -W * 0.2 - barSpeed; x < W * 1.4; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, -50);
    ctx.lineTo(x + 50, -50);
    ctx.lineTo(x - 50, H + 50);
    ctx.lineTo(x - 100, H + 50);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Expanding emergency shockwave rings
  const shockPeriod = 2.2;
  const cycle = (t % shockPeriod) / shockPeriod;
  const ringR = cycle * Math.min(W, H) * 0.7;
  const ringAlpha = (1 - cycle) * 0.55;

  ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ef4444";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function drawPodcastWave(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Deep acoustic podcast studio with vibrant equalizer audio waves
  const bg = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, "#1e1035");
  bg.addColorStop(0.6, "#10061e");
  bg.addColorStop(1, "#05010a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Equalizer visualizer bars centered
  const bars = 48;
  const totalW = W * 0.75;
  const barW = (totalW / bars) * 0.65;
  const startX = (W - totalW) / 2;
  const cy = H * 0.5;

  for (let i = 0; i < bars; i++) {
    const x = startX + i * (totalW / bars);
    // Symmetric distance from center
    const distFromCenter = Math.abs(i - bars / 2) / (bars / 2);
    const weight = Math.cos(distFromCenter * (Math.PI / 2));
    const h = (Math.sin(t * 4 + i * 0.4) * 0.4 + 0.6) * 160 * weight + 10;

    const grad = ctx.createLinearGradient(x, cy - h / 2, x, cy + h / 2);
    grad.addColorStop(0, "#a855f7");
    grad.addColorStop(0.5, "#ec4899");
    grad.addColorStop(1, "#06b6d4");

    ctx.fillStyle = grad;
    ctx.shadowColor = "#d946ef";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(x, cy - h / 2, barW, h, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export function drawSportsArena(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Deep stadium charcoal & electric orange atmosphere
  const bg = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, Math.max(W, H) * 0.75);
  bg.addColorStop(0, "#2a1205");
  bg.addColorStop(0.5, "#120601");
  bg.addColorStop(1, "#050201");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Stadium curved roof arch truss
  ctx.save();
  ctx.strokeStyle = "rgba(249, 115, 22, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.15, W * 0.65, H * 0.35, 0, Math.PI, 0);
  ctx.stroke();

  // Arena light beam sweep (dual spotlights from top corners)
  const lAngle = Math.sin(t * 1.2) * 0.2 + 0.65;
  const rAngle = Math.cos(t * 1.2) * 0.2 + 2.45;

  // Left beam
  const gradL = ctx.createRadialGradient(0, 0, 10, W * Math.cos(lAngle), H * Math.sin(lAngle), Math.max(W, H) * 0.8);
  gradL.addColorStop(0, "rgba(251, 146, 60, 0.35)");
  gradL.addColorStop(0.5, "rgba(249, 115, 22, 0.08)");
  gradL.addColorStop(1, "rgba(249, 115, 22, 0)");
  ctx.fillStyle = gradL;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, Math.max(W, H) * 0.9, lAngle - 0.25, lAngle + 0.25);
  ctx.closePath();
  ctx.fill();

  // Right beam
  const gradR = ctx.createRadialGradient(W, 0, 10, W - W * Math.cos(rAngle), H * Math.sin(rAngle), Math.max(W, H) * 0.8);
  gradR.addColorStop(0, "rgba(251, 146, 60, 0.35)");
  gradR.addColorStop(0.5, "rgba(249, 115, 22, 0.08)");
  gradR.addColorStop(1, "rgba(249, 115, 22, 0)");
  ctx.fillStyle = gradR;
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.arc(W, 0, Math.max(W, H) * 0.9, rAngle - 0.25, rAngle + 0.25);
  ctx.closePath();
  ctx.fill();

  // Stadium perspective court/field lines
  const horizon = H * 0.62;
  ctx.strokeStyle = "rgba(249, 115, 22, 0.28)";
  ctx.lineWidth = 1.2;
  for (let x = -W * 0.3; x <= W * 1.3; x += W * 0.12) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + (x - W / 2) * 0.1, horizon);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let j = 0; j < 6; j++) {
    const y = horizon + (H - horizon) * Math.pow(j / 5, 1.6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTechGrid(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Deep cyber grid in electric cyan & neon blue
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#020712");
  bg.addColorStop(0.5, "#04152d");
  bg.addColorStop(1, "#01050d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const hz = H * 0.52;
  ctx.save();

  // Horizon beam
  const hGlow = ctx.createLinearGradient(0, hz - 20, 0, hz + 20);
  hGlow.addColorStop(0, "rgba(34, 211, 238, 0)");
  hGlow.addColorStop(0.5, "rgba(34, 211, 238, 0.45)");
  hGlow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = hGlow;
  ctx.fillRect(0, hz - 20, W, 40);

  // Perspective 3D grid lines
  ctx.strokeStyle = "rgba(34, 211, 238, 0.32)";
  ctx.lineWidth = 1;
  const colCount = 18;
  for (let i = -colCount / 2; i <= colCount / 2; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * W * 0.015, hz);
    ctx.lineTo(W / 2 + i * W * 0.14, H);
    ctx.stroke();
  }

  // Flowing grid horizon lines
  const offset = (t * 40) % 30;
  for (let y = hz + offset; y <= H; y += Math.max(8, (y - hz) * 0.2)) {
    const alpha = Math.min(0.4, (y - hz) / (H - hz));
    ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Floating data nodes above horizon
  for (let i = 0; i < 6; i++) {
    const x = W * (0.15 + i * 0.14);
    const y = hz * 0.35 + Math.sin(t * 2 + i) * 15;
    ctx.fillStyle = "rgba(56, 189, 248, 0.7)";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, hz);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawSunriseBriefing(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Warm dawn atmosphere from deep indigo sky to rich amber and gold
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1e1b4b");
  bg.addColorStop(0.4, "#431407");
  bg.addColorStop(0.7, "#b45309");
  bg.addColorStop(0.9, "#f59e0b");
  bg.addColorStop(1, "#fef3c7");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H * 0.72;

  // Golden sun disc with animated radial pulses
  const sunR = Math.min(W, H) * 0.22;
  const halo = ctx.createRadialGradient(cx, cy, sunR * 0.4, cx, cy, sunR * 1.8);
  halo.addColorStop(0, "rgba(254, 240, 138, 0.9)");
  halo.addColorStop(0.4, "rgba(245, 158, 11, 0.5)");
  halo.addColorStop(1, "rgba(217, 119, 6, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, sunR * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Subtle rotating light rays
  ctx.save();
  ctx.translate(cx, cy);
  const rot = (t * 0.15) % (Math.PI * 2);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(254, 240, 138, 0.06)";
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, Math.max(W, H), (i * Math.PI) / 6, (i * Math.PI) / 6 + Math.PI / 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Horizon base bar
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fillRect(0, H * 0.82, W, H * 0.18);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, H * 0.82, W, 2);
}

export function drawVipGlamour(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Ultra-luxurious Hollywood VIP atmosphere in magenta & champagne gold
  const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
  bg.addColorStop(0, "#4a0429");
  bg.addColorStop(0.55, "#200312");
  bg.addColorStop(1, "#0a0106");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Dual sweeping searchlight beams
  ctx.save();
  const a1 = Math.sin(t * 0.8) * 0.3 - 0.45;
  const a2 = Math.cos(t * 0.8) * 0.3 + 0.45;

  const beamW = W * 0.18;
  const drawBeam = (angle: number) => {
    ctx.save();
    ctx.translate(W / 2, H);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, 0, -H * 1.5);
    grad.addColorStop(0, "rgba(244, 114, 182, 0.4)");
    grad.addColorStop(0.5, "rgba(251, 191, 36, 0.15)");
    grad.addColorStop(1, "rgba(244, 114, 182, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-beamW * 0.3, 0);
    ctx.lineTo(-beamW * 1.5, -H * 1.5);
    ctx.lineTo(beamW * 1.5, -H * 1.5);
    ctx.lineTo(beamW * 0.3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  drawBeam(a1);
  drawBeam(a2);

  // Sparkling champagne particles
  const particleCount = 28;
  for (let i = 0; i < particleCount; i++) {
    const px = ((i * 73 + t * 25) % (W + 40)) - 20;
    const py = H - (((i * 59 + t * 45) % (H + 40)) - 20);
    const size = 1.5 + (i % 4) * 1.2;
    const alpha = Math.sin(t * 3 + i) * 0.3 + 0.6;
    ctx.fillStyle = i % 2 === 0 ? `rgba(251, 191, 36, ${alpha})` : `rgba(244, 114, 182, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawElectionDesk(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Split blue & red presidential command center
  const bg = ctx.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, "#0c1e4a");
  bg.addColorStop(0.48, "#050b1a");
  bg.addColorStop(0.52, "#180404");
  bg.addColorStop(1, "#450a0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Center division glow
  const midGlow = ctx.createLinearGradient(W * 0.45, 0, W * 0.55, 0);
  midGlow.addColorStop(0, "rgba(59, 130, 246, 0.2)");
  midGlow.addColorStop(0.5, "rgba(255, 255, 255, 0.45)");
  midGlow.addColorStop(1, "rgba(239, 68, 68, 0.2)");
  ctx.fillStyle = midGlow;
  ctx.fillRect(W * 0.48, 0, W * 0.04, H);

  // Constellation of floating democratic stars
  ctx.save();
  const starCount = 20;
  for (let i = 0; i < starCount; i++) {
    const sx = W * (0.08 + (i % 10) * 0.09);
    const sy = H * (0.15 + Math.floor(i / 10) * 0.35) + Math.sin(t + i) * 8;
    const isBlueSide = sx < W / 2;
    ctx.fillStyle = isBlueSide ? "rgba(147, 197, 253, 0.4)" : "rgba(252, 165, 165, 0.4)";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSocialSquare(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Modern Instagram & LinkedIn social gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1e1b4b");
  bg.addColorStop(0.5, "#0f172a");
  bg.addColorStop(1, "#042f2e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Floating geometric rings
  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  const rot = (t * 0.3) % (Math.PI * 2);
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, Math.min(W, H) * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
  ctx.strokeRect(-Math.min(W, H) * 0.28, -Math.min(W, H) * 0.28, Math.min(W, H) * 0.56, Math.min(W, H) * 0.56);
  ctx.restore();
}

export function drawVerticalReels(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // High-energy 9:16 vertical stream with vertical speed lines
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#080c1d");
  bg.addColorStop(0.5, "#0f172a");
  bg.addColorStop(1, "#1e1035");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Fast vertical speed streaks
  ctx.save();
  const streakCount = 18;
  for (let i = 0; i < streakCount; i++) {
    const sx = W * ((i + 0.5) / streakCount);
    const speed = 120 + (i % 4) * 60;
    const len = 60 + (i % 3) * 40;
    const sy = ((t * speed + i * 97) % (H + len)) - len;
    const alpha = 0.15 + (i % 3) * 0.1;

    const grad = ctx.createLinearGradient(0, sy, 0, sy + len);
    grad.addColorStop(0, `rgba(56, 189, 248, 0)`);
    grad.addColorStop(0.8, `rgba(56, 189, 248, ${alpha})`);
    grad.addColorStop(1, `rgba(168, 85, 247, ${alpha * 1.5})`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy + len);
    ctx.stroke();
  }

  // Neon edge guides (framing 9:16 mobile safe zone)
  ctx.strokeStyle = "rgba(168, 85, 247, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
  ctx.restore();
}

export function drawExplainerDoc(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // Professional documentary blueprint grid
  const bg = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, "#0c172e");
  bg.addColorStop(0.6, "#060b17");
  bg.addColorStop(1, "#02040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Architectural blueprint grid
  ctx.save();
  ctx.strokeStyle = "rgba(59, 130, 246, 0.12)";
  ctx.lineWidth = 1;
  const grid = 50;
  for (let x = 0; x < W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Micro-crosshairs (+) at intersections
  ctx.strokeStyle = "rgba(96, 165, 250, 0.35)";
  for (let x = grid * 2; x < W - grid; x += grid * 3) {
    for (let y = grid * 2; y < H - grid; y += grid * 3) {
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    }
  }

  // Animated documentary chapter axis bar
  const axisY = H * 0.78;
  ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.1, axisY);
  ctx.lineTo(W * 0.9, axisY);
  ctx.stroke();

  // Progress cursor along axis
  const curX = W * 0.1 + ((t * 0.1) % 1) * (W * 0.8);
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(curX, axisY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderProceduralMotion(engine: MotionEngineKind, ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  switch (engine) {
    case "globe3d":
      drawGlobe3D(ctx, W, H, t);
      break;
    case "newsroomMatrix":
      drawNewsroomMatrix(ctx, W, H, t);
      break;
    case "radarSweep":
      drawRadarSweep(ctx, W, H, t);
      break;
    case "marketTicker":
      drawMarketTicker(ctx, W, H, t);
      break;
    case "breakingPulse":
      drawBreakingPulse(ctx, W, H, t);
      break;
    case "podcastWave":
      drawPodcastWave(ctx, W, H, t);
      break;
    case "sportsArena":
      drawSportsArena(ctx, W, H, t);
      break;
    case "techGrid":
      drawTechGrid(ctx, W, H, t);
      break;
    case "sunriseBriefing":
      drawSunriseBriefing(ctx, W, H, t);
      break;
    case "vipGlamour":
      drawVipGlamour(ctx, W, H, t);
      break;
    case "electionDesk":
      drawElectionDesk(ctx, W, H, t);
      break;
    case "socialSquare":
      drawSocialSquare(ctx, W, H, t);
      break;
    case "verticalReels":
      drawVerticalReels(ctx, W, H, t);
      break;
    case "explainerDoc":
      drawExplainerDoc(ctx, W, H, t);
      break;
    default:
      drawGlobe3D(ctx, W, H, t);
  }
}

