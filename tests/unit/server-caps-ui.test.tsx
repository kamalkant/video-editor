// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const caps = vi.hoisted(() => ({ safariAlpha: true, aiRemoval: true, macVoices: true }));
vi.mock("@/lib/editor/useServerCaps", () => ({ useServerCaps: () => caps }));

import { FormatPicker } from "@/components/studio/FormatPicker";

// viplay.in runs on Linux: no Safari .mov in the website pack, so the dialog says what the zip holds
describe("export formats follow what the server can make", () => {
  afterEach(cleanup);

  it("on a Mac the website pack has both files", () => {
    caps.safariAlpha = true;
    render(<FormatPicker value="mp4" onChange={() => {}} blockedOf={() => null} />);
    expect(screen.getByText("Website pack (VP9 + HEVC alpha)")).toBeDefined();
  });

  it("off a Mac it's the WebM + poster pack", () => {
    caps.safariAlpha = false;
    render(<FormatPicker value="mp4" onChange={() => {}} blockedOf={() => null} />);
    expect(screen.getByText("Website pack (VP9 alpha)")).toBeDefined();
    expect(screen.getByText(/WebM see-through video \+ a poster/)).toBeDefined();
  });
});
