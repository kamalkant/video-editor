import { describe, expect, it } from "vitest";
import { emptyDoc, videoClipOf } from "@/lib/edit/doc";
import { addMedia, detachAudio, attachAudio, toggleAudioDetach } from "@/lib/edit/docEdit";
import { getEditingTools } from "@/lib/editor/editingTools";

describe("detachAudio and attachAudio Toggle Mechanism", () => {
  const mockMedia = {
    id: "11111111-1111-4111-8111-111111111111",
    fileName: "interview.mp4",
    duration: 10,
    hasAudio: true,
    kind: "video" as const,
    width: 1920,
    height: 1080,
    fps: 30,
    suggestedKey: null,
    keyKind: null,
  };

  const getMedia = (id: string) => (id === mockMedia.id ? mockMedia : null);
  const mediaMap = { [mockMedia.id]: mockMedia };

  it("detaches audio from video clip onto an audio track with matching timing and volume", () => {
    let doc = emptyDoc();
    const { doc: docWithVideo, clipId } = addMedia(doc, mockMedia);
    expect(clipId).toBeTruthy();

    const { doc: nextDoc, audioClipId } = detachAudio(docWithVideo, clipId, getMedia);
    expect(audioClipId).toBeTruthy();

    // Verify audio track contains the new audio clip
    const audioTrack = nextDoc.tracks.find((t) => t.kind === "audio");
    expect(audioTrack).toBeDefined();
    expect(audioTrack?.clips.length).toBeGreaterThan(0);

    const detachedAudioClip = audioTrack?.clips.find((c) => c.id === audioClipId);
    expect(detachedAudioClip).toBeDefined();
    expect(detachedAudioClip?.type).toBe("audio");
    expect(detachedAudioClip?.mediaId).toBe(mockMedia.id);
    expect((detachedAudioClip as any)?.detachedFromClipId).toBe(clipId);

    // Verify original video clip is muted and volume is 0 and records detachedAudioId
    const mainTrack = nextDoc.tracks.find((t) => t.kind === "main")!;
    const videoClip = mainTrack.clips.find((c) => c.id === clipId) as any;
    expect(videoClip).toBeDefined();
    expect(videoClip.muted).toBe(true);
    expect(videoClip.volume).toBe(0);
    expect(videoClip.detachedAudioId).toBe(audioClipId);
  });

  it("re-attaches audio back into video clip and removes the detached audio clip", () => {
    const { doc: docWithVideo, clipId } = addMedia(emptyDoc(), mockMedia);
    const { doc: detachedDoc, audioClipId } = detachAudio(docWithVideo, clipId, getMedia);
    expect(audioClipId).toBeTruthy();

    // Re-attach audio via video clip ID
    const { doc: reattachedDoc, restoredClipId } = attachAudio(detachedDoc, clipId);
    expect(restoredClipId).toBe(clipId);

    // Audio clip should be removed from audio track
    const audioClips = reattachedDoc.tracks
      .filter((t) => t.kind === "audio")
      .flatMap((t) => t.clips);
    expect(audioClips.find((c) => c.id === audioClipId)).toBeUndefined();

    // Video clip should be unmuted and volume restored
    const video = reattachedDoc.tracks
      .find((t) => t.kind === "main")!
      .clips.find((c) => c.id === clipId) as any;
    expect(video).toBeDefined();
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    expect(video.detachedAudioId).toBeUndefined();
  });

  it("re-attaches audio when invoked directly on the detached audio clip", () => {
    const { doc: docWithVideo, clipId } = addMedia(emptyDoc(), mockMedia);
    const { doc: detachedDoc, audioClipId } = detachAudio(docWithVideo, clipId, getMedia);
    expect(audioClipId).toBeTruthy();

    // Re-attach audio via AUDIO clip ID
    const { doc: reattachedDoc, restoredClipId } = attachAudio(detachedDoc, audioClipId!);
    expect(restoredClipId).toBe(clipId);

    // Video clip restored to unmuted
    const video = reattachedDoc.tracks
      .find((t) => t.kind === "main")!
      .clips.find((c) => c.id === clipId) as any;
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
  });

  it("toggleAudioDetach toggles bidirectionally with single function calls", () => {
    const { doc: initialDoc, clipId } = addMedia(emptyDoc(), mockMedia);

    // 1st click: Detach
    const step1 = toggleAudioDetach(initialDoc, clipId, getMedia);
    expect(step1.action).toBe("detached");
    expect(step1.resultingClipId).toBeTruthy();

    // 2nd click: Attach (toggle back)
    const step2 = toggleAudioDetach(step1.doc, clipId, getMedia);
    expect(step2.action).toBe("attached");
    expect(step2.resultingClipId).toBe(clipId);

    // Video should be unmuted again
    const video = step2.doc.tracks
      .find((t) => t.kind === "main")!
      .clips.find((c) => c.id === clipId) as any;
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);

    // 3rd click: Detach again
    const step3 = toggleAudioDetach(step2.doc, clipId, getMedia);
    expect(step3.action).toBe("detached");
  });

  it("updates editingTools flags correctly: canDetachAudio vs canAttachAudio / isAudioDetached", () => {
    const { doc: docWithVideo, clipId } = addMedia(emptyDoc(), mockMedia);

    // Before detaching: video selected
    const toolsBefore = getEditingTools(docWithVideo, clipId, 0, mediaMap, 30);
    expect(toolsBefore.canDetachAudio).toBe(true);
    expect(toolsBefore.canAttachAudio).toBe(false);
    expect(toolsBefore.isAudioDetached).toBe(false);

    // After detaching: video still selected
    const { doc: detachedDoc, audioClipId } = detachAudio(docWithVideo, clipId, getMedia);
    const toolsAfterVideo = getEditingTools(detachedDoc, clipId, 0, mediaMap, 30);
    expect(toolsAfterVideo.canDetachAudio).toBe(false);
    expect(toolsAfterVideo.canAttachAudio).toBe(true);
    expect(toolsAfterVideo.isAudioDetached).toBe(true);

    // After detaching: audio clip selected
    const toolsAfterAudio = getEditingTools(detachedDoc, audioClipId!, 0, mediaMap, 30);
    expect(toolsAfterAudio.canDetachAudio).toBe(false);
    expect(toolsAfterAudio.canAttachAudio).toBe(true);
    expect(toolsAfterAudio.isAudioDetached).toBe(true);
  });

  it("returns null if clip has no audio", () => {
    const silentMedia = { ...mockMedia, id: "22222222-2222-4222-8222-222222222222", hasAudio: false };
    const docWithVideo = addMedia(emptyDoc(), silentMedia).doc;
    const clipId = docWithVideo.tracks.find((t) => t.kind === "main")!.clips[0].id;

    const res = detachAudio(docWithVideo, clipId, (id) => (id === silentMedia.id ? silentMedia : null));
    expect(res.audioClipId).toBeNull();
  });
});
