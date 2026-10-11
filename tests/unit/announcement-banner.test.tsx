// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnouncementBanner } from "@/components/studio/AnnouncementBanner";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AnnouncementBanner", () => {
  it("shows the note, stays closed once closed, and comes back when the note changes", async () => {
    render(<AnnouncementBanner id="a1" message="<b>Maintenance</b> at 11 pm" tone="warning" />);
    const note = await screen.findByRole("alert");
    expect(note.textContent).toContain("<b>Maintenance</b> at 11 pm"); // text, never markup
    await act(async () => fireEvent.click(screen.getByLabelText("Close this message")));
    expect(screen.queryByRole("alert")).toBeNull();

    cleanup();
    render(<AnnouncementBanner id="a1" message="<b>Maintenance</b> at 11 pm" tone="warning" />);
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();

    cleanup();
    render(<AnnouncementBanner id="b2" message="New: AI dubbing" tone="info" />);
    expect((await screen.findByRole("status")).textContent).toContain("New: AI dubbing");
  });
});
