// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MediaPanel } from "@/components/studio/MediaPanel";
import { Timeline } from "@/components/studio/Timeline";
import { emptyDoc, mediaLiteOf, type TimelineDoc } from "@/lib/edit/doc";
import { MEDIA_DRAG, mediaDrag, setMediaDrag } from "@/lib/editor/mediaDrag";
import type { Asset } from "@/lib/media/useLibrary";

vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user_logged_in_123", email: "user@example.com" },
    workspace: null,
    accountCode: "acct_123",
    hasFeature: () => true,
  }),
}));

const mockAsset: Asset = {
  id: "asset-local-1",
  fileName: "interview.mp4",
  createdAt: Date.now(),
  info: {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 12.5,
    hasAudio: true,
    soundDetected: true,
  },
  kind: "video",
  suggestedKey: null,
  keyKind: null,
  usedIn: [],
};

const dummyClock = {
  get: () => 0,
  set: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  subscribe: vi.fn(() => () => {}),
};

describe("Asset Drag and Drop to Timeline After Login", () => {
  beforeEach(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    setMediaDrag(null);
  });

  afterEach(() => {
    cleanup();
    setMediaDrag(null);
    vi.restoreAllMocks();
  });

  describe("MediaPanel onDragStart", () => {
    it("sets MEDIA_DRAG, text/plain, and registers mediaDrag store", () => {
      const dataTransferState: Record<string, string> = {};
      const dataTransferMock = {
        setData: vi.fn((key: string, val: string) => {
          dataTransferState[key] = val;
        }),
        effectAllowed: "none",
        setDragImage: vi.fn(),
      };

      render(
        <MediaPanel
          assets={[mockAsset]}
          listError={null}
          inTimeline={new Set()}
          upload={{ kind: "idle" }}
          onChoose={vi.fn()}
          onRecord={vi.fn()}
          onCancelUpload={vi.fn()}
          onAdd={vi.fn()}
          onDelete={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const card = screen.getByLabelText(mockAsset.fileName);
      fireEvent.dragStart(card, {
        dataTransfer: dataTransferMock,
      });

      expect(dataTransferMock.setData).toHaveBeenCalledWith(MEDIA_DRAG, mockAsset.id);
      expect(dataTransferMock.setData).toHaveBeenCalledWith("text/plain", mockAsset.id);
      expect(mediaDrag()).toEqual(mediaLiteOf(mockAsset));
    });
  });

  describe("Timeline Drag and Drop Resolution", () => {
    const renderTimeline = (onDropMedia = vi.fn()) => {
      const doc: TimelineDoc = emptyDoc();
      return render(
        <Timeline
          doc={doc}
          media={{}}
          clock={dummyClock as any}
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
          onDropMedia={onDropMedia}
          onDropFile={vi.fn()}
          onSetTrack={vi.fn()}
          onAddTrack={vi.fn()}
          onRemoveTrack={vi.fn()}
          onSilences={vi.fn()}
          onChoose={vi.fn()}
        />
      );
    };

    it("triggers onDropMedia when MEDIA_DRAG data is provided", () => {
      const onDropMedia = vi.fn();
      renderTimeline(onDropMedia);

      const timelineLanes = screen.getByTestId("lane-main");
      setMediaDrag(mediaLiteOf(mockAsset));

      fireEvent.drop(timelineLanes, {
        dataTransfer: {
          types: [MEDIA_DRAG],
          getData: (format: string) => (format === MEDIA_DRAG ? mockAsset.id : ""),
          files: [],
        },
        clientX: 100,
      });

      expect(onDropMedia).toHaveBeenCalledWith(
        mockAsset.id,
        expect.any(String),
        expect.any(Number),
        0
      );
    });

    it("falls back to mediaDrag()?.id when dataTransfer getData(MEDIA_DRAG) is empty", () => {
      const onDropMedia = vi.fn();
      renderTimeline(onDropMedia);

      const timelineLanes = screen.getByTestId("lane-main");
      setMediaDrag(mediaLiteOf(mockAsset));

      // Browser event where custom MIME getData returns empty string
      fireEvent.drop(timelineLanes, {
        dataTransfer: {
          types: [MEDIA_DRAG],
          getData: () => "",
          files: [],
        },
        clientX: 100,
      });

      expect(onDropMedia).toHaveBeenCalledWith(
        mockAsset.id,
        expect.any(String),
        expect.any(Number),
        0
      );
    });

    it("falls back to text/plain when MEDIA_DRAG is not present in dataTransfer", () => {
      const onDropMedia = vi.fn();
      renderTimeline(onDropMedia);

      const timelineLanes = screen.getByTestId("lane-main");

      fireEvent.drop(timelineLanes, {
        dataTransfer: {
          types: ["text/plain"],
          getData: (format: string) => (format === "text/plain" ? mockAsset.id : ""),
          files: [],
        },
        clientX: 100,
      });

      expect(onDropMedia).toHaveBeenCalledWith(
        mockAsset.id,
        expect.any(String),
        expect.any(Number),
        0
      );
    });
  });

  describe("Multi-source asset resolution logic", () => {
    it("resolves an asset from shownAssets when server assets.items is filtered after login", () => {
      const metas: Record<string, any> = {};
      const shownAssets = [mockAsset];
      const serverAssets: any[] = []; // empty after login because account has no server videos yet

      const activeDrag = null;
      const id = mockAsset.id;

      const resolved =
        metas[id] ??
        shownAssets?.find((a) => a.id === id) ??
        serverAssets.find((a) => a.id === id) ??
        activeDrag;

      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe(mockAsset.id);
      expect(resolved?.fileName).toBe("interview.mp4");
    });

    it("reconstructs VideoMeta fallback from mediaDrag() when asset is not in metas or shownAssets", () => {
      const metas: Record<string, any> = {};
      const shownAssets: any[] = [];
      const serverAssets: any[] = [];

      const lite = mediaLiteOf(mockAsset);
      setMediaDrag(lite);

      const id = mockAsset.id;
      const activeDrag = mediaDrag();
      const fallbackFromDrag =
        activeDrag && activeDrag.id === id
          ? {
              id: activeDrag.id,
              kind: activeDrag.kind,
              fileName: activeDrag.fileName,
              createdAt: Date.now(),
              info: {
                width: activeDrag.width,
                height: activeDrag.height,
                fps: activeDrag.fps,
                duration: activeDrag.duration,
                hasAudio: activeDrag.hasAudio,
                soundDetected: activeDrag.soundDetected,
              },
              suggestedKey: activeDrag.suggestedKey ?? null,
              keyKind: activeDrag.keyKind ?? null,
              keyVia: activeDrag.keyVia,
            }
          : undefined;

      const resolved =
        metas[id] ??
        shownAssets.find((a) => a.id === id) ??
        serverAssets.find((a) => a.id === id) ??
        fallbackFromDrag;

      expect(resolved).toBeDefined();
      expect(resolved?.id).toBe(mockAsset.id);
      expect(resolved?.info.duration).toBe(12.5);
    });
  });
});
