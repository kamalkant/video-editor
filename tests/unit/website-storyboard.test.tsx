// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExplodedLayerSection } from "@/components/website/sections/ExplodedLayerSection";

// (the other storyboard chapters were never on the page and were removed in the 2026 refresh)
describe("VDO website: exploded layers section", () => {
  afterEach(cleanup);

  it("03 ExplodedLayerSection renders all exploded layers and allows inspection", () => {
    render(<ExplodedLayerSection mousePos={{ x: 0, y: 0 }} />);
    expect(screen.getByText("03")).toBeDefined();
    expect(screen.getByText("FEATURE SHOWCASE")).toBeDefined();
    expect(screen.getByText("More Than")).toBeDefined();
    expect(screen.getAllByText(/Video Layer/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Overlay Layer/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Controls/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Timeline Strip/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Audio Waveform/).length).toBeGreaterThan(0);
  });
});
