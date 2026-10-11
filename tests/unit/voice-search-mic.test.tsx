// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { VoiceSearchMic } from "@/components/ui/VoiceSearchMic";

describe("VoiceSearchMic component", () => {
  let onResultCb: ((e: any) => void) | null = null;
  let onStartCb: (() => void) | null = null;
  let onEndCb: (() => void) | null = null;

  class MockSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = "en-US";
    start = vi.fn().mockImplementation(() => {
      if (onStartCb) onStartCb();
    });
    stop = vi.fn().mockImplementation(() => {
      if (onEndCb) onEndCb();
    });
    abort = vi.fn();
    set onstart(cb: any) {
      onStartCb = cb;
    }
    set onresult(cb: any) {
      onResultCb = cb;
    }
    set onend(cb: any) {
      onEndCb = cb;
    }
  }

  beforeEach(() => {
    (window as any).SpeechRecognition = MockSpeechRecognition;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as any).SpeechRecognition;
  });

  it("renders with idle search tooltip and aria label", () => {
    render(<VoiceSearchMic onTranscript={() => {}} />);
    const button = screen.getByRole("button", { name: /search by voice/i });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("handles speech recognition lifecycle when clicked", () => {
    const onTranscript = vi.fn();
    render(<VoiceSearchMic onTranscript={onTranscript} />);

    const button = screen.getByRole("button", { name: /search by voice/i });
    
    // Click to start
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    // Simulate speech recognition result
    act(() => {
      if (onResultCb) {
        onResultCb({
          results: [[{ transcript: "breaking news template" }]],
        });
      }
    });

    expect(onTranscript).toHaveBeenCalledWith("breaking news template");

    // Click again to stop
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows graceful message when speech recognition is unsupported in browser", () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    render(<VoiceSearchMic onTranscript={() => {}} />);
    const button = screen.getByRole("button", { name: /not supported/i });
    expect(button).toBeDefined();
  });
});
