import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_IMAGES, SITE_MEDIA } from "@/components/website/media/manifest";

const ROOT = join(process.cwd(), "components", "website");
const PUBLIC_SITE = join(process.cwd(), "public", "website");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const sources = files(ROOT)
  .filter((p) => !p.endsWith(join("media", "manifest.ts")))
  .map((p) => ({ p: p.slice(ROOT.length + 1), s: readFileSync(p, "utf8") }));
const listed = (dir: string) => readdirSync(join(PUBLIC_SITE, dir)).filter((f) => !f.startsWith("."));

describe("website media hygiene", () => {
  it("public/website holds one images folder and one videos folder, nothing else", () => {
    expect(readdirSync(PUBLIC_SITE).filter((f) => !f.startsWith(".")).sort()).toEqual(["images", "videos"]);
    expect(listed("videos").every((f) => f.endsWith(".mp4"))).toBe(true);
    expect(listed("images").every((f) => f.endsWith(".webp"))).toBe(true);
  });

  it("every file there is in the manifest (nothing unused is deployed) and every manifest file exists", () => {
    const used = new Set<string>([
      ...Object.values(SITE_MEDIA).flatMap((m) => [m.src, m.poster]),
      ...Object.values(SITE_IMAGES).map((i) => i.src),
    ]);
    for (const url of used) expect(existsSync(join(process.cwd(), "public", url)), url).toBe(true);
    const onDisk = [...listed("videos").map((f) => `/website/videos/${f}`), ...listed("images").map((f) => `/website/images/${f}`)];
    expect(onDisk.filter((u) => !used.has(u))).toEqual([]);
  });

  it("each file is light: videos ≤ 1.2MB, images ≤ 150KB", () => {
    for (const m of Object.values(SITE_MEDIA)) {
      expect(m.bytes, m.src).toBeLessThanOrEqual(1.2 * 1024 * 1024);
      expect(statSync(join(process.cwd(), "public", m.poster)).size, m.poster).toBeLessThanOrEqual(150 * 1024);
    }
    for (const i of Object.values(SITE_IMAGES)) expect(i.bytes, i.src).toBeLessThanOrEqual(150 * 1024);
  });

  it("components use the manifest, never a hand-typed website path", () => {
    const direct = sources.flatMap(({ p, s }) => [...s.matchAll(/["'`]\/website\/[^"'`]+/g)].map((m) => `${p}: ${m[0]}`));
    expect(direct).toEqual([]);
  });

  it("no video starts on its own outside the shared playback rules", () => {
    const bare = sources.filter(({ s }) => /<video[^>]*\sautoPlay(\s|\n|\/|>)/.test(s)).map(({ p }) => p);
    expect(bare).toEqual([]);
  });

  it("no made-up specs come back", () => {
    for (const claim of ["YOLO", "SYNTH-4", "MediaPipe", "WebGL 2.0", "Latency: 2ms", "Hardware Native", "5x faster"]) {
      const hit = sources.find(({ s }) => s.includes(claim));
      expect(hit?.p, claim).toBeUndefined();
    }
  });
});
