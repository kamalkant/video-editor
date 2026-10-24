import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The export made in this browser has what the preview shows (lib/render/frame): a crossfade between two
 * scenes, a text that slides in (Hindi words in a Google font, one word styled bigger and yellow) and an
 * element. Before, it had none of them (EDITOR_AUDIT.md E1). Real Chrome: its WebCodecs H.264 encoder.
 */
test.use({ channel: "chrome" });

const W = 640;
const H = 360;
const doc = {
  version: 2,
  canvas: { width: W, height: H, fps: 24, background: "#000000" },
  output: { resolution: "original", fps: "original", quality: "balanced", audio: "keep", master: false, crop: { enabled: false, padding: 10 } },
  tracks: [
    {
      id: "v2",
      kind: "overlay",
      locked: false,
      hidden: false,
      clips: [
        { id: "e1", type: "element", start: 0, duration: 4, el: { kind: "rect", aspect: 1, fill: "#00ff00", stroke: "none", strokeWidth: 0 }, transform: { fit: "fit", x: 0.38, y: -0.32, scale: 0.25 }, anim: { in: "none", out: "none" }, fadeIn: 0, fadeOut: 0 },
      ],
    },
    {
      id: "v3",
      kind: "overlay",
      locked: false,
      hidden: false,
      clips: [
        {
          id: "t1",
          type: "text",
          start: 0,
          duration: 4,
          text: "नमस्ते दुनिया",
          style: { preset: "plain", font: "gf:Mukta", size: 90, color: "#ffffff", box: "none", align: "center", bold: true, accent: "#ffffff", shadow: false },
          marks: [{ from: 0, to: 6, color: "#ffff00", size: 1.4 }],
          transform: { fit: "fit", x: 0, y: 0.25, scale: 1 },
          anim: { in: "slide", out: "none" },
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    },
    {
      id: "v1",
      kind: "main",
      locked: false,
      muted: false,
      hidden: false,
      clips: [
        { id: "s1", type: "blank", fill: "#ff0000", duration: 2.5, fadeIn: 0, fadeOut: 0 },
        { id: "s2", type: "blank", fill: "#0000ff", duration: 2.5, fadeIn: 0, fadeOut: 0, transitionIn: { type: "crossfade", duration: 1 } },
      ],
    },
    { id: "a1", kind: "audio", locked: false, muted: false, clips: [] },
  ],
};

test("the browser export has the preview's transition, text animation, styled letters and element", async ({ page }) => {
  test.setTimeout(240_000);
  const r = await page.request.post("/api/projects", { data: { doc, name: "Export parity" } });
  expect(r.ok(), await r.text()).toBe(true);
  const { id } = await r.json();
  await page.goto(`/editor?p=${id}`);
  await expect(page.getByTestId("program-canvas")).toBeVisible({ timeout: 60_000 });

  // Export ▾ → MP4 · project size (made in this browser: no media, nothing to send)
  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("menuitem", { name: /MP4 · project size/ }).click();
  const result = page.getByTestId("mp4-result");
  await expect(result).toBeVisible({ timeout: 180_000 });
  const src = await result.getAttribute("src");
  expect(src?.startsWith("blob:")).toBe(true);
  const b64 = await page.evaluate(async (u) => {
    const buf = new Uint8Array(await (await fetch(u!)).arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, src);
  const dir = mkdtempSync(join(tmpdir(), "VDO-parity-e2e-"));
  try {
    const file = join(dir, "export.mp4");
    writeFileSync(file, Buffer.from(b64, "base64"));
    const frame = (t: number) => execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    const px = (f: Buffer, x: number, y: number) => [f[(y * W + x) * 3], f[(y * W + x) * 3 + 1], f[(y * W + x) * 3 + 2]];
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
    // two 2.5 s scenes overlapping 1 s: 4 s
    expect(duration).toBeGreaterThan(3.8);
    expect(duration).toBeLessThan(4.3);

    // the crossfade: red, then half red half blue, then blue (a corner, away from the text and the element)
    const [r0, , b0] = px(frame(0.8), 10, 340);
    expect(r0).toBeGreaterThan(200);
    expect(b0).toBeLessThan(60);
    const [rm, , bm] = px(frame(2.0), 10, 340);
    expect(rm).toBeGreaterThan(70);
    expect(rm).toBeLessThan(190);
    expect(bm).toBeGreaterThan(70);
    expect(bm).toBeLessThan(190);
    const [r1, , b1] = px(frame(3.5), 10, 340);
    expect(r1).toBeLessThan(60);
    expect(b1).toBeGreaterThan(200);

    // the element: a green square near the top right
    const [er, eg, eb] = px(frame(1.0), Math.round(W * 0.88), Math.round(H * 0.18));
    expect(eg).toBeGreaterThan(200);
    expect(er + eb).toBeLessThan(120);

    // the text: yellow letters (the styled word) and white ones, on its line; sliding in from the left
    const textRow = Math.round(H * 0.75) - 10;
    const lit = (f: Buffer) => {
      let sum = 0;
      let n = 0;
      let yellow = 0;
      let white = 0;
      for (let y = textRow - 40; y < textRow + 30; y++)
        for (let x = 0; x < W; x++) {
          const [r, g, b] = px(f, x, y);
          if (r > 200 && g > 200 && b < 90) yellow++;
          if (r > 220 && g > 220 && b > 220) white++;
          // (anything that isn't the red scene is the text, even half see-through)
          if (g > 60) {
            sum += x;
            n++;
          }
        }
      return { center: n ? sum / n : -1, n, yellow, white };
    };
    const settled = lit(frame(1.2));
    expect(settled.yellow).toBeGreaterThan(50);
    expect(settled.white).toBeGreaterThan(50);
    // 0.2 s in, the slide still has about a fifth of its way to go (and the text is half see-through)
    const early = lit(frame(0.2));
    expect(early.n).toBeGreaterThan(20);
    expect(early.center).toBeLessThan(settled.center - 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the Export dialog's preview plays the export itself: its transition and element at the export's size", async ({ page }) => {
  test.setTimeout(180_000);
  const r = await page.request.post("/api/projects", { data: { doc, name: "Export preview" } });
  expect(r.ok(), await r.text()).toBe(true);
  const { id } = await r.json();
  await page.goto(`/editor?p=${id}`);
  await expect(page.getByTestId("program-canvas")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("export-button").click();
  const canvas = page.getByTestId("export-preview").locator("canvas");
  await expect(canvas).toBeVisible();
  const px = (fx: number, fy: number) =>
    canvas.evaluate((el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      return [...c.getContext("2d")!.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data];
    }, [fx, fy]);
  // the element (it used to show the first video's raw file, without any of this)
  await expect.poll(async () => (await px(0.88, 0.18))[1], { timeout: 20_000 }).toBeGreaterThan(200);
  // half way through the crossfade
  await page.getByLabel("Time in the preview").fill("2");
  await expect
    .poll(async () => {
      const [rr, , bb] = await px(0.02, 0.95);
      return rr > 70 && rr < 190 && bb > 70 && bb < 190;
    }, { timeout: 20_000 })
    .toBe(true);
  // a social size: the preview turns tall like the file
  await page.getByText("Shorts / Reels").first().click();
  await expect.poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).height > (el as HTMLCanvasElement).width)).toBe(true);
});

test("the quick presets show the export at their sizes, also of a file kept on this computer", async ({ page }) => {
  // (the cards asked the server for a frame of the file, which it hasn't got: every picture was broken)
  const failed: string[] = [];
  page.on("response", (r) => r.status() >= 400 && r.url().includes("/api/videos/") && failed.push(`${r.status()} ${r.url()}`));
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(join(__dirname, ".fixtures", "red.mp4"));
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("export-button").click();
  const thumbs = page.getByRole("dialog", { name: "Export & Share" }).getByTestId("preset-thumb");
  await expect(thumbs).toHaveCount(10);
  // drawn here, like the preview (lib/render/frame): one per preset
  await expect
    .poll(() => thumbs.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).src.startsWith("data:image/") && (e as HTMLImageElement).naturalWidth > 0)), { timeout: 20_000 })
    .toBe(true);
  const look = await thumbs.evaluateAll((els) =>
    els.map((e) => {
      const img = e as HTMLImageElement;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      const at = (fx: number, fy: number) => [...x.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data];
      return { ratio: img.naturalWidth / img.naturalHeight, middle: at(0.5, 0.5), top: at(0.5, 0.03) };
    }),
  );
  const red = ([r, g, b]: number[]) => r! > 170 && g! < 80 && b! < 80;
  const black = ([r, g, b]: number[]) => r! + g! + b! < 40;
  // Project size and YouTube: the 16:9 video fills the frame
  for (const i of [0, 1]) {
    expect(look[i]!.ratio).toBeCloseTo(16 / 9, 1);
    expect(red(look[i]!.top)).toBe(true);
  }
  // Shorts / Reels and Instagram Post: a tall and a square file, the video fitted between black bands
  expect(look[2]!.ratio).toBeCloseTo(9 / 16, 1);
  expect(look[3]!.ratio).toBeCloseTo(1, 1);
  for (const i of [2, 3]) {
    expect(red(look[i]!.middle)).toBe(true);
    expect(black(look[i]!.top)).toBe(true);
  }
  expect(failed).toEqual([]);
});

test("the Thumbnail maker takes the playhead's frame of a file kept on this computer", async ({ page }) => {
  // (it asked the server for the frame, which it hasn't got: "Couldn't load the frame at the playhead")
  const failed: string[] = [];
  page.on("response", (r) => r.status() >= 400 && r.url().includes("/api/videos/") && failed.push(`${r.status()} ${r.url()}`));
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(join(__dirname, ".fixtures", "red.mp4"));
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("menuitem", { name: /Thumbnail maker/ }).click();
  const dialog = page.getByRole("dialog", { name: "Thumbnail maker" });
  const canvas = dialog.getByLabel("Thumbnail preview");
  await expect
    .poll(
      () =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const [r, g, b] = c.getContext("2d")!.getImageData(c.width / 2, c.height / 2, 1, 1).data;
          return r! > 170 && g! < 90 && b! < 90;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(failed).toEqual([]);
});
