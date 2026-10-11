export type { SmartMixConfig, VolumeKeyframe } from "../edit/doc";
import {
  clipLength,
  mainStarts,
  mainTrack,
  type AudioPlaced,
  type SmartMixConfig,
  type TimelineDoc,
  type VideoClip,
  type VolumeKeyframe,
} from "../edit/doc";
import type { Range } from "../edit/timeline";

export const DEFAULT_SMART_MIX_CONFIG: SmartMixConfig = {
  enabled: true,
  priority: "both",
  duckAmount: 0.7,
  fadeDuration: 0.3,
  normalVolume: 1.0,
};

/** Checks if timestamp t falls inside any of the given speech ranges */
export function inSpeechRanges(ranges: Range[], t: number): boolean {
  return ranges.some((r) => t >= r.start && t <= r.end);
}

/** Merges overlapping or contiguous ranges sorted in chronological order */
export function mergeRanges(ranges: Range[]): Range[] {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = out[out.length - 1];
    if (cur.start <= prev.end + 0.04) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Converts clip-source pauses into timeline-relative speech ranges */
export function extractClipTimelineSpeech(
  clip: VideoClip | AudioPlaced,
  clipStart: number,
  silences: Record<string, Range[] | undefined>,
): Range[] {
  const speed = (clip as VideoClip).speed ?? 1;
  const quiet = silences[clip.mediaId] ?? [];
  const out: Range[] = [];
  let from = clip.in;

  for (const q of [...quiet, { start: clip.out, end: clip.out }].sort((a, b) => a.start - b.start)) {
    const a = Math.max(from, clip.in);
    const b = Math.min(q.start, clip.out);
    if (b > a + 0.05) {
      out.push({
        start: clipStart + (a - clip.in) / speed,
        end: clipStart + (b - clip.in) / speed,
      });
    }
    from = Math.max(from, q.end);
  }

  // If no silence markers exist yet (e.g. fresh clip or speech throughout), treat whole clip as speech
  if (!quiet.length && clip.out > clip.in) {
    out.push({
      start: clipStart,
      end: clipStart + (clip.out - clip.in) / speed,
    });
  }

  return out;
}

export type TrackedSpeechData = {
  videoSpeech: Range[];
  voiceoverSpeech: Range[];
};

/** Extracts timeline speech ranges for all eligible video clips and voiceovers */
export function extractAllSpeechRanges(
  doc: TimelineDoc,
  silences: Record<string, Range[] | undefined>,
  config?: Partial<SmartMixConfig>,
): TrackedSpeechData {
  const videoRanges: Range[] = [];
  const voiceRanges: Range[] = [];

  const main = mainTrack(doc);
  const mStarts = mainStarts(main.clips);

  for (const tr of doc.tracks) {
    if (tr.muted) continue;

    if (tr.kind === "main" && (!config?.videoTrackId || config.videoTrackId === tr.id)) {
      tr.clips.forEach((c, i) => {
        if (c.type === "video" && !c.muted && c.volume > 0) {
          videoRanges.push(...extractClipTimelineSpeech(c, mStarts[i], silences));
        }
      });
    } else if (tr.kind === "overlay" && (!config?.videoTrackId || config.videoTrackId === tr.id)) {
      for (const c of tr.clips) {
        if (c.type === "video" && !c.muted && c.volume > 0) {
          videoRanges.push(...extractClipTimelineSpeech(c, c.start, silences));
        }
      }
    } else if (tr.kind === "audio" && (!config?.voiceoverTrackId || config.voiceoverTrackId === tr.id)) {
      for (const c of tr.clips) {
        if (c.volume > 0) {
          voiceRanges.push(...extractClipTimelineSpeech(c, c.start, silences));
        }
      }
    }
  }

  return {
    videoSpeech: mergeRanges(videoRanges),
    voiceoverSpeech: mergeRanges(voiceRanges),
  };
}

/** Generates smooth trapezoidal volume keyframes for a clip given ducking event intervals */
export function generateClipVolumeKeyframes(
  clipStart: number,
  clipLen: number,
  duckIntervals: { start: number; end: number; targetVolume: number }[],
  normalVol = 1.0,
  fadeSec = 0.3,
): VolumeKeyframe[] {
  if (clipLen <= 0) return [];

  // Transform timeline intervals to clip-relative coordinates [0, clipLen]
  const relIntervals: { start: number; end: number; targetVolume: number }[] = [];
  for (const iv of duckIntervals) {
    const t0 = Math.max(0, iv.start - clipStart);
    const t1 = Math.min(clipLen, iv.end - clipStart);
    if (t1 > t0 + 0.02) {
      relIntervals.push({ start: t0, end: t1, targetVolume: iv.targetVolume });
    }
  }

  if (!relIntervals.length) return [];

  // Partition clip into constant volume subsegments
  const points = new Set<number>([0, clipLen]);
  for (const iv of relIntervals) {
    points.add(iv.start);
    points.add(iv.end);
  }
  const sortedPoints = Array.from(points).sort((a, b) => a - b);

  const segments: { start: number; end: number; vol: number }[] = [];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const s0 = sortedPoints[i];
    const s1 = sortedPoints[i + 1];
    if (s1 - s0 < 0.01) continue;
    const mid = (s0 + s1) / 2;
    const match = relIntervals.find((iv) => mid >= iv.start && mid <= iv.end);
    const vol = match ? match.targetVolume : normalVol;
    segments.push({ start: s0, end: s1, vol });
  }

  // Merge adjacent segments with same volume
  const merged: { start: number; end: number; vol: number }[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.vol - seg.vol) < 0.005) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  if (merged.length <= 1 && (!merged.length || Math.abs(merged[0].vol - normalVol) < 0.005)) {
    return [];
  }

  const events: { t: number; vol: number }[] = [];

  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const prev = merged[i - 1];
    const next = merged[i + 1];

    const volBefore = prev ? prev.vol : normalVol;

    // Start transition into cur
    if (!prev) {
      events.push({ t: 0, vol: cur.vol });
    } else if (cur.vol < volBefore) {
      events.push({ t: Math.max(0, cur.start - fadeSec), vol: volBefore });
      events.push({ t: cur.start, vol: cur.vol });
    } else {
      events.push({ t: cur.start, vol: volBefore });
      events.push({ t: Math.min(clipLen, cur.start + fadeSec), vol: cur.vol });
    }

    // End transition out of cur
    if (!next) {
      events.push({ t: clipLen, vol: cur.vol });
    }
  }

  // Deduplicate and sort
  events.sort((a, b) => a.t - b.t);

  const dedupped: VolumeKeyframe[] = [];
  for (const ev of events) {
    const roundedT = Math.round(ev.t * 1000) / 1000;
    const roundedVol = Math.round(ev.vol * 1000) / 1000;
    const prev = dedupped[dedupped.length - 1];
    if (prev && Math.abs(prev.t - roundedT) < 0.02) {
      prev.volume = Math.min(prev.volume, roundedVol);
    } else {
      dedupped.push({ t: roundedT, volume: roundedVol });
    }
  }

  if (dedupped[0].t > 0.05) dedupped.unshift({ t: 0, volume: normalVol });
  if (dedupped[dedupped.length - 1].t < clipLen - 0.05) dedupped.push({ t: clipLen, volume: normalVol });

  return dedupped;
}

/**
 * Applies Smart Audio Mix: detects dialogue and calculates volume automation keyframes
 * for all Video and Voiceover clips non-destructively.
 */
export function applySmartMix(
  doc: TimelineDoc,
  silences: Record<string, Range[] | undefined>,
  config: SmartMixConfig = DEFAULT_SMART_MIX_CONFIG,
): TimelineDoc {
  if (!config.enabled) {
    return resetSmartMix(doc);
  }

  const { videoSpeech, voiceoverSpeech } = extractAllSpeechRanges(doc, silences, config);

  const normalVol = config.normalVolume ?? 1.0;
  const duckVol = Math.max(0, normalVol * (1 - config.duckAmount));
  const fade = Math.max(0.05, Math.min(2.0, config.fadeDuration));

  // Determine overlap volumes based on Priority setting
  let overlapVideoVol = duckVol;
  let overlapVoiceVol = normalVol;

  if (config.priority === "voiceover") {
    overlapVoiceVol = normalVol;
    overlapVideoVol = duckVol;
  } else if (config.priority === "video") {
    overlapVideoVol = normalVol;
    overlapVoiceVol = duckVol;
  } else {
    // Intelligent Both: Balanced clarity ratio (Voiceover 85%, Video 60%)
    overlapVoiceVol = normalVol * 0.85;
    overlapVideoVol = normalVol * 0.60;
  }

  // Collect all boundary points to partition timeline into atomic intervals
  const boundarySet = new Set<number>();
  for (const r of [...videoSpeech, ...voiceoverSpeech]) {
    boundarySet.add(Math.round(r.start * 1000) / 1000);
    boundarySet.add(Math.round(r.end * 1000) / 1000);
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const videoDuckIntervals: { start: number; end: number; targetVolume: number }[] = [];
  const voiceDuckIntervals: { start: number; end: number; targetVolume: number }[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const t0 = boundaries[i];
    const t1 = boundaries[i + 1];
    if (t1 - t0 < 0.03) continue;
    const mid = (t0 + t1) / 2;

    const hasVideo = videoSpeech.some((r) => mid >= r.start && mid <= r.end);
    const hasVoice = voiceoverSpeech.some((r) => mid >= r.start && mid <= r.end);

    let vidVol = normalVol;
    let voiceVol = normalVol;

    if (hasVideo && hasVoice) {
      // Overlapping speech
      vidVol = overlapVideoVol;
      voiceVol = overlapVoiceVol;
    } else if (hasVideo && !hasVoice) {
      // Only Video speaking: duck voiceover
      vidVol = normalVol;
      voiceVol = duckVol;
    } else if (hasVoice && !hasVideo) {
      // Only Voiceover speaking: duck video
      vidVol = duckVol;
      voiceVol = normalVol;
    }

    if (vidVol < normalVol - 0.01) {
      const prev = videoDuckIntervals[videoDuckIntervals.length - 1];
      if (prev && Math.abs(prev.end - t0) < 0.04 && Math.abs(prev.targetVolume - vidVol) < 0.01) {
        prev.end = t1;
      } else {
        videoDuckIntervals.push({ start: t0, end: t1, targetVolume: vidVol });
      }
    }

    if (voiceVol < normalVol - 0.01) {
      const prev = voiceDuckIntervals[voiceDuckIntervals.length - 1];
      if (prev && Math.abs(prev.end - t0) < 0.04 && Math.abs(prev.targetVolume - voiceVol) < 0.01) {
        prev.end = t1;
      } else {
        voiceDuckIntervals.push({ start: t0, end: t1, targetVolume: voiceVol });
      }
    }
  }

  const mStarts = mainStarts(mainTrack(doc).clips);

  const updatedTracks = doc.tracks.map((tr) => {
    if (tr.kind === "main") {
      const isTarget = !config.videoTrackId || config.videoTrackId === tr.id;
      return {
        ...tr,
        clips: tr.clips.map((c, idx) => {
          if (c.type !== "video" || !isTarget) return c;
          const cStart = mStarts[idx];
          const cLen = clipLength(c);
          const kfs = generateClipVolumeKeyframes(cStart, cLen, videoDuckIntervals, normalVol, fade);
          return {
            ...c,
            volumeAutomation: kfs.length ? kfs : undefined,
          };
        }),
      };
    }

    if (tr.kind === "overlay") {
      const isTarget = !config.videoTrackId || config.videoTrackId === tr.id;
      return {
        ...tr,
        clips: tr.clips.map((c) => {
          if (c.type !== "video" || !isTarget) return c;
          const cStart = (c as { start: number }).start;
          const cLen = clipLength(c);
          const kfs = generateClipVolumeKeyframes(cStart, cLen, videoDuckIntervals, normalVol, fade);
          return {
            ...c,
            volumeAutomation: kfs.length ? kfs : undefined,
          };
        }),
      };
    }

    if (tr.kind === "audio") {
      const isTarget = !config.voiceoverTrackId || config.voiceoverTrackId === tr.id;
      return {
        ...tr,
        clips: tr.clips.map((c) => {
          if (!isTarget) return c;
          const cStart = c.start;
          const cLen = clipLength(c);
          const kfs = generateClipVolumeKeyframes(cStart, cLen, voiceDuckIntervals, normalVol, fade);
          return {
            ...c,
            volumeAutomation: kfs.length ? kfs : undefined,
          };
        }),
      };
    }

    return tr;
  });

  return {
    ...doc,
    tracks: updatedTracks,
    smartMix: {
      ...config,
      lastAnalyzedAt: Date.now(),
    },
  };
}

/** Resets Smart Audio Mix non-destructively: clears volume automation on all clips */
export function resetSmartMix(doc: TimelineDoc): TimelineDoc {
  const updatedTracks = doc.tracks.map((tr) => {
    if (tr.kind === "main") {
      return {
        ...tr,
        clips: tr.clips.map((c) => (c.type === "video" && c.volumeAutomation ? { ...c, volumeAutomation: undefined } : c)),
      };
    }
    if (tr.kind === "overlay") {
      return {
        ...tr,
        clips: tr.clips.map((c) => (c.type === "video" && c.volumeAutomation ? { ...c, volumeAutomation: undefined } : c)),
      };
    }
    if (tr.kind === "audio") {
      return {
        ...tr,
        clips: tr.clips.map((c) => (c.volumeAutomation ? { ...c, volumeAutomation: undefined } : c)),
      };
    }
    return tr;
  });

  return {
    ...doc,
    tracks: updatedTracks,
    smartMix: doc.smartMix ? { ...doc.smartMix, enabled: false } : undefined,
  };
}

/** Evaluates the active playback volume of a clip at a given offset in seconds */
export function evaluateVolumeAutomation(
  clip: { volume: number; volumeAutomation?: VolumeKeyframe[] },
  offsetSec: number,
): number {
  const kfs = clip.volumeAutomation;
  if (!kfs || !kfs.length) return clip.volume;

  if (offsetSec <= kfs[0].t) return kfs[0].volume;
  if (offsetSec >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].volume;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (offsetSec >= a.t && offsetSec <= b.t) {
      const dt = Math.max(1e-4, b.t - a.t);
      const frac = Math.max(0, Math.min(1, (offsetSec - a.t) / dt));
      return a.volume + (b.volume - a.volume) * frac;
    }
  }

  return clip.volume;
}

/** Generates FFmpeg volume filter expression from volume keyframes */
export function generateVolumeFilterExpr(kfs: VolumeKeyframe[], defaultVol = 1.0): string {
  if (!kfs || !kfs.length) return `volume=${defaultVol.toFixed(2)}`;
  if (kfs.length === 1) return `volume=${kfs[0].volume.toFixed(2)}`;

  // Construct piecewise linear interpolation for FFmpeg
  // volume='if(between(t,t0,t1),v0+(v1-v0)*(t-t0)/(t1-t0),if(...))':eval=frame
  const pieces: string[] = [];
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const dt = Math.max(1e-4, b.t - a.t);
    const dv = b.volume - a.volume;
    const vExpr = Math.abs(dv) < 1e-4 ? `${a.volume.toFixed(3)}` : `${a.volume.toFixed(3)}+(${dv.toFixed(3)})*(t-${a.t.toFixed(3)})/${dt.toFixed(3)}`;
    pieces.push(`between(t\\,${a.t.toFixed(3)}\\,${b.t.toFixed(3)})*(${vExpr})`);
  }

  return `volume='${pieces.join("+")}':eval=frame`;
}
