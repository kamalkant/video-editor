import { describe, expect, it } from "vitest";
import { jobProgress } from "@/lib/export/progress";
import type { JobStep } from "@/lib/jobs/queue";

/**
 * One percentage for the whole export, that only goes up while it runs. The dialog showed the running step's
 * own: "Getting the files ready" went to 60 %, then "Making the video" started again at 0 %.
 */
const step = (kind: JobStep["kind"], state: JobStep["state"], percent = 0): JobStep => ({ kind, label: kind, state, percent });

describe("jobProgress", () => {
  it("doesn't go back when the next step starts", () => {
    const a = jobProgress({ state: "running", steps: [step("derive", "running", 60), step("mp4", "pending"), step("poster", "pending")] });
    const b = jobProgress({ state: "running", steps: [step("derive", "done", 100), step("mp4", "running", 0), step("poster", "pending")] });
    const c = jobProgress({ state: "running", steps: [step("derive", "done", 100), step("mp4", "running", 50), step("poster", "pending")] });
    expect(b).toBeGreaterThanOrEqual(a);
    expect(c).toBeGreaterThan(b);
  });
  it("is mostly the encoding", () => {
    const half = jobProgress({ state: "running", steps: [step("derive", "done", 100), step("mp4", "running", 50), step("poster", "pending")] });
    expect(half).toBeGreaterThan(45);
    expect(half).toBeLessThan(60);
  });
  it("is 100 when done, 0 with nothing to go by", () => {
    expect(jobProgress({ state: "done", steps: [step("mp4", "running", 10)] })).toBe(100);
    expect(jobProgress(null)).toBe(0);
    expect(jobProgress({ state: "running", steps: [] })).toBe(0);
  });
  it("is a whole number between 0 and 99 while running", () => {
    const p = jobProgress({ state: "running", steps: [step("derive", "done", 100), step("mp4", "done", 100), step("poster", "running", 100)] });
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBeLessThanOrEqual(99);
  });
});
