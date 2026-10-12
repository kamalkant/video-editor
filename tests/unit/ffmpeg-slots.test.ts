import { describe, expect, it } from "vitest";
import { createSlots } from "@/lib/ffmpeg/slots";

// On shared hosting an upload's thumbnail, filmstrip, preview copy and proxy all ran FFmpeg at once and
// slowed everything, the video stream too
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("FFmpeg slots", () => {
  it("runs at most `max` jobs, and background work one at a time, never in the last free place", async () => {
    const s = createSlots(3);
    const bg1 = await s.acquire(true);
    let bg2 = false;
    void s.acquire(true).then(() => (bg2 = true));
    const a = await s.acquire(false);
    // bg1 + a: one place left, kept for people's requests
    await tick();
    expect(bg2).toBe(false);
    const b = await s.acquire(false);
    expect(s.stats()).toMatchObject({ running: 3, background: 1, waiting: 1 });
    let c = false;
    void s.acquire(false).then(() => (c = true));
    a();
    await tick();
    // the person's request goes first
    expect(c).toBe(true);
    expect(bg2).toBe(false);
    bg1();
    await tick();
    // still only one free place (3 running would be the limit; background needs two free) → waits
    b();
    await tick();
    expect(bg2).toBe(true);
  });

  it("a request canceled while waiting leaves the queue", async () => {
    const s = createSlots(1);
    const a = await s.acquire(false);
    const ac = new AbortController();
    const waiting = s.acquire(false, ac.signal);
    ac.abort();
    await expect(waiting).rejects.toThrow("Canceled");
    expect(s.stats().waiting).toBe(0);
    a();
    expect(s.stats().running).toBe(0);
  });

  it("no limit (a Mac): everything starts at once", async () => {
    const s = createSlots(0);
    await Promise.all([s.acquire(true), s.acquire(true), s.acquire(false)]);
    expect(s.stats().waiting).toBe(0);
  });
});
