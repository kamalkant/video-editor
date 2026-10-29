import { describe, expect, it } from "vitest";
import { OrderedParts, partCount, sameBytes, splitFrames } from "@/lib/export/parts";

/** A long export is made in parts at once (one Worker each), joined in order into one file. */
describe("parts of an export", () => {
  it("short exports in one go; else half the cores, at most 4", () => {
    expect(partCount(19 * 30, 30, 8)).toBe(1);
    expect(partCount(60 * 30, 30, 8)).toBe(4);
    expect(partCount(60 * 30, 30, 4)).toBe(2);
    expect(partCount(60 * 30, 30, 2)).toBe(1);
    expect(partCount(60 * 30, 30, 32)).toBe(4);
    expect(partCount(60 * 30, 30, undefined)).toBe(1);
    // a very big file: in one go (the parts' pictures wait in memory next to the file)
    expect(partCount(60 * 30, 30, 8, 300 * 1024 * 1024)).toBe(1);
    expect(partCount(60 * 30, 30, 8, 33 * 1024 * 1024)).toBe(4);
  });

  it("every part starts on a key frame, the parts cover every frame once", () => {
    for (const [total, gop, n] of [
      [1800, 60, 2],
      [1800, 60, 4],
      [1801, 60, 3],
      [100, 60, 4],
      [7, 60, 2],
    ]) {
      const parts = splitFrames(total, gop, n);
      expect(parts[0][0]).toBe(0);
      expect(parts.at(-1)![1]).toBe(total);
      for (let i = 0; i < parts.length; i++) {
        expect(parts[i][0] % gop).toBe(0);
        expect(parts[i][1]).toBeGreaterThan(parts[i][0]);
        if (i > 0) expect(parts[i][0]).toBe(parts[i - 1][1]);
      }
      expect(parts.length).toBeLessThanOrEqual(n);
    }
    expect(splitFrames(1800, 60, 2)).toEqual([
      [0, 900],
      [900, 1800],
    ]);
  });

  it("the pictures go into the file in order, whichever part finishes first", () => {
    const out: string[] = [];
    const o = new OrderedParts<string>(3, (_p, x) => out.push(x));
    o.add(0, "a1");
    o.add(2, "c1");
    o.add(1, "b1");
    o.add(0, "a2");
    o.add(2, "c2");
    expect(out).toEqual(["a1", "a2"]);
    expect(o.held).toBe(3);
    // the last part finishes first: still waits for the second
    o.finish(2);
    expect(out).toEqual(["a1", "a2"]);
    o.finish(0);
    expect(out).toEqual(["a1", "a2", "b1"]);
    // the second part's next picture goes straight in now
    o.add(1, "b2");
    expect(out).toEqual(["a1", "a2", "b1", "b2"]);
    o.finish(1);
    expect(out).toEqual(["a1", "a2", "b1", "b2", "c1", "c2"]);
    expect(o.held).toBe(0);
  });

  it("the parts are one track only when their encoder setups are the same bytes", () => {
    const a = new Uint8Array([1, 2, 3]).buffer;
    expect(sameBytes(a, new Uint8Array([1, 2, 3]).buffer)).toBe(true);
    expect(sameBytes(a, new Uint8Array([1, 2, 4]).buffer)).toBe(false);
    expect(sameBytes(a, new Uint8Array([1, 2]).buffer)).toBe(false);
    expect(sameBytes(undefined, undefined)).toBe(true);
    expect(sameBytes(a, undefined)).toBe(false);
  });
});
