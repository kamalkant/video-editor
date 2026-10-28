import { describe, expect, it } from "vitest";
import { etaSeconds, etaText } from "@/lib/export/eta";

/** How long an export has left, from how fast it went so far (the dialog showed only a percentage). */
describe("etaSeconds", () => {
  it("is unknown until the export has run a little", () => {
    expect(etaSeconds([])).toBeNull();
    expect(etaSeconds([{ t: 0, pct: 0 }, { t: 1000, pct: 1 }])).toBeNull();
    expect(etaSeconds([{ t: 0, pct: 0 }, { t: 1500, pct: 20 }])).toBeNull();
  });
  it("follows the speed so far", () => {
    // 25 % in 10 s → 75 % in 30 s
    expect(etaSeconds([{ t: 0, pct: 0 }, { t: 10_000, pct: 25 }])).toBe(30);
    // a later, slower part counts more (the recent speed)
    const s = [{ t: 0, pct: 0 }, { t: 10_000, pct: 50 }, { t: 30_000, pct: 60 }];
    expect(etaSeconds(s)!).toBeGreaterThan(40);
  });
  it("is 0 when done", () => {
    expect(etaSeconds([{ t: 0, pct: 0 }, { t: 10_000, pct: 100 }])).toBe(0);
  });
});

describe("etaText", () => {
  it("says it simply", () => {
    expect(etaText(null)).toBe("");
    expect(etaText(0)).toBe("");
    expect(etaText(8)).toBe("a few seconds left");
    expect(etaText(40)).toBe("less than a minute left");
    expect(etaText(95)).toBe("about 2 min left");
    expect(etaText(3 * 3600 + 600)).toBe("about 3 h 10 min left");
  });
});
