import { describe, expect, it } from "vitest";
import type { Job } from "@/lib/jobs/queue";
import { jobShape, liveJobOf, publishJob } from "@/lib/export/liveJob";

/** An export's progress lives outside the editor's state: only what shows the percent re-renders. */
const job = (id: string, updatedAt: number, pct: number, state: Job["state"] = "running"): Job =>
  ({ id, state, updatedAt, steps: [{ kind: "derive", label: "Ready", state: "done", percent: 100 }, { kind: "mp4", label: "Making", state: state === "done" ? "done" : "running", percent: pct }] }) as unknown as Job;

describe("the export's live progress", () => {
  it("the newest report of the same job; an older one never goes back", () => {
    const a = job(`a-${Math.random()}`, 1, 0);
    expect(liveJobOf(a)).toBe(a);
    const later = job(a.id, 5, 40);
    publishJob(later);
    expect(liveJobOf(a)).toBe(later);
    publishJob(job(a.id, 3, 20));
    expect(liveJobOf(a).steps[1].percent).toBe(40);
    // (the editor's own copy is newer: it wins)
    const final = job(a.id, 9, 100, "done");
    expect(liveJobOf(final)).toBe(final);
  });

  it("another job's reports don't show", () => {
    const a = job(`a-${Math.random()}`, 1, 0);
    publishJob(job(`b-${Math.random()}`, 10, 70));
    expect(liveJobOf(a)).toBe(a);
    expect(liveJobOf(null)).toBeNull();
  });

  it("the editor's state changes with the job's shape, not its percent", () => {
    const id = "s";
    expect(jobShape(job(id, 1, 10))).toBe(jobShape(job(id, 2, 90)));
    expect(jobShape(job(id, 1, 10))).not.toBe(jobShape(job(id, 3, 100, "done")));
    expect(jobShape(job(id, 1, 10))).not.toBe(jobShape(job("other", 1, 10)));
  });
});
