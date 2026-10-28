// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { emptyDoc, type TimelineDoc } from "@/lib/edit/doc";
import { CaptionDownloads } from "@/components/studio/CaptionDownloads";

/** After an export, its subtitles can be downloaded too (.srt / .vtt for YouTube and players), not only from the Subtitles panel. */
describe("CaptionDownloads", () => {
  afterEach(cleanup);
  const withSubs = (): TimelineDoc => {
    const d = emptyDoc();
    d.tracks.unshift({ id: "s1", kind: "overlay", name: "Subtitles (Hindi)", locked: false, hidden: false, clips: [{ id: "c1", type: "text", start: 1, duration: 2, text: "नमस्ते" }] } as never);
    return d;
  };

  it("offers each subtitle track as .srt and .vtt, named after the project", () => {
    render(<CaptionDownloads doc={withSubs()} projectName="Goa trip" />);
    expect(screen.getByRole("button", { name: "Download Subtitles (Hindi) as .srt" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download Subtitles (Hindi) as .vtt" })).toBeTruthy();
  });

  it("shows nothing without subtitles", () => {
    const { container } = render(<CaptionDownloads doc={emptyDoc()} projectName="Goa trip" />);
    expect(container.innerHTML).toBe("");
  });
});
