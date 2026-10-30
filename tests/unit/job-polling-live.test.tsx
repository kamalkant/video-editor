// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useJobPolling } from "@/lib/jobs/useJobPolling";
import { liveJobOf } from "@/lib/export/liveJob";
import type { Job } from "@/lib/jobs/queue";

/**
 * A server export's polls (once a second) go to what shows the percent (lib/export/liveJob); the editor's job
 * changes only when its shape does (a step done, finished), so the editor doesn't re-render on every poll.
 */
const job = (pct: number, updatedAt: number, state: Job["state"] = "running"): Job =>
  ({ id: "srv-1", state, updatedAt, files: [], steps: [{ kind: "mp4", label: "Making", state: state === "done" ? "done" : "running", percent: pct }] }) as unknown as Job;

describe("server export polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("the percent goes to the live store; the editor's job changes only with the shape", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const replies = [job(10, 1), job(40, 2), job(70, 3), job(100, 4, "done")];
    let i = 0;
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => replies[Math.min(i++, replies.length - 1)] }));
    const renders = { n: 0 };
    const { result } = renderHook(() => {
      renders.n++;
      return useJobPolling("srv-1");
    });
    await waitFor(() => expect(result.current.job?.steps[0].percent).toBe(10));
    const first = result.current.job;
    const before = renders.n;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    // two more polls, the percent only: the same job in the editor, no new render, the live store has 70%
    expect(result.current.job).toBe(first);
    expect(renders.n).toBe(before);
    expect(liveJobOf(first!).steps[0].percent).toBe(70);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    // finished: a new shape, the editor's job is the finished one
    await waitFor(() => expect(result.current.job?.state).toBe("done"));
  });
});
