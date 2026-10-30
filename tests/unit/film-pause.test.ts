import { describe, expect, it } from "vitest";
import { filmsPaused, setFilmPaused } from "@/lib/media/localMedia";

/** The timeline's films wait while the preview plays and while an export is made in this browser. */
describe("films wait while anything needs the computer", () => {
  it("go on only once no reason is left (the preview stopping doesn't restart them during an export)", () => {
    setFilmPaused(true, "export");
    setFilmPaused(true);
    expect(filmsPaused()).toBe(true);
    setFilmPaused(false);
    expect(filmsPaused()).toBe(true);
    setFilmPaused(false, "export");
    expect(filmsPaused()).toBe(false);
  });
});
