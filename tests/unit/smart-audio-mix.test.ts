import { describe, expect, it } from "vitest";
import {
  DEFAULT_SMART_MIX_CONFIG,
  extractClipTimelineSpeech,
  extractAllSpeechRanges,
  generateClipVolumeKeyframes,
  applySmartMix,
  resetSmartMix,
  evaluateVolumeAutomation,
  generateVolumeFilterExpr,
} from "@/lib/audio/smartMix";
import { soundLevel } from "@/lib/player/sound";
import {
  emptyDoc,
  mainTrack,
  type VideoClip,
  type AudioPlaced,
} from "@/lib/edit/doc";

function makeVideoClip(id: string, mediaId: string, inT = 0, outT = 10, speed = 1): VideoClip {
  return {
    id,
    type: "video",
    mediaId,
    in: inT,
    out: outT,
    speed,
    ops: [],
    transform: { fit: "fit", x: 0, y: 0, scale: 1, rotation: 0 },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

function makeAudioClip(id: string, mediaId: string, inT = 0, outT = 10, start = 0): AudioPlaced {
  return {
    id,
    type: "audio",
    mediaId,
    in: inT,
    out: outT,
    start,
    volume: 1,
    duck: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

describe("Smart Audio Mix / Dialogue Ducking", () => {
  const videoMediaId = "00000000-0000-4000-8000-000000000001";
  const voiceMediaId = "00000000-0000-4000-8000-000000000002";

  it("extracts speech ranges from clip taking silences, speed, and in/out into account", () => {
    const clip = makeVideoClip("v1", videoMediaId, 2, 8, 1); // length = 6s

    // Pauses at 3-4s and 6-7s in media time
    const silences = {
      [videoMediaId]: [
        { start: 3, end: 4 },
        { start: 6, end: 7 },
      ],
    };

    const speech = extractClipTimelineSpeech(clip, 5.0, silences);
    // Clip starts at timeline t=5.0
    // Speech segment 1: media 2 to 3 -> timeline 5.0 to 6.0
    // Speech segment 2: media 4 to 6 -> timeline 7.0 to 9.0
    // Speech segment 3: media 7 to 8 -> timeline 10.0 to 11.0
    expect(speech).toHaveLength(3);
    expect(speech[0].start).toBeCloseTo(5.0);
    expect(speech[0].end).toBeCloseTo(6.0);
    expect(speech[1].start).toBeCloseTo(7.0);
    expect(speech[1].end).toBeCloseTo(9.0);
    expect(speech[2].start).toBeCloseTo(10.0);
    expect(speech[2].end).toBeCloseTo(11.0);
  });

  it("scales speech timeline range when clip speed is altered", () => {
    const clip = makeVideoClip("v1", videoMediaId, 0, 10, 2.0); // 2x speed -> 5s on timeline

    const silences = {
      [videoMediaId]: [{ start: 2, end: 4 }],
    };

    const speech = extractClipTimelineSpeech(clip, 0, silences);
    expect(speech).toHaveLength(2);
    // Segment 1: 0 to 2s media -> 0 to 1s timeline
    expect(speech[0].start).toBeCloseTo(0);
    expect(speech[0].end).toBeCloseTo(1.0);
    // Segment 2: 4 to 10s media -> 2 to 5s timeline
    expect(speech[1].start).toBeCloseTo(2.0);
    expect(speech[1].end).toBeCloseTo(5.0);
  });

  it("generates trapezoidal volume keyframes with smooth fade ramps", () => {
    const clipStart = 0;
    const clipLen = 10;
    const duckIntervals = [
      { start: 3, end: 6, targetVolume: 0.3 },
    ];
    const normalVol = 1.0;
    const fadeSec = 0.4;

    const kfs = generateClipVolumeKeyframes(clipStart, clipLen, duckIntervals, normalVol, fadeSec);
    expect(kfs.length).toBeGreaterThanOrEqual(4);

    // Should start at normal volume at t=0
    expect(kfs[0].t).toBe(0);
    expect(kfs[0].volume).toBe(1.0);

    // Ramp starts before t=3.0 (at 2.6s)
    const rampStart = kfs.find((k) => Math.abs(k.t - 2.6) < 0.05);
    expect(rampStart).toBeDefined();
    expect(rampStart?.volume).toBe(1.0);

    // Fully ducked at t=3.0
    const duckStart = kfs.find((k) => Math.abs(k.t - 3.0) < 0.05);
    expect(duckStart).toBeDefined();
    expect(duckStart?.volume).toBe(0.3);

    // Fully ducked until t=6.0
    const duckEnd = kfs.find((k) => Math.abs(k.t - 6.0) < 0.05);
    expect(duckEnd).toBeDefined();
    expect(duckEnd?.volume).toBe(0.3);

    // Ramp finishes at t=6.4s
    const rampEnd = kfs.find((k) => Math.abs(k.t - 6.4) < 0.05);
    expect(rampEnd).toBeDefined();
    expect(rampEnd?.volume).toBe(1.0);

    // Clip end has normal volume
    expect(kfs[kfs.length - 1].t).toBe(10);
    expect(kfs[kfs.length - 1].volume).toBe(1.0);
  });

  it("applies intelligent both priority mixing during speech overlap (85% Voiceover, 60% Video)", () => {
    let doc = emptyDoc();
    const vidClip = makeVideoClip("v1", videoMediaId, 0, 10);
    mainTrack(doc).clips.push(vidClip);

    const voiceClip = makeAudioClip("a1", voiceMediaId, 0, 10, 0);
    const audioTrack = doc.tracks.find((t) => t.kind === "audio")!;
    audioTrack.clips.push(voiceClip);

    // Video speaks 2s to 6s (silences: 0-2s, 6-10s)
    // Voiceover speaks 4s to 8s (silences: 0-4s, 8-10s)
    // Overlap: 4s to 6s
    const silences = {
      [videoMediaId]: [
        { start: 0, end: 2 },
        { start: 6, end: 10 },
      ],
      [voiceMediaId]: [
        { start: 0, end: 4 },
        { start: 8, end: 10 },
      ],
    };

    const mixedDoc = applySmartMix(doc, silences, {
      ...DEFAULT_SMART_MIX_CONFIG,
      enabled: true,
      priority: "both",
      duckAmount: 0.7, // duck level = 0.3
      fadeDuration: 0.2,
      normalVolume: 1.0,
    });

    const outVid = mainTrack(mixedDoc).clips[0] as VideoClip;
    const outVoice = mixedDoc.tracks.find((t) => t.kind === "audio")!.clips[0] as AudioPlaced;

    // Both should have volumeAutomation keyframes
    expect(outVid.volumeAutomation).toBeDefined();
    expect(outVoice.volumeAutomation).toBeDefined();

    // Verify non-destructive: original clip.volume is untouched
    expect(outVid.volume).toBe(1.0);
    expect(outVoice.volume).toBe(1.0);

    // Check preview volume at t=3s (only Video speaking):
    // Video should be normal volume ~1.0
    // Voiceover should be ducked ~0.3
    const vidAt3 = evaluateVolumeAutomation(outVid, 3.0);
    const voiceAt3 = evaluateVolumeAutomation(outVoice, 3.0);
    expect(vidAt3).toBeCloseTo(1.0, 1);
    expect(voiceAt3).toBeCloseTo(0.3, 1);

    // Check preview volume at t=5s (Overlapping speech):
    // Intelligent Both ratio: Voiceover 85% (0.85), Video 60% (0.60)
    const vidAt5 = evaluateVolumeAutomation(outVid, 5.0);
    const voiceAt5 = evaluateVolumeAutomation(outVoice, 5.0);
    expect(voiceAt5).toBeCloseTo(0.85, 1);
    expect(vidAt5).toBeCloseTo(0.60, 1);

    // Check preview volume at t=7s (only Voiceover speaking):
    // Voiceover should be normal volume ~1.0
    // Video should be ducked ~0.3
    const vidAt7 = evaluateVolumeAutomation(outVid, 7.0);
    const voiceAt7 = evaluateVolumeAutomation(outVoice, 7.0);
    expect(voiceAt7).toBeCloseTo(1.0, 1);
    expect(vidAt7).toBeCloseTo(0.3, 1);
  });

  it("handles voiceover-first priority mode correctly", () => {
    let doc = emptyDoc();
    const vidClip = makeVideoClip("v1", videoMediaId, 0, 10);
    mainTrack(doc).clips.push(vidClip);

    const voiceClip = makeAudioClip("a1", voiceMediaId, 0, 10, 0);
    const audioTrack = doc.tracks.find((t) => t.kind === "audio")!;
    audioTrack.clips.push(voiceClip);

    // Video speaks 2-8s, Voiceover speaks 4-9s (Overlap 4-8s)
    const silences = {
      [videoMediaId]: [{ start: 0, end: 2 }, { start: 8, end: 10 }],
      [voiceMediaId]: [{ start: 0, end: 4 }, { start: 9, end: 10 }],
    };

    const mixedDoc = applySmartMix(doc, silences, {
      ...DEFAULT_SMART_MIX_CONFIG,
      enabled: true,
      priority: "voiceover",
      duckAmount: 0.7,
      fadeDuration: 0.2,
      normalVolume: 1.0,
    });

    const outVid = mainTrack(mixedDoc).clips[0] as VideoClip;
    const outVoice = mixedDoc.tracks.find((t) => t.kind === "audio")!.clips[0] as AudioPlaced;

    // At t=6s (both speaking), Voiceover priority keeps voiceover at 1.0 and ducks video to 0.3
    expect(evaluateVolumeAutomation(outVoice, 6.0)).toBeCloseTo(1.0, 1);
    expect(evaluateVolumeAutomation(outVid, 6.0)).toBeCloseTo(0.3, 1);
  });

  it("handles video-first priority mode correctly", () => {
    let doc = emptyDoc();
    const vidClip = makeVideoClip("v1", videoMediaId, 0, 10);
    mainTrack(doc).clips.push(vidClip);

    const voiceClip = makeAudioClip("a1", voiceMediaId, 0, 10, 0);
    const audioTrack = doc.tracks.find((t) => t.kind === "audio")!;
    audioTrack.clips.push(voiceClip);

    // Video speaks 2-8s, Voiceover speaks 4-9s (Overlap 4-8s)
    const silences = {
      [videoMediaId]: [{ start: 0, end: 2 }, { start: 8, end: 10 }],
      [voiceMediaId]: [{ start: 0, end: 4 }, { start: 9, end: 10 }],
    };

    const mixedDoc = applySmartMix(doc, silences, {
      ...DEFAULT_SMART_MIX_CONFIG,
      enabled: true,
      priority: "video",
      duckAmount: 0.7,
      fadeDuration: 0.2,
      normalVolume: 1.0,
    });

    const outVid = mainTrack(mixedDoc).clips[0] as VideoClip;
    const outVoice = mixedDoc.tracks.find((t) => t.kind === "audio")!.clips[0] as AudioPlaced;

    // At t=6s (both speaking), Video priority keeps video at 1.0 and ducks voiceover to 0.3
    expect(evaluateVolumeAutomation(outVid, 6.0)).toBeCloseTo(1.0, 1);
    expect(evaluateVolumeAutomation(outVoice, 6.0)).toBeCloseTo(0.3, 1);
  });

  it("soundLevel integrates volumeAutomation with fades and transitions", () => {
    const clipWithAuto = {
      volume: 1.0,
      fadeIn: 0,
      fadeOut: 0,
      volumeAutomation: [
        { t: 0, volume: 1.0 },
        { t: 2, volume: 1.0 },
        { t: 3, volume: 0.3 },
        { t: 5, volume: 0.3 },
        { t: 6, volume: 1.0 },
      ],
    };

    // At t=1s: 1.0
    expect(soundLevel(clipWithAuto, 1.0, 10)).toBeCloseTo(1.0, 2);
    // At t=2.5s: midpoint between 1.0 and 0.3 -> 0.65
    expect(soundLevel(clipWithAuto, 2.5, 10)).toBeCloseTo(0.65, 2);
    // At t=4.0s: 0.3
    expect(soundLevel(clipWithAuto, 4.0, 10)).toBeCloseTo(0.3, 2);
    // At t=7.0s: 1.0
    expect(soundLevel(clipWithAuto, 7.0, 10)).toBeCloseTo(1.0, 2);
  });

  it("generates valid FFmpeg volume filter expressions from automation keyframes", () => {
    const kfs = [
      { t: 0, volume: 1.0 },
      { t: 2.0, volume: 0.4 },
      { t: 5.0, volume: 1.0 },
    ];

    const filterExpr = generateVolumeFilterExpr(kfs, 1.0);
    expect(filterExpr).toContain("volume=");
    expect(filterExpr).toContain("between(t\\,");
    expect(filterExpr).toContain(":eval=frame");

    // Empty keyframes fallback
    expect(generateVolumeFilterExpr([], 0.8)).toBe("volume=0.80");
  });

  it("non-destructively resets Smart Mix without altering baseline volumes", () => {
    let doc = emptyDoc();
    const vidClip = makeVideoClip("v1", videoMediaId, 0, 10);
    vidClip.volume = 0.9;
    vidClip.volumeAutomation = [{ t: 0, volume: 0.9 }, { t: 5, volume: 0.3 }];
    mainTrack(doc).clips.push(vidClip);

    const voiceClip = makeAudioClip("a1", voiceMediaId, 0, 10, 0);
    voiceClip.volume = 1.2;
    voiceClip.volumeAutomation = [{ t: 0, volume: 1.2 }, { t: 5, volume: 0.3 }];
    const audioTrack = doc.tracks.find((t) => t.kind === "audio")!;
    audioTrack.clips.push(voiceClip);
    doc.smartMix = {
      ...DEFAULT_SMART_MIX_CONFIG,
      enabled: true,
      lastAnalyzedAt: Date.now(),
    };

    const resetDoc = resetSmartMix(doc);

    // Keyframes should be removed
    const vAfter = mainTrack(resetDoc).clips[0] as VideoClip;
    const aAfter = resetDoc.tracks.find((t) => t.kind === "audio")!.clips[0] as AudioPlaced;
    expect(vAfter.volumeAutomation).toBeUndefined();
    expect(aAfter.volumeAutomation).toBeUndefined();

    // Baseline volume preserved untouched
    expect(vAfter.volume).toBe(0.9);
    expect(aAfter.volume).toBe(1.2);

    // Smart mix disabled
    expect(resetDoc.smartMix?.enabled).toBe(false);
  });

  it("respects track filtering overrides", () => {
    let doc = emptyDoc();
    const vidClip1 = makeVideoClip("v1", videoMediaId, 0, 10);
    mainTrack(doc).clips.push(vidClip1);

    const voice1 = makeAudioClip("a1", voiceMediaId, 0, 10, 0);
    const voice2 = makeAudioClip("a2", "another-media-id", 0, 10, 0);
    doc.tracks.push(
      {
        id: "tr-voice-primary",
        kind: "audio",
        name: "Voiceover",
        locked: false,
        muted: false,
        clips: [voice1],
      },
      {
        id: "tr-music-bg",
        kind: "audio",
        name: "Background Music",
        locked: false,
        muted: false,
        clips: [voice2],
      },
    );

    // Only target tr-voice-primary as voiceover
    const mixed = applySmartMix(doc, {}, {
      ...DEFAULT_SMART_MIX_CONFIG,
      enabled: true,
      voiceoverTrackId: "tr-voice-primary",
    });

    const voicePrimaryClip = mixed.tracks.find((t) => t.id === "tr-voice-primary")!.clips[0] as AudioPlaced;
    const musicBgClip = mixed.tracks.find((t) => t.id === "tr-music-bg")!.clips[0] as AudioPlaced;

    expect(voicePrimaryClip.volumeAutomation).toBeDefined();
    // Non-targeted track must not receive volumeAutomation
    expect(musicBgClip.volumeAutomation).toBeUndefined();
  });
});
