import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

// Shared hosting (Hostinger) counts every site's programs and threads together: when the account's limit is
// full for a moment, starting FFmpeg fails with EAGAIN. That is "not now", not "FFmpeg is missing".

type Plan = ({ errno: string } | { code: number; stderr?: string; stdout?: string })[];

/** A fake child_process.spawn that plays `plan` (one entry per start). */
function fakeSpawn(plan: Plan) {
  const calls: string[][] = [];
  const spawn = (_bin: string, args: string[]) => {
    calls.push(args);
    const step = plan[Math.min(calls.length - 1, plan.length - 1)];
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdio: [] as unknown[], kill: () => true });
    setTimeout(() => {
      if ("errno" in step) {
        child.emit("error", Object.assign(new Error(`spawn /srv/vendor/ffmpeg/ffmpeg ${step.errno}`), { code: step.errno }));
        return;
      }
      if (step.stdout) child.stdout.write(step.stdout);
      if (step.stderr) child.stderr.write(step.stderr);
      setTimeout(() => child.emit("close", step.code), 1);
    }, 1);
    return child;
  };
  return { spawn, calls };
}

const realPlatform = process.platform;
afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
  vi.useRealTimers();
  vi.doUnmock("node:child_process");
  vi.doUnmock("@/lib/ffmpeg/run");
  vi.resetModules();
  delete (globalThis as { __viplaySlots?: unknown }).__viplaySlots;
  delete (globalThis as { __VDOCaps?: unknown }).__VDOCaps;
  delete (globalThis as { __VDOCapsFailedAt?: unknown }).__VDOCapsFailedAt;
});

async function runWith(plan: Plan) {
  const fake = fakeSpawn(plan);
  vi.resetModules();
  vi.doMock("node:child_process", async (orig) => ({ ...(await orig<typeof import("node:child_process")>()), spawn: fake.spawn }));
  const run = await import("@/lib/ffmpeg/run");
  return { run, calls: fake.calls };
}

describe("FFmpeg when the system says 'not now'", () => {
  it("a start refused with EAGAIN is tried again, and then works", async () => {
    const { run, calls } = await runWith([{ errno: "EAGAIN" }, { errno: "EAGAIN" }, { code: 0, stdout: "ffmpeg version 9.0.2" }]);
    const r = await run.runFfmpeg(["-version"], { collectStdout: true });
    expect(r.stdout.toString()).toContain("9.0.2");
    expect(calls).toHaveLength(3);
  });

  it("gives up after a few tries, keeping the reason (EAGAIN)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    const { run, calls } = await runWith([{ errno: "EAGAIN" }]);
    const p = run.runFfmpeg(["-version"]).catch((e) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const err = await p;
    expect(err).toBeInstanceOf(run.FfmpegError);
    expect(err.errno).toBe("EAGAIN");
    expect(calls).toHaveLength(run.BUSY_RETRY_MS.length + 1);
  });

  it("a missing program is not tried again", async () => {
    const { run, calls } = await runWith([{ errno: "ENOENT" }]);
    await expect(run.runFfmpeg(["-version"])).rejects.toMatchObject({ errno: "ENOENT" });
    expect(calls).toHaveLength(1);
  });

  it("FFmpeg that ends at once because it couldn't make its threads is tried again; a bad file is not", async () => {
    const busy = await runWith([{ code: 1, stderr: "pthread_create failed: Resource temporarily unavailable" }, { code: 0 }]);
    await busy.run.runFfmpeg(["-i", "a.mp4", "b.mp4"]);
    expect(busy.calls).toHaveLength(2);
    const bad = await runWith([{ code: 1, stderr: "a.mp4: Invalid data found when processing input" }]);
    await expect(bad.run.runFfmpeg(["-i", "a.mp4", "b.mp4"])).rejects.toMatchObject({ code: 1 });
    expect(bad.calls).toHaveLength(1);
  });

  it("FFprobe is tried again too", async () => {
    const { run, calls } = await runWith([{ errno: "EAGAIN" }, { code: 0, stdout: "{}" }]);
    expect(await run.runFfprobe(["-show_format", "a.mp4"])).toBe("{}");
    expect(calls).toHaveLength(2);
  });
});

describe("the editor's FFmpeg check", () => {
  const ok = () => {
    const encoders = " V..... libvpx-vp9 x\n V..... libx264 x\n V..... libx265 x\n";
    const filters = ["chromakey", "despill", "alphaextract", "alphamerge", "overlay", "lut", "erosion", "dilation", "gblur", "scale"].map((f) => ` ... ${f} x`).join("\n") + "\n";
    return async (args: string[]) => ({
      stdout: args.includes("lavfi") ? Buffer.alloc(2000) : Buffer.from(args[0] === "-encoders" ? encoders : args[0] === "-filters" ? filters : "ffmpeg version 9.0.2"),
    });
  };
  class FfmpegError extends Error {
    constructor(message: string, readonly code: number | null, readonly stderrTail: string, readonly errno?: string) {
      super(message);
    }
  }

  it("'busy' says so (no 'npm install'), and is checked again 30 s later instead of staying until a restart", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-06T12:00:00Z") });
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    let busy = true;
    const working = ok();
    vi.resetModules();
    vi.doMock("@/lib/ffmpeg/run", () => ({
      APPLE_MEDIA: false,
      FFMPEG: "/srv/vendor/ffmpeg/ffmpeg",
      FfmpegError,
      runFfmpeg: async (args: string[]) => {
        if (busy) throw new FfmpegError("Could not start /srv/vendor/ffmpeg/ffmpeg: spawn /srv/vendor/ffmpeg/ffmpeg EAGAIN", null, "", "EAGAIN");
        return working(args);
      },
    }));
    const { getCapabilities, FAILED_CHECK_TTL_MS } = await import("@/lib/ffmpeg/capabilities");
    const first = await getCapabilities();
    expect(first.ok).toBe(false);
    expect(first.message).toContain("busy");
    expect(first.message).toContain("EAGAIN");
    expect(first.message).not.toMatch(/npm install|\/srv/);

    busy = false;
    // within the 30 s: the same answer (a page view doesn't run FFmpeg six times)
    expect((await getCapabilities()).ok).toBe(false);
    vi.setSystemTime(Date.now() + FAILED_CHECK_TTL_MS + 1);
    expect(await getCapabilities()).toMatchObject({ ok: true, message: null });
    // and a working FFmpeg stays cached
    busy = true;
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await getCapabilities()).ok).toBe(true);
  });
});
