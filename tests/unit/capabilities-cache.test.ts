import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The FFmpeg check runs FFmpeg six times (20 s on a busy shared host). Pages must never wait for it, a passing
// "busy" must not be shown as "can't work with videos", and a passing result must survive a restart.

const dir = mkdtempSync(join(tmpdir(), "VDO-caps-cache-"));
const BIN = join(dir, "ffmpeg");
writeFileSync(BIN, "a stand-in FFmpeg binary");

const encoders = " V..... libvpx-vp9 x\n V..... libx264 x\n V..... libx265 x\n";
const filters = ["chromakey", "despill", "alphaextract", "alphamerge", "overlay", "lut", "erosion", "dilation", "gblur", "scale"].map((f) => ` ... ${f} x`).join("\n") + "\n";

class FfmpegError extends Error {
  constructor(message: string, readonly code: number | null, readonly stderrTail: string, readonly errno?: string) {
    super(message);
  }
}

const realPlatform = process.platform;
const reset = () => {
  for (const k of ["__VDOCaps", "__VDOCapsFailedAt", "__VDOCapsDone"]) delete (globalThis as Record<string, unknown>)[k];
};
afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
  vi.doUnmock("@/lib/ffmpeg/run");
  vi.resetModules();
  reset();
});

/** A fresh server process: new modules, nothing in memory. `mode` is how FFmpeg answers; `delay` how long each run takes. */
async function boot(mode: "ok" | "busy", delay = 0) {
  Object.defineProperty(process, "platform", { value: "linux", configurable: true });
  reset();
  vi.resetModules();
  const runs: string[][] = [];
  vi.doMock("@/lib/ffmpeg/run", () => ({
    APPLE_MEDIA: false,
    FFMPEG: BIN,
    FfmpegError,
    runFfmpeg: async (args: string[]) => {
      runs.push(args);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (mode === "busy") throw new FfmpegError(`spawn ${BIN} EAGAIN`, null, "", "EAGAIN");
      return { stdout: args.includes("lavfi") ? Buffer.alloc(2000) : Buffer.from(args[0] === "-encoders" ? encoders : args[0] === "-filters" ? filters : "ffmpeg version 9.0.2") };
    },
  }));
  const caps = await import("@/lib/ffmpeg/capabilities");
  return { caps, runs };
}

describe("the FFmpeg check doesn't hold pages up", () => {
  it("peek answers at once (nothing yet) and starts the check; once it's done, peek has the result", async () => {
    rmSync(process.env.VDO_CAPS_PATH!, { force: true });
    const { caps, runs } = await boot("ok", 30);
    const t0 = Date.now();
    expect(caps.peekCapabilities()).toBeNull();
    expect(Date.now() - t0).toBeLessThan(20);
    expect(runs.length).toBe(1); // (started, not waited for)
    await caps.getCapabilities();
    expect(caps.peekCapabilities()?.ok).toBe(true);
    expect(caps.capabilityWarning(caps.peekCapabilities())).toBeNull();
  });

  it("no warning while the check runs, nor when the host is only busy (EAGAIN); a real lack still warns", async () => {
    rmSync(process.env.VDO_CAPS_PATH!, { force: true }); // (else the saved passing result answers, without running FFmpeg)
    const { caps } = await boot("busy");
    expect(caps.capabilityWarning(null)).toBeNull();
    const busy = await caps.getCapabilities();
    expect(busy.ok).toBe(false);
    expect(busy.busy).toBe(true);
    expect(caps.capabilityWarning(busy)).toBeNull();
    expect(caps.capabilityWarning({ ...busy, busy: false, message: "FFmpeg can't run" })).toBe("FFmpeg can't run");
  });
});

describe("a passing check is remembered across restarts", () => {
  it("a restarted server with the same FFmpeg runs it 0 times; a different FFmpeg is checked again", async () => {
    rmSync(process.env.VDO_CAPS_PATH!, { force: true });
    const first = await boot("ok");
    expect((await first.caps.getCapabilities()).ok).toBe(true);
    expect(first.runs.length).toBeGreaterThanOrEqual(5);
    await new Promise((r) => setTimeout(r, 10)); // (the result is written once the check is done)

    const again = await boot("ok");
    expect(again.caps.loadSavedCapabilities()?.ok).toBe(true);
    expect(again.caps.peekCapabilities()?.ok).toBe(true);
    expect((await again.caps.getCapabilities()).ok).toBe(true);
    expect(again.runs).toHaveLength(0);

    utimesSync(BIN, new Date(), new Date(Date.now() + 60_000)); // (an upgraded FFmpeg)
    const upgraded = await boot("ok");
    expect(upgraded.caps.loadSavedCapabilities()).toBeNull();
    await upgraded.caps.getCapabilities();
    expect(upgraded.runs.length).toBeGreaterThanOrEqual(5);
  });

  it("a failed or busy check is never saved", async () => {
    rmSync(process.env.VDO_CAPS_PATH!, { force: true });
    const busy = await boot("busy");
    await busy.caps.getCapabilities();
    await new Promise((r) => setTimeout(r, 10));
    const next = await boot("ok");
    expect(next.caps.loadSavedCapabilities()).toBeNull();
  });
});
