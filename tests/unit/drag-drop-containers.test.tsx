// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { Rail } from "@/components/studio/Rail";
import { MediaPanel } from "@/components/studio/MediaPanel";
import { ProjectsPanel } from "@/components/studio/ProjectsPanel";
import { MEME_DRAG } from "@/lib/editor/mediaDrag";

vi.mock("@/lib/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    workspace: {
      id: "test-ws",
      saveProject: vi.fn(),
      getProject: vi.fn(),
      deleteProject: vi.fn(),
      clearRecovery: vi.fn(),
    },
    hasFeature: () => true,
  }),
}));

describe("Drag & Drop Containers (Media, Projects, Rail)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Rail spring-loaded tab hover and drop", () => {
    it("switches to panel on drag-hover after 300ms delay", () => {
      const onSelect = vi.fn();
      render(<Rail active="edit" onSelect={onSelect} wide={true} />);

      const mediaTab = screen.getByRole("button", { name: /^Media/i });

      // Drag enter with Files type
      fireEvent.dragEnter(mediaTab, {
        dataTransfer: { types: ["Files"] },
      });

      // Before 300ms, not selected yet
      expect(onSelect).not.toHaveBeenCalled();

      // Advance by 300ms
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onSelect).toHaveBeenCalledWith("media");
    });

    it("cancels spring tab switch if drag leaves before 300ms", () => {
      const onSelect = vi.fn();
      render(<Rail active="media" onSelect={onSelect} wide={true} />);

      const projectsTab = screen.getByRole("button", { name: /^Text/i });

      fireEvent.dragEnter(projectsTab, {
        dataTransfer: { types: ["Files"] },
      });

      act(() => {
        vi.advanceTimersByTime(150);
      });

      fireEvent.dragLeave(projectsTab, {
        relatedTarget: document.body,
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("triggers onDropOnTab when item is dropped directly on rail button", () => {
      const onSelect = vi.fn();
      const onDropOnTab = vi.fn();
      render(
        <Rail
          active="edit"
          onSelect={onSelect}
          wide={true}
          onDropOnTab={onDropOnTab}
        />
      );

      const mediaTab = screen.getByRole("button", { name: /^Media/i });

      fireEvent.drop(mediaTab, {
        dataTransfer: { types: ["Files"], files: [new File([""], "clip.mp4")] },
      });

      expect(onSelect).toHaveBeenCalledWith("media");
      expect(onDropOnTab).toHaveBeenCalledWith(
        "media",
        expect.objectContaining({ type: "drop" }),
      );
    });
  });

  describe("MediaPanel drop zone and multi-file / meme support", () => {
    const dummyUpload = { kind: "idle" as const };

    it("shows visual drop overlay when dragging files over Media container", () => {
      render(
        <MediaPanel
          assets={[]}
          listError={null}
          inTimeline={new Set()}
          upload={dummyUpload}
          onChoose={vi.fn()}
          onRecord={vi.fn()}
          onCancelUpload={vi.fn()}
          onAdd={vi.fn()}
          onDelete={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const panel = screen.getByTestId("media-panel");
      expect(screen.queryByTestId("media-drop-overlay")).toBeNull();

      fireEvent.dragEnter(panel, {
        dataTransfer: { types: ["Files"] },
      });

      expect(screen.getByTestId("media-drop-overlay")).toBeTruthy();

      fireEvent.dragLeave(panel, {});
      expect(screen.queryByTestId("media-drop-overlay")).toBeNull();
    });

    it("accepts multiple dropped files and calls onDropFiles", () => {
      const onDropFiles = vi.fn();
      const onDropFile = vi.fn();
      render(
        <MediaPanel
          assets={[]}
          listError={null}
          inTimeline={new Set()}
          upload={dummyUpload}
          onChoose={vi.fn()}
          onRecord={vi.fn()}
          onCancelUpload={vi.fn()}
          onDropFiles={onDropFiles}
          onDropFile={onDropFile}
          onAdd={vi.fn()}
          onDelete={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const panel = screen.getByTestId("media-panel");
      const file1 = new File(["1"], "video1.mp4", { type: "video/mp4" });
      const file2 = new File(["2"], "audio1.mp3", { type: "audio/mp3" });

      fireEvent.drop(panel, {
        dataTransfer: {
          files: [file1, file2],
          getData: () => "",
        },
      });

      expect(onDropFiles).toHaveBeenCalledWith([file1, file2]);
      expect(onDropFile).not.toHaveBeenCalled();
    });

    it("accepts dropped stock / meme clip and calls onDropMeme", () => {
      const onDropMeme = vi.fn();
      render(
        <MediaPanel
          assets={[]}
          listError={null}
          inTimeline={new Set()}
          upload={dummyUpload}
          onChoose={vi.fn()}
          onRecord={vi.fn()}
          onCancelUpload={vi.fn()}
          onDropMeme={onDropMeme}
          onAdd={vi.fn()}
          onDelete={vi.fn()}
          onImport={vi.fn()}
        />
      );

      const panel = screen.getByTestId("media-panel");
      const mockMeme = { id: "meme-1", title: "Funny Cat", duration: 5 };

      fireEvent.drop(panel, {
        dataTransfer: {
          files: [],
          getData: (type: string) =>
            type === MEME_DRAG ? JSON.stringify(mockMeme) : "",
        },
      });

      expect(onDropMeme).toHaveBeenCalledWith(mockMeme);
    });
  });

  describe("ProjectsPanel drop zone and .vdo / clip support", () => {
    it("shows visual drop overlay when dragging files over Projects container", () => {
      render(
        <ProjectsPanel
          projects={[]}
          listError={null}
          currentId={null}
          onOpen={vi.fn()}
          onNew={vi.fn()}
          onRenamed={vi.fn()}
          onDeleted={vi.fn()}
        />
      );

      const panel = screen.getByTestId("projects-panel");
      expect(screen.queryByTestId("projects-drop-overlay")).toBeNull();

      fireEvent.dragEnter(panel, {
        dataTransfer: { types: ["Files"] },
      });

      expect(screen.getByTestId("projects-drop-overlay")).toBeTruthy();

      fireEvent.dragLeave(panel, {});
      expect(screen.queryByTestId("projects-drop-overlay")).toBeNull();
    });

    it("calls onImportVDOFile when a .vdo package is dropped", async () => {
      const onImportVDOFile = vi.fn().mockResolvedValue(undefined);
      const onDropFiles = vi.fn();

      render(
        <ProjectsPanel
          projects={[]}
          listError={null}
          currentId={null}
          onOpen={vi.fn()}
          onNew={vi.fn()}
          onRenamed={vi.fn()}
          onDeleted={vi.fn()}
          onImportVDOFile={onImportVDOFile}
          onDropFiles={onDropFiles}
        />
      );

      const panel = screen.getByTestId("projects-panel");
      const vdoFile = new File(["test"], "my-project.vdo", {
        type: "application/x-vdo",
      });

      await act(async () => {
        fireEvent.drop(panel, {
          dataTransfer: {
            files: [vdoFile],
            getData: () => "",
          },
        });
      });

      expect(onImportVDOFile).toHaveBeenCalledWith(vdoFile);
      expect(onDropFiles).not.toHaveBeenCalled();
    });

    it("calls onDropFiles when video files are dropped onto ProjectsPanel to create new project", async () => {
      const onDropFiles = vi.fn();
      const onImportVDOFile = vi.fn();

      render(
        <ProjectsPanel
          projects={[]}
          listError={null}
          currentId={null}
          onOpen={vi.fn()}
          onNew={vi.fn()}
          onRenamed={vi.fn()}
          onDeleted={vi.fn()}
          onImportVDOFile={onImportVDOFile}
          onDropFiles={onDropFiles}
        />
      );

      const panel = screen.getByTestId("projects-panel");
      const videoFile = new File(["data"], "recording.mp4", {
        type: "video/mp4",
      });

      await act(async () => {
        fireEvent.drop(panel, {
          dataTransfer: {
            files: [videoFile],
            getData: () => "",
          },
        });
      });

      expect(onDropFiles).toHaveBeenCalledWith([videoFile]);
      expect(onImportVDOFile).not.toHaveBeenCalled();
    });

    it("calls onDropMeme when a library clip is dropped onto ProjectsPanel", async () => {
      const onDropMeme = vi.fn();

      render(
        <ProjectsPanel
          projects={[]}
          listError={null}
          currentId={null}
          onOpen={vi.fn()}
          onNew={vi.fn()}
          onRenamed={vi.fn()}
          onDeleted={vi.fn()}
          onDropMeme={onDropMeme}
        />
      );

      const panel = screen.getByTestId("projects-panel");
      const mockMeme = { id: "clip-99", title: "Stock Clip", duration: 4 };

      await act(async () => {
        fireEvent.drop(panel, {
          dataTransfer: {
            files: [],
            getData: (type: string) =>
              type === MEME_DRAG ? JSON.stringify(mockMeme) : "",
          },
        });
      });

      expect(onDropMeme).toHaveBeenCalledWith(mockMeme);
    });
  });
});
