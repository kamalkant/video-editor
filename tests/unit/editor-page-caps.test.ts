import { afterEach, describe, expect, it, vi } from "vitest";

// The editor page used to wait for the FFmpeg check (six FFmpeg runs, 20 s on a busy host) before it opened.
// It must open at once, whatever the check is doing.

const CHECK_MS = 3000;
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "u1", role: "user" }) }));
vi.mock("@/lib/announcement", () => ({ getAnnouncement: () => null }));
vi.mock("@/components/studio/Studio", () => ({ Studio: () => null }));
vi.mock("@/lib/ffmpeg/run", () => ({
  APPLE_MEDIA: false,
  FFMPEG: "/nowhere/ffmpeg",
  FfmpegError: class extends Error {},
  runFfmpeg: async () => {
    await new Promise((r) => setTimeout(r, CHECK_MS));
    return { stdout: Buffer.from("") };
  },
}));

afterEach(() => {
  for (const k of ["__VDOCaps", "__VDOCapsFailedAt", "__VDOCapsDone"]) delete (globalThis as Record<string, unknown>)[k];
});

describe("the editor page", () => {
  it("opens without waiting for the FFmpeg check, and warns of nothing while it runs", async () => {
    const { default: EditorPage } = await import("@/app/editor/page");
    const t0 = Date.now();
    const page = (await EditorPage({ searchParams: Promise.resolve({}) })) as { props: { children: Array<{ props: { capability?: { ok: boolean } } }> } };
    expect(Date.now() - t0).toBeLessThan(500);
    const studio = page.props.children[0];
    expect(studio.props.capability).toEqual({ ok: true, message: null });
  });
});
