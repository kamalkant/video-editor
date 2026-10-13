// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { UnifiedLibraryPanel } from "@/components/studio/UnifiedLibraryPanel";

describe("UnifiedLibraryPanel Sticky Top Bar & Audio Behavior", () => {
  beforeEach(() => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/library" || url.includes("/api/library")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              items: [
                {
                  id: "audio-1",
                  title: "Ambient Sunset Melody",
                  url: "/audio/sunset.mp3",
                  duration: 65,
                  kind: "music",
                  mood: "Chill",
                },
                {
                  id: "audio-2",
                  title: "Upbeat Corporate Groove",
                  url: "/audio/upbeat.mp3",
                  duration: 45,
                  kind: "music",
                  mood: "Energetic",
                },
              ],
            }),
          });
        }
        if (url.includes("/api/stock/photos")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ items: [] }),
          });
        }
        if (url.includes("/api/stock/search")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ items: [] }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [] }),
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders search bar and category pills in a sticky top header container", () => {
    const { container } = render(
      <UnifiedLibraryPanel
        onInsertVideo={vi.fn()}
        onInsertAudio={vi.fn()}
      />,
    );

    const searchInput = screen.getByTestId("library-search");
    expect(searchInput).toBeDefined();

    // The header container wrapping the search bar & category pills must have sticky top-0
    const header = searchInput.closest(".sticky");
    expect(header).toBeDefined();
    expect(header?.className).toContain("top-0");
    expect(header?.className).toContain("z-20");
    expect(header?.className).toContain("bg-surface");

    // Category pills are present inside the sticky header
    expect(screen.getByRole("button", { name: /^Videos$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Photos$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Audio$/i })).toBeDefined();
  });

  it("does not render a playing audio bar on top of AUDIO & MUSIC when audio plays", async () => {
    render(
      <UnifiedLibraryPanel
        onInsertVideo={vi.fn()}
        onInsertAudio={vi.fn()}
      />,
    );

    // Switch to Audio category
    fireEvent.click(screen.getByRole("button", { name: /^Audio$/i }));

    // Wait for audio items to load
    await waitFor(() => {
      expect(screen.getByText("Ambient Sunset Melody")).toBeDefined();
    });

    // Ensure audio section header is visible
    expect(screen.getByText(/AUDIO & MUSIC/i)).toBeDefined();

    // Verify there is no "Currently Playing Track" or "Playing Preview" banner on top
    expect(screen.queryByText("Playing Preview")).toBeNull();

    // Click play preview on the first audio track
    const playButtons = screen.getAllByTitle("Play preview");
    expect(playButtons.length).toBeGreaterThan(0);
    fireEvent.click(playButtons[0]);

    // Track is now playing inline: the button changes to "Pause"
    await waitFor(() => {
      expect(screen.getByTitle("Pause")).toBeDefined();
    });

    // CRITICAL: Ensure NO top banner bar with "Playing Preview" header was inserted on top of AUDIO & MUSIC
    expect(screen.queryByText("Currently Playing Track")).toBeNull();
    // The playing indicator is inline beside the track metadata
    expect(screen.getByText(/Playing ·/i)).toBeDefined();
  });
});
