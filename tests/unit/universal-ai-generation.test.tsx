// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { UniversalAiTooltip } from "@/components/studio/UniversalAiTooltip";
import { Timeline } from "@/components/studio/Timeline";
import { useAiGenerationManager } from "@/lib/ai/useAiGenerationManager";
import { emptyDoc, mainTrack } from "@/lib/edit/doc";
import type { MediaLite, TimelineDoc } from "@/lib/edit/doc";
import { addGeneratingClip, interruptOrphanedGenerations } from "@/lib/edit/docEdit";
import type { UniversalAiGenerationRequest } from "@/lib/ai/universal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UniversalAiTooltip Component", () => {
  it("renders with Generate with Gemini header, target pill, prompt input, and character count", () => {
    const handleGenerate = vi.fn();
    const handleClose = vi.fn();

    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={handleClose}
        target={{
          at: 4.5,
          trackId: "main",
          targetDescription: "Timeline at 00:04",
        }}
        onGenerate={handleGenerate}
      />
    );

    expect(screen.getByText("Generate with Gemini")).toBeDefined();
    expect(screen.getByText("Video")).toBeDefined();
    expect(screen.getByText("16:9")).toBeDefined();
    expect(screen.getByText("1080p")).toBeDefined();
    expect(screen.getByText("6s")).toBeDefined();
    expect(screen.getByLabelText("Sound on")).toBeDefined();
    expect(screen.getByLabelText("Sound off")).toBeDefined();
    expect(screen.getByText(/Timeline at 00:04/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/modern newsroom/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Generate/i })).toBeDefined();
  });

  it("allows switching media types via mode dropdown and updates options accordingly", () => {
    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    // Open mode menu
    const modeButton = screen.getByRole("button", { name: /Video/i });
    fireEvent.click(modeButton);

    // Mode dropdown options are visible
    expect(screen.getByText("AI Video")).toBeDefined();
    expect(screen.getByText("AI Image")).toBeDefined();
    expect(screen.getByText("Voice / Speech")).toBeDefined();

    // Switch to image
    fireEvent.click(screen.getByText("AI Image"));
    expect(screen.getByText("Image")).toBeDefined();
    expect(screen.getByText("Cinematic")).toBeDefined();

    // Switch to audio
    const imageModeBtn = screen.getByRole("button", { name: /Image/i });
    fireEvent.click(imageModeBtn);
    fireEvent.click(screen.getByText("Voice / Speech"));
    expect(screen.getByText("Audio")).toBeDefined();
    expect(screen.getByText(/Voice: Puck/i)).toBeDefined();
  });

  it("submits generation request with valid parameters", () => {
    const handleGenerate = vi.fn();
    const handleClose = vi.fn();

    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={handleClose}
        target={{ at: 2.0, trackId: "main" }}
        onGenerate={handleGenerate}
      />
    );

    const textarea = screen.getByPlaceholderText(/modern newsroom/i);
    fireEvent.change(textarea, { target: { value: "Futuristic city skyline at night" } });

    const submitBtn = screen.getByRole("button", { name: /Generate/i });
    fireEvent.click(submitBtn);

    expect(handleGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "video",
        prompt: "Futuristic city skyline at night",
        options: expect.objectContaining({ duration: 6, aspect: "16:9", resolution: "1080p", hasAudio: true }),
        target: expect.objectContaining({ at: 2.0, trackId: "main" }),
      })
    );
    expect(handleClose).toHaveBeenCalled();
  });

  it("closes when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={handleClose}
        onGenerate={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalled();
  });

  it("supports 10s duration option and submits with duration: 10", () => {
    const handleGenerate = vi.fn();
    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={handleGenerate}
      />
    );

    // Open duration menu
    const durationBtn = screen.getByRole("button", { name: /6s/i });
    fireEvent.click(durationBtn);

    // 10s option is displayed
    const tenSecBtn = screen.getByRole("button", { name: /10s/i });
    expect(tenSecBtn).toBeDefined();

    // Select 10s
    fireEvent.click(tenSecBtn);
    expect(screen.getByText("10s")).toBeDefined();

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Generate/i });
    fireEvent.click(submitBtn);

    expect(handleGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ duration: 10 }),
      })
    );
  });

  it("displays expanded attachment options (computer, project assets, pexels) on clicking attach box", () => {
    const handleOpenPexels = vi.fn();
    const projectAssets = [
      { id: "asset-1", fileName: "intro-clip.mp4", kind: "video" },
      { id: "asset-2", fileName: "backdrop.jpg", kind: "image" },
    ];

    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
        projectAssets={projectAssets}
        onOpenPexels={handleOpenPexels}
      />
    );

    // Click attachment container
    const attachBox = screen.getByTitle(/Attach reference image/i);
    fireEvent.click(attachBox);

    // Menu options are shown
    expect(screen.getByText("Upload from computer")).toBeDefined();
    expect(screen.getByText("Choose from Project Assets")).toBeDefined();
    expect(screen.getByText("Stock Images (Pixabay)")).toBeDefined();

    // Click Pixabay
    fireEvent.click(screen.getByText("Stock Images (Pixabay)"));
    expect(handleOpenPexels).toHaveBeenCalled();
  });

  it("provides theme toggle button in header", () => {
    render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    const themeToggleBtn = screen.getByLabelText(/Switch to/i);
    expect(themeToggleBtn).toBeDefined();
  });

  it("renders bottom options in a single row with flex-nowrap", () => {
    const { container } = render(
      <UniversalAiTooltip
        isOpen={true}
        onClose={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    const bottomRow = container.querySelector(".flex-nowrap");
    expect(bottomRow).not.toBeNull();
    expect(screen.getByText("Video")).toBeDefined();
    expect(screen.getByText("16:9")).toBeDefined();
    expect(screen.getByText("1080p")).toBeDefined();
    expect(screen.getByText("6s")).toBeDefined();
    expect(screen.getByRole("button", { name: /Generate/i })).toBeDefined();
  });
});

describe("Timeline Generating Clip Component", () => {
  it("renders generating overlay with dedicated close button and calls onCancelGeneration", () => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;

    const handleCancel = vi.fn();
    const docWithGenClip: TimelineDoc = {
      ...emptyDoc(),
      tracks: [
        {
          id: "main",
          kind: "main",
          locked: false,
          muted: false,
          clips: [
            {
              id: "gen-clip-1",
              type: "video",
              mediaId: "m1",
              in: 0,
              out: 6,
              ops: [],
              generation: {
                mediaType: "video",
                prompt: "Futuristic city skyline",
                progress: 45,
                status: "generating",
              },
            } as any,
          ],
        },
      ],
    };

    const clockMock = {
      get: () => 0,
      set: vi.fn(),
      playing: () => false,
      play: vi.fn(),
      pause: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };

    render(
      <Timeline
        doc={docWithGenClip}
        media={{}}
        clock={clockMock as any}
        selectedId={null}
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        onSplit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onPaste={null}
        onTrim={vi.fn()}
        onMove={vi.fn()}
        onDropMedia={vi.fn()}
        onDropFile={vi.fn()}
        onSetTrack={vi.fn()}
        onAddTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
        onSilences={vi.fn()}
        onCancelGeneration={handleCancel}
        onChoose={vi.fn()}
      />
    );

    // Overlay is present with single clean border
    const overlay = screen.getByTestId("generating-overlay");
    expect(overlay).toBeDefined();
    expect(overlay.className).toContain("border-primary");

    // Dedicated remove clip button is present and clickable
    const removeBtn = screen.getByRole("button", { name: /Remove clip/i });
    expect(removeBtn).toBeDefined();

    fireEvent.click(removeBtn);
    expect(handleCancel).toHaveBeenCalledWith("gen-clip-1");
  });
});


describe("useAiGenerationManager Hook", () => {
  // Test harness component to exercise the hook
  function TestHookComponent({
    initialDoc,
    onReady,
  }: {
    initialDoc: TimelineDoc;
    onReady: (manager: ReturnType<typeof useAiGenerationManager>, getDoc: () => TimelineDoc) => void;
  }) {
    const [doc, setDoc] = React.useState(initialDoc);
    const docRef = React.useRef(doc);
    docRef.current = doc;

    const manager = useAiGenerationManager({
      doc,
      setDoc,
      onMediaResolved: vi.fn(),
      onAssetCreated: vi.fn(),
    });

    React.useEffect(() => {
      onReady(manager, () => docRef.current);
    }, [manager, onReady]);

    return null;
  }

  it("inserts a placeholder clip immediately on main track for video generation", async () => {
    const doc = emptyDoc();
    let mgr: ReturnType<typeof useAiGenerationManager> | null = null;
    let getDoc: (() => TimelineDoc) | null = null;

    render(
      <TestHookComponent
        initialDoc={doc}
        onReady={(m, gd) => {
          mgr = m;
          getDoc = gd;
        }}
      />
    );

    // Mock fetch for /api/ai/generate-video
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/ai/generate-video")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              predictionId: "pred-123",
              status: "succeeded",
              videoUrl: "https://example.com/video.mp4",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(["video-bytes"], { type: "video/mp4" })),
      });
    });
    global.fetch = fetchMock;

    await act(async () => {
      await mgr!.startGeneration({
        mediaType: "video",
        prompt: "Epic ocean waves",
        options: { duration: 4 },
        target: { trackId: "main" },
      });
    });

    const updatedDoc = getDoc!();
    const main = mainTrack(updatedDoc);
    expect(main.clips.length).toBe(1);
    expect(main.clips[0].generation).toBeDefined();
    expect(main.clips[0].generation?.prompt).toBe("Epic ocean waves");
  });

  it("handles voice generation and targets or creates audio track", async () => {
    const doc = emptyDoc();
    let mgr: ReturnType<typeof useAiGenerationManager> | null = null;
    let getDoc: (() => TimelineDoc) | null = null;

    render(
      <TestHookComponent
        initialDoc={doc}
        onReady={(m, gd) => {
          mgr = m;
          getDoc = gd;
        }}
      />
    );

    // Mock fetch for /api/ai/tts
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/ai/tts")) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(["audio-bytes"], { type: "audio/mpeg" })),
          headers: new Headers({ "x-audio-duration": "3.5" }),
        });
      }
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(["audio-bytes"], { type: "audio/mpeg" })),
      });
    });
    global.fetch = fetchMock;

    await act(async () => {
      await mgr!.startGeneration({
        mediaType: "audio",
        prompt: "Welcome to our video presentation",
        options: { voice: "alloy" },
        target: { at: 1.0 },
      });
    });

    const updatedDoc = getDoc!();
    const audioTrack = updatedDoc.tracks.find((t) => t.kind === "audio");
    expect(audioTrack).toBeDefined();
    expect(audioTrack!.clips.length).toBe(1);
    expect(audioTrack!.clips[0].type).toBe("audio");
    expect(audioTrack!.clips[0].generation?.prompt).toBe("Welcome to our video presentation");
  });
});

describe("useAiGenerationManager with Studio-style wiring (stuck at 85% regression)", () => {
  /**
   * Mirrors Studio: setDoc evaluates against a ref that only updates on render, and
   * onMediaResolved replaces the whole doc from that same ref (registering the media).
   */
  function StudioLikeHarness({
    onReady,
  }: {
    onReady: (m: ReturnType<typeof useAiGenerationManager>, get: () => { doc: TimelineDoc; media: Record<string, MediaLite> }) => void;
  }) {
    const [state, setState] = React.useState<{ doc: TimelineDoc; media: Record<string, MediaLite> }>({ doc: emptyDoc(), media: {} });
    const docRef = React.useRef(state.doc);
    docRef.current = state.doc;
    const stateRef = React.useRef(state);
    stateRef.current = state;

    const setDoc = React.useCallback((fn: (prev: TimelineDoc) => TimelineDoc) => {
      const next = fn(docRef.current);
      if (next !== docRef.current) setState((s) => ({ doc: next, media: s.media }));
    }, []);

    const manager = useAiGenerationManager({
      doc: state.doc,
      setDoc,
      onMediaResolved: (m) => setState((s) => ({ doc: docRef.current, media: { ...s.media, [m.id]: m } })),
      onAssetCreated: vi.fn(),
    });

    React.useEffect(() => {
      onReady(manager, () => stateRef.current);
    }, [manager, onReady]);
    return null;
  }

  const imageMeta = {
    id: "img-123",
    kind: "image" as const,
    fileName: "Gemini - create a newsroom.png",
    info: { width: 1280, height: 720, fps: 30, duration: 3, hasAudio: false },
    suggestedKey: null,
    keyKind: null,
  };

  for (const trackId of ["v1", "v2"]) {
    it(`replaces the placeholder with the generated image on ${trackId === "v1" ? "the main" : "an overlay"} track`, async () => {
      let mgr: ReturnType<typeof useAiGenerationManager> | null = null;
      let get: (() => { doc: TimelineDoc; media: Record<string, MediaLite> }) | null = null;
      render(<StudioLikeHarness onReady={(m, g) => { mgr = m; get = g; }} />);

      let respond: (v: unknown) => void = () => {};
      global.fetch = vi.fn(() => new Promise((r) => { respond = r; })) as any;

      let pending: Promise<string | null> = Promise.resolve(null);
      act(() => {
        pending = mgr!.startGeneration({ mediaType: "image", prompt: "A modern newsroom", target: { trackId, at: 0 } });
      });
      // placeholder rendered while the request is in flight
      const placeholder = get!().doc.tracks.find((t) => t.id === trackId)!.clips[0] as any;
      expect(placeholder.generation?.status).toBe("generating");

      await act(async () => {
        respond({ ok: true, json: () => Promise.resolve(imageMeta) });
        await pending;
      });

      const { doc, media } = get!();
      const clip = doc.tracks.find((t) => t.id === trackId)!.clips[0] as any;
      expect(clip.id).toBe(placeholder.id);
      expect(clip.type).toBe("image");
      expect(clip.mediaId).toBe("img-123");
      expect(clip.generation).toBeUndefined();
      expect(media["img-123"]).toBeDefined();
    });
  }
});

describe("interruptOrphanedGenerations", () => {
  it("marks generating/queued placeholders as failed: Interrupted", () => {
    const doc = emptyDoc();
    const withGen = addGeneratingClip(doc, { mediaType: "image", prompt: "x", trackId: "v2", at: 0 });
    const out = interruptOrphanedGenerations(withGen.doc);
    const clip = out.tracks.find((t) => t.id === "v2")!.clips[0] as any;
    expect(clip.generation.status).toBe("failed");
    expect(clip.generation.error).toBe("Interrupted");
  });

  it("returns the same doc reference when nothing is generating", () => {
    const doc = emptyDoc();
    expect(interruptOrphanedGenerations(doc)).toBe(doc);
  });
});

describe("Timeline failed generation clip", () => {
  it("shows Retry for a failed clip and calls onRetryGeneration", () => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    const handleRetry = vi.fn();
    const doc: TimelineDoc = {
      ...emptyDoc(),
      tracks: [
        {
          id: "main",
          kind: "main",
          clips: [
            {
              id: "gen-clip-2",
              type: "video",
              mediaId: "m1",
              in: 0,
              out: 6,
              ops: [],
              generation: { mediaType: "image", prompt: "x", progress: 85, status: "failed", error: "Interrupted" },
            } as any,
          ],
        } as any,
      ],
    };
    const clockMock = { get: () => 0, set: vi.fn(), playing: () => false, play: vi.fn(), pause: vi.fn(), subscribe: vi.fn(() => () => {}) };
    render(
      <Timeline
        doc={doc}
        media={{}}
        clock={clockMock as any}
        selectedId={null}
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        onSplit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onCopy={vi.fn()}
        onCut={vi.fn()}
        onPaste={null}
        onTrim={vi.fn()}
        onMove={vi.fn()}
        onDropMedia={vi.fn()}
        onDropFile={vi.fn()}
        onSetTrack={vi.fn()}
        onAddTrack={vi.fn()}
        onRemoveTrack={vi.fn()}
        onSilences={vi.fn()}
        onCancelGeneration={vi.fn()}
        onRetryGeneration={handleRetry}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText("Failed: Interrupted")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry generation" }));
    expect(handleRetry).toHaveBeenCalledWith("gen-clip-2");
  });
});

