import { afterAll, describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { POST as uploadPost } from "@/app/api/templates/upload/route";
import { GET as mediaGet } from "@/app/api/templates/media/route";
import { listLibrary } from "@/lib/library";

// uploads land in public/templates (served by the site): remove what this test adds, or every
// run would ship two more test files with the website
const created: string[] = [];
afterAll(() => {
  for (const f of created) rmSync(f, { force: true });
});

describe("Template Media Upload & Persistence API", () => {
  it("lists all static and uploaded template media via GET /api/templates/media", async () => {
    const res = await mediaGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.clips)).toBe(true);
    expect(Array.isArray(data.audioTracks)).toBe(true);
    expect(data.clips.length).toBeGreaterThanOrEqual(12);
    expect(data.audioTracks.length).toBeGreaterThanOrEqual(8);
  });

  it("uploads a video clip, saves to public/templates/media, generates thumbnail, and imports into Studio assets", async () => {
    // Read an existing test loop to upload as a custom clip
    const samplePath = join(process.cwd(), "public/templates/media/test-loop.mp4");
    if (!existsSync(samplePath)) return;
    const fileBytes = readFileSync(samplePath);
    const file = new File([fileBytes], "custom-test-broadcast.mp4", { type: "video/mp4" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "video");
    formData.append("title", "Custom Test Broadcast");

    const req = new Request("http://localhost:3000/api/templates/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.type).toBe("video");
    expect(data.url).toMatch(/^\/templates\/media\//);
    expect(data.thumbUrl).toMatch(/^\/api\/videos\/[a-zA-Z0-9-]+\/thumb/);
    expect(data.assetId).toBeDefined();
    expect(data.videoMeta).toBeDefined();

    // Verify file exists on disk in public/templates/media
    const savedPath = join(process.cwd(), "public", data.url);
    created.push(savedPath);
    expect(existsSync(savedPath)).toBe(true);
  });

  it("uploads an audio track, saves to public/templates/audio, and registers in the Audio library", async () => {
    const samplePath = join(process.cwd(), "public/templates/audio/test-theme.mp3");
    if (!existsSync(samplePath)) return;
    const fileBytes = readFileSync(samplePath);
    const file = new File([fileBytes], "custom-alarm-track.mp3", { type: "audio/mpeg" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "audio");
    formData.append("title", "Custom Alarm Track");

    const req = new Request("http://localhost:3000/api/templates/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.type).toBe("audio");
    expect(data.url).toMatch(/^\/templates\/audio\//);
    expect(data.fileName).toBeDefined();

    // Verify saved to public/templates/audio
    const savedPath = join(process.cwd(), "public", data.url);
    created.push(savedPath);
    expect(existsSync(savedPath)).toBe(true);

    // Verify it is discovered by listLibrary()
    const { items } = await listLibrary();
    const found = items.find((x) => x.id === data.id || (x as { path?: string }).path?.endsWith(data.fileName));
    expect(found).toBeDefined();
  });
});
