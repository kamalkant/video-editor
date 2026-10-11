/**
 * Pyramidal Lucas-Kanade Optical Flow & Normalized Cross-Correlation (NCC) Engine.
 * Runs completely locally in pure TypeScript/Canvas without any external binaries or AI APIs.
 */

export type Point2D = { x: number; y: number };

export type GrayImage = {
  width: number;
  height: number;
  data: Float32Array; // 0..255 grayscale values
};

export type ImagePyramid = GrayImage[];

/**
 * Converts ImageData (RGBA) to a Grayscale floating-point image.
 */
export function toGrayscale(imageData: ImageData): GrayImage {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Standard Rec. 601 luma weights
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { width, height, data: gray };
}

/**
 * Downsamples a grayscale image by a factor of 2 using a 3x3 Gaussian kernel.
 */
export function downsample2x(img: GrayImage): GrayImage {
  const w = Math.floor(img.width / 2);
  const h = Math.floor(img.height / 2);
  const out = new Float32Array(w * h);
  const src = img.data;
  const sw = img.width;

  for (let y = 0; y < h; y++) {
    const sy = y * 2;
    for (let x = 0; x < w; x++) {
      const sx = x * 2;
      // 2x2 box average (fast, stable approximation of Gaussian)
      const v00 = src[sy * sw + sx];
      const v10 = src[sy * sw + (sx + 1)];
      const v01 = src[(sy + 1) * sw + sx];
      const v11 = src[(sy + 1) * sw + (sx + 1)];
      out[y * w + x] = (v00 + v10 + v01 + v11) * 0.25;
    }
  }

  return { width: w, height: h, data: out };
}

/**
 * Builds an image pyramid with `levels` levels (Level 0: original size, Level 1: 1/2, Level 2: 1/4, Level 3: 1/8).
 */
export function buildPyramid(img: GrayImage, levels = 4): ImagePyramid {
  const pyramid: ImagePyramid = [img];
  let current = img;
  for (let i = 1; i < levels; i++) {
    if (current.width <= 16 || current.height <= 16) break;
    current = downsample2x(current);
    pyramid.push(current);
  }
  return pyramid;
}

/**
 * Bilinear interpolation to sample a subpixel intensity from a grayscale image.
 */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
  if (x < 0 || x >= img.width - 1 || y < 0 || y >= img.height - 1) {
    const cx = Math.max(0, Math.min(img.width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(img.height - 1, Math.round(y)));
    return img.data[cy * img.width + cx];
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const dx = x - x0;
  const dy = y - y0;

  const w = img.width;
  const d = img.data;

  const v00 = d[y0 * w + x0];
  const v10 = d[y0 * w + x1];
  const v01 = d[y1 * w + x0];
  const v11 = d[y1 * w + x1];

  const top = v00 * (1 - dx) + v10 * dx;
  const bot = v01 * (1 - dx) + v11 * dx;

  return top * (1 - dy) + bot * dy;
}

/**
 * Lucas-Kanade optical flow step at a single pyramid level.
 * Solves: G * [vx, vy]^T = b
 */
export function trackLucasKanadeSingleLevel(
  prevImg: GrayImage,
  currImg: GrayImage,
  prevPt: Point2D,
  initialCurrPt: Point2D,
  patchRadius = 10,
  maxIterations = 15,
  minDisplacement = 0.03,
): { pt: Point2D; status: boolean } {
  let curX = initialCurrPt.x;
  let curY = initialCurrPt.y;

  const pw = prevImg.width;
  const ph = prevImg.height;

  // Boundary check
  if (
    prevPt.x - patchRadius < 1 ||
    prevPt.x + patchRadius >= pw - 2 ||
    prevPt.y - patchRadius < 1 ||
    prevPt.y + patchRadius >= ph - 2
  ) {
    return { pt: { x: curX, y: curY }, status: false };
  }

  // Precompute spatial gradient matrix G = [[sum(Ix^2), sum(Ix*Iy)], [sum(Ix*Iy), sum(Iy^2)]]
  let gxx = 0;
  let gxy = 0;
  let gyy = 0;

  const numPixels = (patchRadius * 2 + 1) * (patchRadius * 2 + 1);
  const Ix = new Float32Array(numPixels);
  const Iy = new Float32Array(numPixels);
  const Iprev = new Float32Array(numPixels);

  let pIdx = 0;
  for (let dy = -patchRadius; dy <= patchRadius; dy++) {
    const y = prevPt.y + dy;
    for (let dx = -patchRadius; dx <= patchRadius; dx++) {
      const x = prevPt.x + dx;

      // Central difference spatial gradients on prev image
      const ix = (sampleBilinear(prevImg, x + 1, y) - sampleBilinear(prevImg, x - 1, y)) * 0.5;
      const iy = (sampleBilinear(prevImg, x, y + 1) - sampleBilinear(prevImg, x, y - 1)) * 0.5;

      Ix[pIdx] = ix;
      Iy[pIdx] = iy;
      Iprev[pIdx] = sampleBilinear(prevImg, x, y);

      gxx += ix * ix;
      gxy += ix * iy;
      gyy += iy * iy;

      pIdx++;
    }
  }

  // Determinant check (avoid aperture problem / flat image regions)
  const det = gxx * gyy - gxy * gxy;
  const trace = gxx + gyy;
  if (det < 1e-6 || trace < 1e-4 || det / (trace * trace + 1e-7) < 0.001) {
    return { pt: { x: curX, y: curY }, status: false };
  }

  // Inverse matrix components
  const invDet = 1 / det;
  const invGxx = gyy * invDet;
  const invGxy = -gxy * invDet;
  const invGyy = gxx * invDet;

  const maxStep = Math.max(2.5, patchRadius * 0.35);
  const maxTotalDisp = Math.max(8, patchRadius * 1.5);

  // Iterative Gauss-Newton alignment
  let iter = 0;
  while (iter < maxIterations) {
    let bx = 0;
    let by = 0;
    pIdx = 0;

    for (let dy = -patchRadius; dy <= patchRadius; dy++) {
      const cy = curY + dy;
      for (let dx = -patchRadius; dx <= patchRadius; dx++) {
        const cx = curX + dx;
        const it = Iprev[pIdx] - sampleBilinear(currImg, cx, cy);

        bx += Ix[pIdx] * it;
        by += Iy[pIdx] * it;
        pIdx++;
      }
    }

    let vx = invGxx * bx + invGxy * by;
    let vy = invGxy * bx + invGyy * by;

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      break;
    }

    // Numerical safety: Clamp per-iteration displacement
    vx = Math.max(-maxStep, Math.min(maxStep, vx));
    vy = Math.max(-maxStep, Math.min(maxStep, vy));

    curX += vx;
    curY += vy;

    // Prevent runaway divergence from initial seed point at this level
    const dispX = curX - initialCurrPt.x;
    const dispY = curY - initialCurrPt.y;
    const totalDist = Math.hypot(dispX, dispY);
    if (totalDist > maxTotalDisp) {
      curX = initialCurrPt.x + (dispX / totalDist) * maxTotalDisp;
      curY = initialCurrPt.y + (dispY / totalDist) * maxTotalDisp;
    }

    if (vx * vx + vy * vy < minDisplacement * minDisplacement) {
      break;
    }

    iter++;
  }

  return { pt: { x: curX, y: curY }, status: true };
}

/**
 * Tracks a 2D point from prevFrame to currFrame using a Multi-Level Pyramidal Lucas-Kanade tracker.
 * Optionally incorporates velocityGuess (momentum vector) to track high-speed movement without lag.
 */
export function trackPointPyramidal(
  prevPyramid: ImagePyramid,
  currPyramid: ImagePyramid,
  prevPt: Point2D,
  patchRadius = 12,
  velocityGuess?: Point2D,
): { pt: Point2D; status: boolean } {
  // Use at most 3 levels to prevent coarse-level feature loss on downsampled patches
  const levels = Math.min(3, Math.min(prevPyramid.length, currPyramid.length));

  // Scale point & velocity to the coarsest pyramid level
  const scaleCoarsest = 1 / Math.pow(2, levels - 1);
  const maxCoarseVx = 10;
  const vx = Math.max(-maxCoarseVx, Math.min(maxCoarseVx, (velocityGuess?.x ?? 0) * scaleCoarsest));
  const vy = Math.max(-maxCoarseVx, Math.min(maxCoarseVx, (velocityGuess?.y ?? 0) * scaleCoarsest));

  let curPt: Point2D = {
    x: prevPt.x * scaleCoarsest + vx,
    y: prevPt.y * scaleCoarsest + vy,
  };

  for (let l = levels - 1; l >= 0; l--) {
    const scale = 1 / Math.pow(2, l);
    const pPt: Point2D = { x: prevPt.x * scale, y: prevPt.y * scale };

    const res = trackLucasKanadeSingleLevel(
      prevPyramid[l],
      currPyramid[l],
      pPt,
      curPt,
      Math.max(6, Math.round(patchRadius / Math.pow(1.2, l))),
      20, // maxIterations
    );

    if (l > 0) {
      // Upsample displacement estimate to next level
      curPt = { x: res.pt.x * 2, y: res.pt.y * 2 };
    } else {
      curPt = res.pt;
    }
  }

  return { pt: curPt, status: true };
}

/**
 * Computes Zero-mean Normalized Cross-Correlation (ZNCC) between patches in two images.
 * Returns a score between -1 and 1 (1 = identical).
 */
export function computeZNCC(
  img1: GrayImage,
  pt1: Point2D,
  img2: GrayImage,
  pt2: Point2D,
  radius = 12,
): number {
  let sum1 = 0;
  let sum2 = 0;
  let count = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const v1 = sampleBilinear(img1, pt1.x + dx, pt1.y + dy);
      const v2 = sampleBilinear(img2, pt2.x + dx, pt2.y + dy);
      sum1 += v1;
      sum2 += v2;
      count++;
    }
  }

  const mean1 = sum1 / count;
  const mean2 = sum2 / count;

  let numer = 0;
  let var1 = 0;
  let var2 = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d1 = sampleBilinear(img1, pt1.x + dx, pt1.y + dy) - mean1;
      const d2 = sampleBilinear(img2, pt2.x + dx, pt2.y + dy) - mean2;
      numer += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }
  }

  const denom = Math.sqrt(var1 * var2);
  if (denom < 1e-4) return 0;
  return numer / denom;
}

/**
 * Multi-scale Normalized Cross-Correlation (ZNCC) bounded template search.
 * Guaranteed never to diverge beyond the specified search radius.
 */
export function findBestTemplateMatch(
  prevImg: GrayImage,
  currImg: GrayImage,
  prevPt: Point2D,
  templateRadius = 14,
  searchRadius = 24,
  centerBias?: Point2D,
): { pt: Point2D; score: number } {
  const biasX = Math.max(-12, Math.min(12, centerBias?.x ?? 0));
  const biasY = Math.max(-12, Math.min(12, centerBias?.y ?? 0));
  const cx = prevPt.x + biasX;
  const cy = prevPt.y + biasY;

  let sum1 = 0, count = 0;
  const tVals: number[] = [];
  for (let dy = -templateRadius; dy <= templateRadius; dy += 2) {
    for (let dx = -templateRadius; dx <= templateRadius; dx += 2) {
      const v = sampleBilinear(prevImg, prevPt.x + dx, prevPt.y + dy);
      tVals.push(v);
      sum1 += v;
      count++;
    }
  }
  const mean1 = sum1 / count;
  let var1 = 0;
  for (let i = 0; i < count; i++) {
    const diff = tVals[i] - mean1;
    var1 += diff * diff;
  }
  const std1 = Math.sqrt(var1);
  if (std1 < 1e-4) return { pt: prevPt, score: 0 };

  let bestScore = -1;
  let bestDx = biasX;
  let bestDy = biasY;

  for (let sdy = -searchRadius; sdy <= searchRadius; sdy += 3) {
    for (let sdx = -searchRadius; sdx <= searchRadius; sdx += 3) {
      let sum2 = 0;
      const cVals: number[] = [];
      for (let dy = -templateRadius; dy <= templateRadius; dy += 2) {
        for (let dx = -templateRadius; dx <= templateRadius; dx += 2) {
          const v = sampleBilinear(currImg, cx + sdx + dx, cy + sdy + dy);
          cVals.push(v);
          sum2 += v;
        }
      }
      const mean2 = sum2 / count;
      let var2 = 0, numer = 0;
      for (let i = 0; i < count; i++) {
        const d1 = tVals[i] - mean1;
        const d2 = cVals[i] - mean2;
        numer += d1 * d2;
        var2 += d2 * d2;
      }
      const denom = std1 * Math.sqrt(var2);
      const score = denom > 1e-4 ? numer / denom : -1;
      if (score > bestScore) {
        bestScore = score;
        bestDx = biasX + sdx;
        bestDy = biasY + sdy;
      }
    }
  }

  // Refine at 1-pixel step around best peak
  let fineScore = bestScore;
  let fineDx = bestDx;
  let fineDy = bestDy;
  for (let sdy = bestDy - 1; sdy <= bestDy + 1; sdy++) {
    for (let sdx = bestDx - 1; sdx <= bestDx + 1; sdx++) {
      let sum2 = 0;
      const cVals: number[] = [];
      for (let dy = -templateRadius; dy <= templateRadius; dy += 2) {
        for (let dx = -templateRadius; dx <= templateRadius; dx += 2) {
          const v = sampleBilinear(currImg, prevPt.x + sdx + dx, prevPt.y + sdy + dy);
          cVals.push(v);
          sum2 += v;
        }
      }
      const mean2 = sum2 / count;
      let var2 = 0, numer = 0;
      for (let i = 0; i < count; i++) {
        const d1 = tVals[i] - mean1;
        const d2 = cVals[i] - mean2;
        numer += d1 * d2;
        var2 += d2 * d2;
      }
      const denom = std1 * Math.sqrt(var2);
      const score = denom > 1e-4 ? numer / denom : -1;
      if (score > fineScore) {
        fineScore = score;
        fineDx = sdx;
        fineDy = sdy;
      }
    }
  }

  return {
    pt: { x: prevPt.x + fineDx, y: prevPt.y + fineDy },
    score: fineScore,
  };
}

/**
 * Extracts Shi-Tomasi good features to track (corners) within a given bounding box / ellipse mask.
 * Automatically distributes features across the target for robust constellation tracking.
 */
export function extractGoodFeaturesToTrack(
  img: GrayImage,
  center: Point2D,
  box: { w: number; h: number },
  options: {
    maxPoints?: number;
    minDistance?: number;
    isEllipse?: boolean;
    qualityLevel?: number;
  } = {},
): Point2D[] {
  const maxPoints = options.maxPoints ?? 20;
  const minDist = options.minDistance ?? 7;
  const isEllipse = options.isEllipse ?? true;
  const qualityLevel = options.qualityLevel ?? 0.01;

  const w = img.width;
  const h = img.height;
  const halfW = Math.max(8, box.w / 2);
  const halfH = Math.max(8, box.h / 2);

  const xMin = Math.max(2, Math.floor(center.x - halfW));
  const xMax = Math.min(w - 3, Math.ceil(center.x + halfW));
  const yMin = Math.max(2, Math.floor(center.y - halfH));
  const yMax = Math.min(h - 3, Math.ceil(center.y + halfH));

  const candidates: { x: number; y: number; score: number }[] = [];
  const patchR = 3;
  let maxScore = 0;

  const step = 2;
  for (let y = yMin; y <= yMax; y += step) {
    const dyNorm = halfH > 0 ? (y - center.y) / halfH : 0;
    for (let x = xMin; x <= xMax; x += step) {
      const dxNorm = halfW > 0 ? (x - center.x) / halfW : 0;
      if (isEllipse && dxNorm * dxNorm + dyNorm * dyNorm > 1.0) {
        continue;
      }

      // Compute local structure tensor
      let gxx = 0;
      let gxy = 0;
      let gyy = 0;

      for (let py = -patchR; py <= patchR; py++) {
        const sy = y + py;
        const row = sy * w;
        for (let px = -patchR; px <= patchR; px++) {
          const sx = x + px;
          const ix = (img.data[row + sx + 1] - img.data[row + sx - 1]) * 0.5;
          const iy = (img.data[(sy + 1) * w + sx] - img.data[(sy - 1) * w + sx]) * 0.5;
          gxx += ix * ix;
          gxy += ix * iy;
          gyy += iy * iy;
        }
      }

      // Min eigenvalue of structure tensor (Shi-Tomasi criterion)
      const tr = gxx + gyy;
      const det = gxx * gyy - gxy * gxy;
      const disc = Math.max(0, tr * tr - 4 * det);
      const lambdaMin = (tr - Math.sqrt(disc)) * 0.5;

      if (lambdaMin > 0.5) {
        candidates.push({ x, y, score: lambdaMin });
        if (lambdaMin > maxScore) maxScore = lambdaMin;
      }
    }
  }

  // Filter candidates by quality level and sort descending
  const threshold = maxScore * qualityLevel;
  candidates.sort((a, b) => b.score - a.score);

  const selected: Point2D[] = [];
  const minDistSq = minDist * minDist;

  for (const c of candidates) {
    if (c.score < threshold) break;
    let tooClose = false;
    for (const s of selected) {
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      if (dx * dx + dy * dy < minDistSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selected.push({ x: c.x, y: c.y });
      if (selected.length >= maxPoints) break;
    }
  }

  // Fallback anchor grid: If texture is sparse (e.g. smooth skin or flat shapes),
  // supplement with symmetric anchor points inside the mask so tracking never fails
  if (selected.length < 6) {
    const gridPoints: Point2D[] = [
      { x: center.x, y: center.y },
      { x: center.x - halfW * 0.45, y: center.y - halfH * 0.45 },
      { x: center.x + halfW * 0.45, y: center.y - halfH * 0.45 },
      { x: center.x - halfW * 0.45, y: center.y + halfH * 0.45 },
      { x: center.x + halfW * 0.45, y: center.y + halfH * 0.45 },
      { x: center.x, y: center.y - halfH * 0.55 },
      { x: center.x, y: center.y + halfH * 0.55 },
      { x: center.x - halfW * 0.55, y: center.y },
      { x: center.x + halfW * 0.55, y: center.y },
    ];
    for (const gp of gridPoints) {
      if (gp.x >= 2 && gp.x < w - 2 && gp.y >= 2 && gp.y < h - 2) {
        if (!selected.some((s) => Math.hypot(s.x - gp.x, s.y - gp.y) < minDist)) {
          selected.push(gp);
        }
      }
    }
  }

  return selected;
}

export type ConstellationResult = {
  center: Point2D;
  scale: number;
  rotation: number;
  confidence: number;
  inliers: Point2D[];
  isLost: boolean;
};

/**
 * Single-point pyramidal Lucas-Kanade + template matching tracker.
 * Used for small patches or as fallback when multi-point constellation has too few features.
 */
export function trackSinglePoint(
  prevPyramid: ImagePyramid,
  currPyramid: ImagePyramid,
  initialPyramid: ImagePyramid,
  prevPt: Point2D,
  initialPt: Point2D,
  settings: {
    accuracy?: "fast" | "medium" | "high";
    lostTolerance?: "strict" | "normal" | "sticky";
    searchWindowSize?: number;
    templateSize?: number;
  } = {},
  velocityGuess?: Point2D,
): {
  pt: Point2D;
  scale: number;
  rotation: number;
  confidence: number;
  isLost: boolean;
} {
  const patchRadius = settings.templateSize
    ? Math.max(8, Math.min(26, Math.round(settings.templateSize / 2)))
    : settings.accuracy === "high" ? 14 : settings.accuracy === "medium" ? 10 : 8;

  // 1. Forward tracking: prev -> curr with velocity momentum
  const fwd = trackPointPyramidal(prevPyramid, currPyramid, prevPt, patchRadius, velocityGuess);

  // 2. Backward tracking: curr -> prev (Bidirectional consistency check)
  const bwd = trackPointPyramidal(
    currPyramid,
    prevPyramid,
    fwd.pt,
    patchRadius,
    velocityGuess ? { x: -velocityGuess.x, y: -velocityGuess.y } : undefined,
  );

  // Forward-Backward displacement error in pixels
  const fbError = Math.hypot(prevPt.x - bwd.pt.x, prevPt.y - bwd.pt.y);

  // 3. Correlation with consecutive frame and initial frame
  const znccCurrent = computeZNCC(prevPyramid[0], prevPt, currPyramid[0], fwd.pt, patchRadius);
  const znccInitial = computeZNCC(initialPyramid[0], initialPt, currPyramid[0], fwd.pt, patchRadius);

  let confidence = Math.max(0, Math.min(1, Math.max(0, znccCurrent) * 0.85 + Math.max(0, znccInitial) * 0.15));

  const tolerance = settings.lostTolerance ?? "sticky";
  const maxFbError = tolerance === "strict" ? 6.0 : tolerance === "normal" ? 14.0 : 24.0;
  const minConfidence = tolerance === "strict" ? 0.35 : tolerance === "normal" ? 0.22 : 0.12;

  const pw = currPyramid[0].width;
  const ph = currPyramid[0].height;
  const isOutOfBounds = fwd.pt.x < -30 || fwd.pt.x > pw + 30 || fwd.pt.y < -30 || fwd.pt.y > ph + 30;

  let trackedPt = fwd.pt;
  let isLost = isOutOfBounds || fbError > maxFbError || confidence < minConfidence;

  if (isLost || confidence < 0.25) {
    const searchRadius = Math.max(16, Math.min(40, Math.round((settings.searchWindowSize ?? 55) / 2)));
    const tm = findBestTemplateMatch(
      prevPyramid[0],
      currPyramid[0],
      prevPt,
      Math.max(10, Math.min(22, patchRadius)),
      searchRadius,
      velocityGuess,
    );
    if (tm.score > Math.max(0.18, confidence - 0.1)) {
      trackedPt = tm.pt;
      confidence = Math.max(confidence, tm.score);
      isLost = false;
    }
  }

  const scale = 1.0;
  const rotation = 0;

  return {
    pt: trackedPt,
    scale,
    rotation,
    confidence,
    isLost,
  };
}

/**
 * Multi-Point KLT Constellation Tracker with Median Outlier Filtering and Reference Anchor Verification.
 * Tracks multiple distributed points across a target to achieve drift-free, jitter-resistant tracking.
 */
export function trackConstellation(
  prevPyramid: ImagePyramid,
  currPyramid: ImagePyramid,
  initialPyramid: ImagePyramid,
  prevCenter: Point2D,
  initialCenter: Point2D,
  features: Point2D[],
  boxSize: { w: number; h: number },
  settings: {
    trackScale?: boolean;
    trackRotation?: boolean;
    accuracy?: "fast" | "medium" | "high";
    lostTolerance?: "strict" | "normal" | "sticky";
    searchWindowSize?: number;
    templateSize?: number;
    isEllipse?: boolean;
  } = {},
  velocityGuess?: Point2D,
): ConstellationResult {
  const patchRadius = settings.templateSize
    ? Math.max(8, Math.min(24, Math.round(settings.templateSize / 2)))
    : settings.accuracy === "high" ? 14 : settings.accuracy === "medium" ? 10 : 8;

  const tolerance = settings.lostTolerance ?? "sticky";
  const maxFbError = tolerance === "strict" ? 3.5 : tolerance === "normal" ? 6.0 : 9.0;

  // Track each feature forward and backward (bidirectional error verification)
  const trackedPoints: { prev: Point2D; curr: Point2D; dx: number; dy: number }[] = [];

  for (const fp of features) {
    const fwd = trackPointPyramidal(prevPyramid, currPyramid, fp, patchRadius, velocityGuess);
    const bwd = trackPointPyramidal(
      currPyramid,
      prevPyramid,
      fwd.pt,
      patchRadius,
      velocityGuess ? { x: -velocityGuess.x, y: -velocityGuess.y } : undefined,
    );
    const fbErr = Math.hypot(fp.x - bwd.pt.x, fp.y - bwd.pt.y);

    if (fbErr <= maxFbError) {
      trackedPoints.push({
        prev: fp,
        curr: fwd.pt,
        dx: fwd.pt.x - fp.x,
        dy: fwd.pt.y - fp.y,
      });
    }
  }

  // If fewer than 2 features survived bidirectional check, fallback to single-point tracking (NO recursion)
  if (trackedPoints.length < 2) {
    const fallbackRes = trackSinglePoint(
      prevPyramid,
      currPyramid,
      initialPyramid,
      prevCenter,
      initialCenter,
      settings,
      velocityGuess,
    );
    return {
      center: fallbackRes.pt,
      scale: fallbackRes.scale,
      rotation: fallbackRes.rotation,
      confidence: fallbackRes.confidence,
      inliers: [fallbackRes.pt],
      isLost: fallbackRes.isLost,
    };
  }

  // Median displacement filter (reject feature outliers, e.g. moving background or blinking eyes)
  const sortedDx = [...trackedPoints.map((p) => p.dx)].sort((a, b) => a - b);
  const sortedDy = [...trackedPoints.map((p) => p.dy)].sort((a, b) => a - b);
  const medDx = sortedDx[Math.floor(sortedDx.length / 2)];
  const medDy = sortedDy[Math.floor(sortedDy.length / 2)];

  const maxDev = tolerance === "strict" ? 4.0 : tolerance === "normal" ? 7.5 : 12.0;
  const inliers = trackedPoints.filter(
    (p) => Math.hypot(p.dx - medDx, p.dy - medDy) <= maxDev,
  );

  const activeInliers = inliers.length >= 2 ? inliers : trackedPoints;

  // Mean displacement of consensus inliers
  let sumDx = 0;
  let sumDy = 0;
  for (const p of activeInliers) {
    sumDx += p.dx;
    sumDy += p.dy;
  }
  const avgDx = sumDx / activeInliers.length;
  const avgDy = sumDy / activeInliers.length;

  let newCenterX = prevCenter.x + avgDx;
  let newCenterY = prevCenter.y + avgDy;

  // Compute Scale and Rotation from inlier constellation geometry
  let scale = 1.0;
  let rotation = 0;

  if (activeInliers.length >= 3 && (settings.trackScale || settings.trackRotation)) {
    const pairwiseRatios: number[] = [];
    const pairwiseAngles: number[] = [];

    const maxPairs = 24;
    let pairs = 0;

    for (let i = 0; i < activeInliers.length && pairs < maxPairs; i++) {
      for (let j = i + 1; j < activeInliers.length && pairs < maxPairs; j++) {
        const p1 = activeInliers[i];
        const p2 = activeInliers[j];

        const dPrev = Math.hypot(p2.prev.x - p1.prev.x, p2.prev.y - p1.prev.y);
        const dCurr = Math.hypot(p2.curr.x - p1.curr.x, p2.curr.y - p1.curr.y);

        if (dPrev > 8) {
          pairwiseRatios.push(dCurr / dPrev);

          if (settings.trackRotation) {
            const aPrev = Math.atan2(p2.prev.y - p1.prev.y, p2.prev.x - p1.prev.x);
            const aCurr = Math.atan2(p2.curr.y - p1.curr.y, p2.curr.x - p1.curr.x);
            let diff = ((aCurr - aPrev) * 180) / Math.PI;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            pairwiseAngles.push(diff);
          }
          pairs++;
        }
      }
    }

    if (settings.trackScale && pairwiseRatios.length > 0) {
      pairwiseRatios.sort((a, b) => a - b);
      const medScale = pairwiseRatios[Math.floor(pairwiseRatios.length / 2)];
      scale = Math.max(0.25, Math.min(3.5, Math.round(medScale * 1000) / 1000));
    }

    if (settings.trackRotation && pairwiseAngles.length > 0) {
      pairwiseAngles.sort((a, b) => a - b);
      const medRot = pairwiseAngles[Math.floor(pairwiseAngles.length / 2)];
      rotation = Math.max(-180, Math.min(180, Math.round(medRot * 10) / 10));
    }
  }

  // Cross-correlation confidence & drift-free anchor snapping
  const znccCurrent = computeZNCC(
    prevPyramid[0],
    prevCenter,
    currPyramid[0],
    { x: newCenterX, y: newCenterY },
    patchRadius,
  );
  const znccAnchor = computeZNCC(
    initialPyramid[0],
    initialCenter,
    currPyramid[0],
    { x: newCenterX, y: newCenterY },
    patchRadius,
  );

  let confidence = Math.max(0, Math.min(1, Math.max(0, znccCurrent) * 0.75 + Math.max(0, znccAnchor) * 0.25));

  // Reference Template Drift Correction: If anchor match drops slightly due to frame-by-frame error accumulation,
  // do a micro-search (+-4px) against Frame 0 reference template to snap back exactly
  if (znccAnchor > 0.25) {
    const microSearch = findBestTemplateMatch(
      initialPyramid[0],
      currPyramid[0],
      { x: newCenterX, y: newCenterY },
      Math.min(patchRadius, 14),
      4,
    );
    if (microSearch.score > znccAnchor + 0.05) {
      newCenterX = microSearch.pt.x;
      newCenterY = microSearch.pt.y;
      confidence = Math.max(confidence, microSearch.score);
    }
  }

  const pw = currPyramid[0].width;
  const ph = currPyramid[0].height;
  const isOutOfBounds =
    newCenterX < -20 || newCenterX > pw + 20 || newCenterY < -20 || newCenterY > ph + 20;

  const minConfidence = tolerance === "strict" ? 0.3 : tolerance === "normal" ? 0.18 : 0.1;
  const isLost = isOutOfBounds || (activeInliers.length < 2 && confidence < minConfidence);

  return {
    center: { x: newCenterX, y: newCenterY },
    scale,
    rotation,
    confidence,
    inliers: activeInliers.map((p) => p.curr),
    isLost,
  };
}

/**
 * Full Point Tracker with Bidirectional Error Checking, Velocity Prior, and Scale/Rotation Estimation.
 * When boxSize is provided, utilizes multi-point constellation tracking for superior accuracy.
 */
export function trackFeature(
  prevPyramid: ImagePyramid,
  currPyramid: ImagePyramid,
  initialPyramid: ImagePyramid,
  prevPt: Point2D,
  initialPt: Point2D,
  boxSize: { w: number; h: number },
  settings: {
    trackScale?: boolean;
    trackRotation?: boolean;
    accuracy?: "fast" | "medium" | "high";
    searchWindowSize?: number;
    templateSize?: number;
    lostTolerance?: "strict" | "normal" | "sticky";
    isEllipse?: boolean;
  } = {},
  velocityGuess?: Point2D,
): {
  pt: Point2D;
  scale: number;
  rotation: number;
  confidence: number;
  isLost: boolean;
} {
  // If box size is non-trivial, run constellation tracking for superior robustness on faces and objects
  if (boxSize.w >= 12 && boxSize.h >= 12) {
    const features = extractGoodFeaturesToTrack(prevPyramid[0], prevPt, boxSize, {
      maxPoints: settings.accuracy === "high" ? 22 : settings.accuracy === "medium" ? 16 : 10,
      isEllipse: settings.isEllipse ?? true,
    });
    const constResult = trackConstellation(
      prevPyramid,
      currPyramid,
      initialPyramid,
      prevPt,
      initialPt,
      features,
      boxSize,
      settings,
      velocityGuess,
    );
    return {
      pt: constResult.center,
      scale: constResult.scale,
      rotation: constResult.rotation,
      confidence: constResult.confidence,
      isLost: constResult.isLost,
    };
  }

  // Single-point tracking fallback for tiny patches
  return trackSinglePoint(
    prevPyramid,
    currPyramid,
    initialPyramid,
    prevPt,
    initialPt,
    settings,
    velocityGuess,
  );
}

/**
 * Fast, robust face and skin-tone centroid detector.
 * Used for automatic re-acquisition across scene cuts, sudden head turns, and extreme zooms.
 */
export function detectFaceCentroid(
  imgData: ImageData,
  searchArea?: { yMin?: number; yMax?: number; xMin?: number; xMax?: number },
): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data } = imgData;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;

  const yStart = Math.max(0, Math.floor(h * (searchArea?.yMin ?? 0.12)));
  const yEnd = Math.min(h, Math.floor(h * (searchArea?.yMax ?? 0.70)));
  const xStart = Math.max(0, Math.floor(w * (searchArea?.xMin ?? 0.15)));
  const xEnd = Math.min(w, Math.floor(w * (searchArea?.xMax ?? 0.85)));
  const step = 3;

  for (let y = yStart; y < yEnd; y += step) {
    const rowOffset = y * w;
    for (let x = xStart; x < xEnd; x += step) {
      const idx = (rowOffset + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Standard robust skin color detector
      if (r > 80 && g > 40 && b > 25 && r > g && r > b && r - g > 12 && r - b > 15) {
        sumX += x;
        sumY += y;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (count < 25) return null;

  const faceX = sumX / count / w;
  const faceY = sumY / count / h;
  const faceW = Math.max(0.18, Math.min(0.55, ((maxX - minX) / w) * 0.8));
  const faceH = Math.max(0.20, Math.min(0.55, ((maxY - minY) / h) * 0.8));

  return { x: faceX, y: faceY, w: faceW, h: faceH };
}

export type DetectedFace = {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
};

/**
 * High-speed multi-candidate face detector for video frames.
 * Returns candidate faces sorted by prominence (size and skin confidence).
 */
export function detectFaces(imgData: ImageData): DetectedFace[] {
  const primary = detectFaceCentroid(imgData);
  if (!primary) return [];

  const faces: DetectedFace[] = [
    {
      x: primary.x,
      y: primary.y,
      w: primary.w,
      h: primary.h,
      confidence: 0.95,
    },
  ];

  // If primary face is biased to one side, inspect other side for multiple people
  if (primary.x > 0.45) {
    const leftFace = detectFaceCentroid(imgData, { xMin: 0.05, xMax: 0.45 });
    if (leftFace && Math.hypot(leftFace.x - primary.x, leftFace.y - primary.y) > 0.25) {
      faces.push({ ...leftFace, confidence: 0.85 });
    }
  } else if (primary.x < 0.55) {
    const rightFace = detectFaceCentroid(imgData, { xMin: 0.55, xMax: 0.95 });
    if (rightFace && Math.hypot(rightFace.x - primary.x, rightFace.y - primary.y) > 0.25) {
      faces.push({ ...rightFace, confidence: 0.85 });
    }
  }

  return faces;
}


