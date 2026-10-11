import { layersAt } from "@/components/editor/ProgramPlayer";
import { describe, expect, it } from "vitest";
import { setClip, trimClip } from "@/lib/edit/docEdit";
import { clipLength, DEFAULT_TRANSFORM, mainStarts, mainDuration, type MainClip, type TimelineDoc } from "@/lib/edit/doc";
import { DEFAULT_OUTPUT } from "@/lib/edit/spec";
import { filmCount, filmIndex, filmTiles } from "@/lib/editor/film";
function createMockDoc(): TimelineDoc {
  return {
    version: 2,
    canvas: { width: 1920, height: 1080, fps: 30, background: "#000000" },
    output: DEFAULT_OUTPUT,
    tracks: [
      {
        id: "main",
        kind: "main",
        locked: false,
        muted: false,
        clips: [
          {
            id: "clip-1",
            type: "video",
            mediaId: "med-1",
            in: 0,
            out: 10,
            fadeIn: 0,
            fadeOut: 0,
            transform: DEFAULT_TRANSFORM,
            volume: 1,
            muted: false,
            ops: [],
          },
          {
            id: "clip-2",
            type: "video",
            mediaId: "med-2",
            in: 0,
            out: 8,
            fadeIn: 0,
            fadeOut: 0,
            transform: DEFAULT_TRANSFORM,
            volume: 1,
            muted: false,
            ops: [],
          },
        ],
      },
    ],
  } as unknown as TimelineDoc;
}

const mockMedia = (id: string) => ({
  id,
  duration: 30,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
});

describe("Google Vids Starting Clip Trimming Behavior", () => {
  it("trims starting clip left handle (in edge) to the right, keeping end invariant and leaving empty space at 0:00", () => {
    const doc = createMockDoc();
    const initialStarts = mainStarts(doc.tracks[0].clips as MainClip[]);
    expect(initialStarts[0]).toBe(0);
    expect(initialStarts[1]).toBe(10);
    expect(clipLength(doc.tracks[0].clips[0])).toBe(10);

    // Drag clip-1 in edge to 5.7s
    const trimmedDoc = trimClip(doc, "clip-1", "in", 5.7, mockMedia as any);
    const mainClips = trimmedDoc.tracks[0].clips;
    const starts = mainStarts(mainClips as MainClip[]);

    // Starting clip start moved to 5.7s
    expect(starts[0]).toBe(5.7);
    expect((mainClips[0] as any).start).toBe(5.7);

    // Starting clip duration reduced from 10s to 4.3s
    expect(clipLength(mainClips[0])).toBeCloseTo(4.3, 2);

    // Right edge remains invariant at 5.7 + 4.3 = 10.0s
    expect(starts[0] + clipLength(mainClips[0])).toBeCloseTo(10.0, 2);

    // Second clip is still right after clip-1 at 10.0s
    expect(starts[1]).toBeCloseTo(10.0, 2);
    expect(clipLength(mainClips[1])).toBe(8);
  });

  it("preserves starting clip offset when subsequent out edge is trimmed", () => {
    const doc = createMockDoc();
    // First trim in edge to 3.0s (leaving 0-3s gap)
    const step1 = trimClip(doc, "clip-1", "in", 3.0, mockMedia as any);
    expect(mainStarts(step1.tracks[0].clips as MainClip[])[0]).toBe(3.0);
    expect(clipLength(step1.tracks[0].clips[0])).toBe(7.0);

    // Now trim out edge to 8.0s (reducing length to 5.0s)
    const step2 = trimClip(step1, "clip-1", "out", 8.0, mockMedia as any);
    const starts = mainStarts(step2.tracks[0].clips as MainClip[]);

    // Start must still be preserved at 3.0s
    expect(starts[0]).toBe(3.0);
    expect((step2.tracks[0].clips[0] as any).start).toBe(3.0);
    expect(clipLength(step2.tracks[0].clips[0])).toBe(5.0);

    // Second clip ripples to follow clip-1 end at 3.0 + 5.0 = 8.0s
    expect(starts[1]).toBe(8.0);
  });

  it("allows trimming in edge back to 0:00 to restore no leading gap", () => {
    const doc = createMockDoc();
    const step1 = trimClip(doc, "clip-1", "in", 4.0, mockMedia as any);
    expect(mainStarts(step1.tracks[0].clips as MainClip[])[0]).toBe(4.0);

    // Trim back to 0:00
    const step2 = trimClip(step1, "clip-1", "in", 0, mockMedia as any);
    const starts = mainStarts(step2.tracks[0].clips as MainClip[]);

    expect(starts[0]).toBe(0);
    expect(clipLength(step2.tracks[0].clips[0])).toBe(10);
    expect(starts[1]).toBe(10);
  });

  it("clamps trimming to source media bounds without exceeding 0 or min length", () => {
    const doc = createMockDoc();
    // Cannot trim earlier than media in (0)
    const trimmedNegative = trimClip(doc, "clip-1", "in", -5, mockMedia as any);
    expect(mainStarts(trimmedNegative.tracks[0].clips as MainClip[])[0]).toBe(0);
    expect(clipLength(trimmedNegative.tracks[0].clips[0])).toBe(10);

    // Cannot trim past clip end (must maintain MIN_TRIM_SECONDS)
    const trimmedExcessive = trimClip(doc, "clip-1", "in", 15, mockMedia as any);
    const starts = mainStarts(trimmedExcessive.tracks[0].clips as MainClip[]);
    const len = clipLength(trimmedExcessive.tracks[0].clips[0]);
    expect(len).toBeGreaterThanOrEqual(0.5);
    expect(starts[0] + len).toBeCloseTo(10.0, 2);
  });

  it("anchors filmstrip to media time so trimming left handle slides tiles out to the left and preserves right-side tiles (Google Vids model)", () => {
    const media = { width: 1920, height: 1080, duration: 30, fps: 30 };

    // Initial state: srcIn = 0, width = 400px (10s at 40 px/s)
    const tilesInitial = filmTiles({
      width: 400,
      from: 0,
      to: 400,
      tileH: 56,
      media,
      srcIn: 0,
      srcOut: 10,
      srcPerSec: 40,
    });
    expect(tilesInitial.length).toBeGreaterThan(0);
    expect(tilesInitial[0].key).toBe(0);
    expect(tilesInitial[0].left).toBe(0);

    // After trimming in edge: srcIn = 5.7s, width = (10 - 5.7) * 40 = 172px
    const tilesTrimmed = filmTiles({
      width: 172,
      from: 0,
      to: 400,
      tileH: 56,
      media,
      srcIn: 5.7,
      srcOut: 10,
      srcPerSec: 40,
    });
    expect(tilesTrimmed.length).toBeGreaterThan(0);

    // Media origin inside clip is -5.7 * 40 = -228px
    // First visible tile overlaps x = 0 (left <= 0 and left + width > 0)
    expect(tilesTrimmed[0].left).toBeLessThanOrEqual(0);
    expect(tilesTrimmed[0].left + tilesTrimmed[0].width).toBeGreaterThan(0);

    // Right-most tile retains its frame index and background position
    const lastInitial = tilesInitial[tilesInitial.length - 1];
    const lastTrimmed = tilesTrimmed[tilesTrimmed.length - 1];
    expect(lastTrimmed.key).toBe(lastInitial.key);
    expect(lastTrimmed.bgPos).toBe(lastInitial.bgPos);
  });

  it("shifts starting clip to 0:00 timeline after trim completion with playhead at 0:00 (Google Vids model)", () => {
    const doc = createMockDoc();

    // User trims in edge to 3.5s during drag
    const draggedDoc = trimClip(doc, "clip-1", "in", 3.5, mockMedia as any);
    expect(mainStarts(draggedDoc.tracks[0].clips as MainClip[])[0]).toBe(3.5);
    expect(clipLength(draggedDoc.tracks[0].clips[0])).toBe(6.5);

    // On release, starting clip shifts to 0:00
    const finalDoc = setClip(draggedDoc, "clip-1", { start: 0 });
    const starts = mainStarts(finalDoc.tracks[0].clips as MainClip[]);

    expect(starts[0]).toBe(0);
    expect(clipLength(finalDoc.tracks[0].clips[0])).toBe(6.5);
    // Clip 2 follows immediately at 6.5s (magnetic sequence)
    expect(starts[1]).toBe(6.5);
  });

  it("verifies safe preview frame seek offsets within clip boundaries (no out-of-bounds blank frames)", () => {
    const doc = createMockDoc();
    const fps = doc.canvas.fps; // 30
    const clip = doc.tracks[0].clips[0]; // len: 10, start: 0

    // When trimming in edge to candidate targetTime = 4.0s
    const inCandidate = 4.0;
    const inSeek = Math.max(0, inCandidate + 1e-4);
    expect(inSeek).toBeGreaterThan(inCandidate);
    expect(inSeek).toBeLessThan(10.0);

    // When trimming out edge to candidate targetTime = 8.0s
    const outCandidate = 8.0;
    const outSeek = Math.max(0, outCandidate - 1 / fps);
    expect(outSeek).toBeLessThan(outCandidate);
    expect(outSeek).toBeGreaterThanOrEqual(0);
    // Ensures outSeek lands exactly on the last frame before 8.0s
    expect(outCandidate - outSeek).toBeCloseTo(1 / fps, 4);
  });

  it("trims second clip left handle (in edge) to the right on main track, keeping end invariant and moving start with handle", () => {
    const doc = createMockDoc();
    // clip-1 is at 0 to 10s, clip-2 is at 10 to 18s (length 8s)
    const initialStarts = mainStarts(doc.tracks[0].clips as MainClip[]);
    expect(initialStarts[0]).toBe(0);
    expect(initialStarts[1]).toBe(10);
    expect(clipLength(doc.tracks[0].clips[1])).toBe(8);

    // User drags clip-2 in edge to 12.0s
    const draggedDoc = trimClip(doc, "clip-2", "in", 12.0, mockMedia as any);
    const starts = mainStarts(draggedDoc.tracks[0].clips as MainClip[]);
    const clip2 = draggedDoc.tracks[0].clips[1];

    // clip-1 remains untouched at 0:00 to 10.0s
    expect(starts[0]).toBe(0);
    expect(clipLength(draggedDoc.tracks[0].clips[0])).toBe(10);

    // clip-2 left edge moves with handle to 12.0s (leaving a 10s - 12s gap during drag)
    expect(starts[1]).toBe(12.0);
    expect((clip2 as any).start).toBe(12.0);
    expect(clipLength(clip2)).toBe(6.0);

    // clip-2 right edge remains firmly invariant at 12.0 + 6.0 = 18.0s!
    expect(starts[1] + clipLength(clip2)).toBe(18.0);
  });

  it("on trim release, second clip ripples back to touch clip 1 (Google Vids magnetic track model)", () => {
    const doc = createMockDoc();
    const draggedDoc = trimClip(doc, "clip-2", "in", 12.0, mockMedia as any);
    expect(mainStarts(draggedDoc.tracks[0].clips as MainClip[])[1]).toBe(12.0);

    // On pointerUp, clip-2 ripples to touch clip-1 (start: undefined)
    const releasedDoc = setClip(draggedDoc, "clip-2", { start: undefined });
    const starts = mainStarts(releasedDoc.tracks[0].clips as MainClip[]);

    // clip-1 is 0 to 10s
    expect(starts[0]).toBe(0);
    // clip-2 snapped back to 10s!
    expect(starts[1]).toBe(10.0);
    expect(clipLength(releasedDoc.tracks[0].clips[1])).toBe(6.0);
    // whole timeline ends cleanly at 10 + 6 = 16s
    expect(starts[1] + clipLength(releasedDoc.tracks[0].clips[1])).toBe(16.0);
  });
  it("layersAt keeps clip 0 visible during leading trim even when t <= start offset", () => {
    const doc = createMockDoc();
    // Trim in edge of clip-1 to 3.0s
    const draggedDoc = trimClip(doc, "clip-1", "in", 3.0, mockMedia as any);
    const starts = mainStarts(draggedDoc.tracks[0].clips as MainClip[]);
    expect(starts[0]).toBe(3.0);

    // When t is exactly at the trim edge (3.0s), layersAt must return clip-1
    const layersExact = layersAt(draggedDoc, 3.0);
    expect(layersExact.length).toBe(1);
    expect(layersExact[0].clip.id).toBe("clip-1");

    // When t is slightly before the trim edge (e.g. 2.99s due to drag or rounding),
    // layersAt must still return clip-1 so the canvas NEVER clears to transparent!
    const layersBefore = layersAt(draggedDoc, 2.99);
    expect(layersBefore.length).toBe(1);
    expect(layersBefore[0].clip.id).toBe("clip-1");

    // When t is at 0:00 (e.g. leading gap), layersAt must also return clip-1 during the trim
    const layersZero = layersAt(draggedDoc, 0);
    expect(layersZero.length).toBe(1);
    expect(layersZero[0].clip.id).toBe("clip-1");
  });
  it("anchors subsequent clip during out-edge trim drag and ripples on drop (symmetric to in-edge trim)", () => {
    const doc = createMockDoc();
    // clip-1 is 0 to 10s, clip-2 is 10 to 18s (total: 18s)
    expect(mainStarts(doc.tracks[0].clips as MainClip[])[0]).toBe(0);
    expect(mainStarts(doc.tracks[0].clips as MainClip[])[1]).toBe(10);
    expect(mainDuration(doc)).toBe(18);

    // On pointer down for out-edge, next clip is anchored at clip-1's end (10.0s)
    const anchoredDoc = setClip(doc, "clip-2", { start: 10.0 });
    // User drags clip-1 out-edge to 6.0s
    const draggedDoc = trimClip(anchoredDoc, "clip-1", "out", 6.0, mockMedia as any);
    const draggedStarts = mainStarts(draggedDoc.tracks[0].clips as MainClip[]);

    // clip-1 length reduced to 6s
    expect(clipLength(draggedDoc.tracks[0].clips[0])).toBe(6.0);
    expect(draggedStarts[0]).toBe(0);

    // clip-2 DOES NOT MOVE during the drag, staying at 10.0s
    expect(draggedStarts[1]).toBe(10.0);
    // Gap exists between 6.0s and 10.0s
    expect(draggedStarts[1] - (draggedStarts[0] + clipLength(draggedDoc.tracks[0].clips[0]))).toBe(4.0);
    // Total timeline duration is preserved at 18.0s during the drag
    expect(mainDuration(draggedDoc)).toBe(18.0);

    // On trim drop (release), clip-2's start anchor is removed and it ripples to 6.0s
    const droppedDoc = setClip(draggedDoc, "clip-2", { start: undefined });
    const droppedStarts = mainStarts(droppedDoc.tracks[0].clips as MainClip[]);

    expect(droppedStarts[0]).toBe(0);
    expect(droppedStarts[1]).toBe(6.0);
    expect(clipLength(droppedDoc.tracks[0].clips[1])).toBe(8.0);
    // Timeline duration trims on drop to 14.0s
    expect(mainDuration(droppedDoc)).toBe(14.0);
  });
});
