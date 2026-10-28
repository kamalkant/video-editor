import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { storagePath } from "@/lib/storage";
import { getJob } from "@/lib/jobs/queue";

/** An export the server was making when it restarted: the message fits any export (it named the transparent video only). */
describe("a job that was running when the server restarted", () => {
  it("is failed, with a message for any export", async () => {
    const id = randomUUID();
    mkdirSync(storagePath("jobs", id), { recursive: true });
    writeFileSync(storagePath("jobs", id, "job.json"), JSON.stringify({ id, videoId: "", createdAt: 1, updatedAt: 1, state: "running", spec: { version: 1, ops: [], output: {} }, steps: [], files: [], output: { width: 1, height: 1, fps: 1, hasAudio: false }, error: null, errorDetail: null }));
    const job = await getJob(id);
    expect(job?.state).toBe("failed");
    expect(job?.error).toBe("The server restarted while this export was being made. Export it again.");
  });
});
