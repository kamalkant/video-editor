import {
  buildPyramid,
  detectFaceCentroid,
  toGrayscale,
  trackFeature,
  type ImagePyramid,
  type Point2D,
} from "./opticalFlow";
import {
  trackingAt,
  type TrackingKeyframe,
  type TrackingPoint,
} from "./types";

export type TrackingRangeMode = "full" | "playhead" | "custom";
export type TrackingDirection = "forward" | "backward" | "both" | "stepForward" | "stepBackward";

export type TrackerOptions = {
  videoEl: HTMLVideoElement;
  point: TrackingPoint;
  direction?: TrackingDirection;
  rangeMode?: TrackingRangeMode;
  startSec?: number;
  endSec?: number;
  clipIn?: number;
  clipSpeed?: number;
  fps?: number;
  signal?: AbortSignal;
  onProgress?: (info: {
    currentTime: number;
    frameIndex: number;
    totalFrames: number;
    percent: number;
    keyframe: TrackingKeyframe;
  }) => void;
  onLost?: (info: {
    time: number;
    lastKnown: TrackingKeyframe;
    confidence: number;
  }) => void;
};

/**
 * Seeks HTMLVideoElement to a specific timestamp and waits until the frame is decoded and ready.
 * Resilient against seek interruptions, same-frame queries, and decode timeouts.
 */
async function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Tracking cancelled", "AbortError");

  const targetTime = Math.max(0, Math.min(video.duration || Infinity, time));

  // If already at or very close to targetTime and data is available, no seek needed
  if (Math.abs(video.currentTime - targetTime) < 0.005 && video.readyState >= 2) {
    return;
  }

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      video.removeEventListener("seeked", onDone);
      video.removeEventListener("error", onDone);
      signal?.removeEventListener("abort", onAbort);
      if (timer) clearTimeout(timer);
    };

    const onDone = () => {
      cleanup();
      resolve();
    };

    const onAbort = () => {
      cleanup();
      resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    video.addEventListener("seeked", onDone, { once: true });
    video.addEventListener("error", onDone, { once: true });

    // Safety timeout: if seeked doesn't fire within 800ms, proceed with current frame
    timer = setTimeout(onDone, 800);

    try {
      // Frame-accurate seek: Never use fastSeek which snaps to 1-2s keyframes
      video.currentTime = targetTime;
    } catch {
      onDone();
    }
  });
}

/**
 * Creates an HTMLCanvasElement or OffscreenCanvas safely in browser, web worker, or test environments.
 */
function createTrackingCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D;
} {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    return { canvas, ctx };
  }
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as unknown as CanvasRenderingContext2D;
    return { canvas: canvas as unknown as HTMLCanvasElement, ctx };
  }
  // Mock canvas context for Node.js / test execution
  const mockCtx = {
    drawImage: () => {},
    getImageData: () => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  } as unknown as CanvasRenderingContext2D;
  const mockCanvas = {
    width,
    height,
    getContext: () => mockCtx,
  } as unknown as HTMLCanvasElement;
  return { canvas: mockCanvas, ctx: mockCtx };
}

/**
 * Captures an ImageData from the current frame of an HTMLVideoElement.
 */
function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ctx: CanvasRenderingContext2D,
): ImageData {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 360;

  // Use a sensible processing resolution (up to 960px width) for ultra-fast tracking
  const maxDim = 960;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const pw = Math.max(16, Math.round(w * scale));
  const ph = Math.max(16, Math.round(h * scale));

  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  try {
    ctx.drawImage(video, 0, 0, pw, ph);
  } catch (err) {
    console.warn("captureFrame drawImage warning:", err);
  }
  return ctx.getImageData(0, 0, pw, ph);
}

/**
 * Executes local computer-vision tracking for a TrackingPoint across video frames.
 */
export async function runVideoTracking(options: TrackerOptions): Promise<{
  keyframes: TrackingKeyframe[];
  completed: boolean;
  lostAt?: { time: number; keyframe: TrackingKeyframe };
}> {
  const {
    videoEl,
    point,
    direction = "forward",
    fps = 30,
    signal,
    onProgress,
    onLost,
  } = options;

  if (signal?.aborted) {
    throw new DOMException("Tracking cancelled", "AbortError");
  }

  const duration = videoEl.duration || 10;
  const frameStep = 1 / Math.max(10, Math.min(60, fps));

  const startTime = options.startSec != null ? Math.max(0, options.startSec) : 0;
  const endTime = options.endSec != null ? Math.min(duration, options.endSec) : duration;
  const isPlayhead = (options.rangeMode === "playhead" || options.rangeMode === "custom") && options.startSec != null;
  const initialTime = Math.max(startTime, Math.min(endTime, isPlayhead ? options.startSec! : point.initial.t));

  const toMediaTime = (clipT: number) => {
    return (options.clipIn ?? 0) + clipT * (options.clipSpeed ?? 1);
  };

  const { canvas, ctx: ctx2d } = createTrackingCanvas(
    videoEl.videoWidth || 640,
    videoEl.videoHeight || 360,
  );

  // Initial frame capture at anchor time
  await seekVideo(videoEl, toMediaTime(initialTime), signal);
  const initImgData = captureFrame(videoEl, canvas, ctx2d);
  const pw = initImgData.width;
  const ph = initImgData.height;

  const initGray = toGrayscale(initImgData);
  const initialPyramid = buildPyramid(initGray);

  // Compute starting anchor position at initialTime
  const anchor = isPlayhead ? (trackingAt(point, initialTime) ?? point.initial) : point.initial;

  const initPtPixels: Point2D = {
    x: anchor.x * pw,
    y: anchor.y * ph,
  };

  const anchorBox = ("box" in anchor && anchor.box) ? anchor.box : point.initial.box;
  const anchorScale = ("scale" in anchor && typeof anchor.scale === "number") ? anchor.scale : 1;
  const anchorRotation = ("rotation" in anchor && typeof anchor.rotation === "number") ? anchor.rotation : 0;

  let boxSizePixels = {
    w: (anchorBox?.w ?? 0.1) * pw,
    h: (anchorBox?.h ?? 0.1) * ph,
  };

  const keyframeMap = new Map<number, TrackingKeyframe>();

  // Retain existing keyframes outside the re-tracked [startTime, endTime] window
  for (const k of point.keyframes) {
    if (k.t < startTime - 0.04 || k.t > endTime + 0.04) {
      keyframeMap.set(Math.round(k.t * 1000) / 1000, k);
    }
  }

  // Anchor initial keyframe at initialTime
  const initialKeyframe: TrackingKeyframe = {
    t: initialTime,
    x: anchor.x,
    y: anchor.y,
    scale: anchorScale,
    rotation: anchorRotation,
    box: anchorBox ?? { w: 0.1, h: 0.1 },
    confidence: 1,
  };
  keyframeMap.set(Math.round(initialTime * 1000) / 1000, initialKeyframe);

  // Helper to run sequential frames in one direction
  async function trackDirection(
    dir: "forward" | "backward",
    maxFrames?: number,
  ): Promise<{ lost: boolean; lostTime?: number; lostKeyframe?: TrackingKeyframe }> {
    const isFwd = dir === "forward";
    const dirLimit = isFwd ? endTime : startTime;
    const numFrames = maxFrames ?? Math.max(1, Math.round(Math.abs(dirLimit - initialTime) / frameStep));

    let prevPyramid: ImagePyramid = initialPyramid;
    let prevPt: Point2D = { ...initPtPixels };
    let curTime = initialTime;
    let frameIdx = 0;
    let velocity: Point2D = { x: 0, y: 0 };
    let consecutiveLostFrames = 0;
    let smoothScale = anchorScale;
    let smoothRotation = anchorRotation;

    const tolerance = point.settings.lostTolerance ?? "sticky";
    const maxConsecutiveLost = tolerance === "strict" ? 3 : tolerance === "normal" ? 6 : 10;

    while (
      (maxFrames == null || frameIdx < maxFrames) &&
      (isFwd ? curTime + frameStep <= endTime + 1e-4 : curTime - frameStep >= startTime - 1e-4)
    ) {
      if (signal?.aborted) throw new DOMException("Tracking cancelled", "AbortError");

      curTime = isFwd ? curTime + frameStep : curTime - frameStep;
      frameIdx++;

      // Seek video to next frame in media coordinates
      await seekVideo(videoEl, toMediaTime(curTime), signal);
      const currImgData = captureFrame(videoEl, canvas, ctx2d);
      const currGray = toGrayscale(currImgData);
      const currPyramid = buildPyramid(currGray);

      const blurAtt = point.attachments?.find((a) => a.type === "blur");
      const isEllipse = blurAtt ? blurAtt.shape === "ellipse" : point.type !== "area";

      // Perform local optical flow & template tracking with velocity prior
      const res = trackFeature(
        prevPyramid,
        currPyramid,
        initialPyramid,
        prevPt,
        initPtPixels,
        boxSizePixels,
        {
          trackScale: point.settings.trackScale,
          trackRotation: point.settings.trackRotation,
          accuracy: point.settings.accuracy,
          searchWindowSize: point.settings.searchWindowSize,
          templateSize: point.settings.templateSize,
          lostTolerance: point.settings.lostTolerance,
          isEllipse,
        },
        velocity,
      );

      if (res.isLost) {
        consecutiveLostFrames++;

        // For face tracking or area masks, re-acquire face across head turns and scene cuts
        const isFaceTracking =
          point.name.toLowerCase().includes("face") ||
          point.type === "area" ||
          point.attachments?.some((a) => a.type === "blur" || a.category === "sticker" || a.category === "element");
        const reacquired = isFaceTracking ? detectFaceCentroid(currImgData) : null;
        if (reacquired) {
          consecutiveLostFrames = 0;
          prevPt = { x: reacquired.x * pw, y: reacquired.y * ph };
          velocity = { x: 0, y: 0 };
          boxSizePixels = { w: reacquired.w * pw, h: reacquired.h * ph };

          const kf: TrackingKeyframe = {
            t: Math.round(curTime * 1000) / 1000,
            x: reacquired.x,
            y: reacquired.y,
            scale: smoothScale,
            rotation: smoothRotation,
            box: { w: reacquired.w, h: reacquired.h },
            confidence: 0.95,
          };
          keyframeMap.set(kf.t, kf);

          onProgress?.({
            currentTime: curTime,
            frameIndex: frameIdx,
            totalFrames: numFrames,
            percent: Math.min(100, Math.round((frameIdx / numFrames) * 100)),
            keyframe: kf,
          });

          prevPyramid = currPyramid;
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }

        if (consecutiveLostFrames > maxConsecutiveLost) {
          // Sustained loss for multiple consecutive frames -> notify user
          const lostKf: TrackingKeyframe = {
            t: Math.round(curTime * 1000) / 1000,
            x: Math.max(0, Math.min(1, prevPt.x / pw)),
            y: Math.max(0, Math.min(1, prevPt.y / ph)),
            scale: smoothScale,
            rotation: smoothRotation,
            box: point.initial.box,
            confidence: Math.round(res.confidence * 100) / 100,
          };
          onLost?.({
            time: curTime,
            lastKnown: lostKf,
            confidence: res.confidence,
          });
          return { lost: true, lostTime: curTime, lostKeyframe: lostKf };
        } else {
          // Coasting: advance position with existing momentum through momentary blur/occlusion
          const coastX = Math.max(0, Math.min(pw, prevPt.x + velocity.x));
          const coastY = Math.max(0, Math.min(ph, prevPt.y + velocity.y));
          const normX = coastX / pw;
          const normY = coastY / ph;

          const kf: TrackingKeyframe = {
            t: Math.round(curTime * 1000) / 1000,
            x: normX,
            y: normY,
            scale: smoothScale,
            rotation: smoothRotation,
            box: point.initial.box,
            confidence: Math.max(0.2, Math.round(res.confidence * 100) / 100),
          };
          keyframeMap.set(kf.t, kf);

          onProgress?.({
            currentTime: curTime,
            frameIndex: frameIdx,
            totalFrames: numFrames,
            percent: Math.min(100, Math.round((frameIdx / numFrames) * 100)),
            keyframe: kf,
          });

          prevPt = { x: coastX, y: coastY };
          prevPyramid = currPyramid;
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }
      }

      // Tracking successfully locked on
      consecutiveLostFrames = 0;
      const instantVx = res.pt.x - prevPt.x;
      const instantVy = res.pt.y - prevPt.y;
      velocity = {
        x: instantVx * 0.7 + velocity.x * 0.3,
        y: instantVy * 0.7 + velocity.y * 0.3,
      };

      smoothScale = Math.max(0.2, Math.min(4, smoothScale * 0.35 + res.scale * 0.65));
      smoothRotation = smoothRotation * 0.4 + res.rotation * 0.6;

      const normX = Math.max(0, Math.min(1, res.pt.x / pw));
      const normY = Math.max(0, Math.min(1, res.pt.y / ph));

      const kf: TrackingKeyframe = {
        t: Math.round(curTime * 1000) / 1000,
        x: normX,
        y: normY,
        scale: Math.round(smoothScale * 1000) / 1000,
        rotation: Math.round(smoothRotation * 10) / 10,
        box: {
          w: point.initial.box.w * smoothScale,
          h: point.initial.box.h * smoothScale,
        },
        confidence: Math.round(res.confidence * 100) / 100,
      };

      keyframeMap.set(kf.t, kf);

      onProgress?.({
        currentTime: curTime,
        frameIndex: frameIdx,
        totalFrames: numFrames,
        percent: Math.min(100, Math.round((frameIdx / numFrames) * 100)),
        keyframe: kf,
      });

      // Update state for next step
      prevPyramid = currPyramid;
      prevPt = res.pt;
      if (point.settings.trackScale && res.scale > 0.25 && res.scale < 4) {
        boxSizePixels = {
          w: Math.max(12, point.initial.box.w * res.scale * pw),
          h: Math.max(12, point.initial.box.h * res.scale * ph),
        };
      }

      // Yield to browser main thread so UI stays 100% responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    return { lost: false };
  }

  const lostInfo: { lostAt?: { time: number; keyframe: TrackingKeyframe } } = {};

  if (direction === "stepForward") {
    const fwdRes = await trackDirection("forward", 1);
    if (fwdRes.lost && fwdRes.lostTime != null && fwdRes.lostKeyframe) {
      lostInfo.lostAt = { time: fwdRes.lostTime, keyframe: fwdRes.lostKeyframe };
    }
  } else if (direction === "stepBackward") {
    const bwdRes = await trackDirection("backward", 1);
    if (bwdRes.lost && bwdRes.lostTime != null && bwdRes.lostKeyframe) {
      lostInfo.lostAt = { time: bwdRes.lostTime, keyframe: bwdRes.lostKeyframe };
    }
  } else {
    if (direction === "forward" || direction === "both") {
      const fwdRes = await trackDirection("forward");
      if (fwdRes.lost && fwdRes.lostTime != null && fwdRes.lostKeyframe) {
        lostInfo.lostAt = { time: fwdRes.lostTime, keyframe: fwdRes.lostKeyframe };
      }
    }

    if (direction === "backward" || direction === "both") {
      const bwdRes = await trackDirection("backward");
      if (bwdRes.lost && bwdRes.lostTime != null && bwdRes.lostKeyframe && !lostInfo.lostAt) {
        lostInfo.lostAt = { time: bwdRes.lostTime, keyframe: bwdRes.lostKeyframe };
      }
    }
  }

  // Sort keyframes by time
  const sorted = Array.from(keyframeMap.values()).sort((a, b) => a.t - b.t);

  return {
    keyframes: sorted,
    completed: !lostInfo.lostAt,
    ...lostInfo,
  };
}
