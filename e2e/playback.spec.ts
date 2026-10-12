import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Local-first media (lib/media/localMedia): an imported file plays from this computer at once and stays
 * there. Its first frame shows at once, nothing is sent to or downloaded from the server, dragging it on the
 * timeline plays at once, after a reload it plays from the copy kept in the browser, and only the export
 * (a server feature) sends it.
 */

const FIX = join(__dirname, ".fixtures");
const MEDIA_GET = /^\/api\/videos\/([0-9a-f-]{36})\/(play|source|proxy)$/;

/** Every download of a file's video from the server (what local-first playback avoids). */
function watchDownloads(page: Page) {
  const got: { id: string; what: string; at: number }[] = [];
  page.on("request", (r) => {
    const m = MEDIA_GET.exec(new URL(r.url()).pathname);
    if (m && r.method() === "GET") got.push({ id: m[1]!, what: m[2]!, at: Date.now() });
  });
  return got;
}

/** The id of the file just imported (its copy's entry in the browser's index). */
const importedId = (page: Page) =>
  page.evaluate(() => {
    const e = Object.entries(localStorage).find(([k]) => k.startsWith("viplay:local-media:"));
    return Object.keys(JSON.parse(e?.[1] ?? "{}"))[0] ?? null;
  });

/** The program preview's middle pixel. */
const middle = (page: Page) =>
  page.getByTestId("program-canvas").evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return [...c.getContext("2d")!.getImageData(Math.round(c.width / 2), Math.round(c.height / 2), 1, 1).data];
  });
const isRed = ([r, g, b, a]: number[]) => a! > 200 && r! > 170 && g! < 80 && b! < 80;

/** The preview's video elements: where they play from and how far they are. */
const poolVideos = (page: Page) =>
  page.getByTestId("video-pool").evaluate((el) => [...el.querySelectorAll("video")].map((v) => ({ src: v.currentSrc || v.src, t: v.currentTime, paused: v.paused })));

test("local-first: an imported clip shows its first frame at once and plays from this computer", async ({ page }) => {
  const downloads = watchDownloads(page);
  await page.goto("/editor");
  await expect(page.getByTestId("file-input")).toBeAttached();
  const puts: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && /\/api\/videos\/[0-9a-f-]{36}$/.test(r.url()) && puts.push(r.url()));

  // 1. import: the first frame is on the stage without waiting for the upload
  const t0 = Date.now();
  await page.getByTestId("file-input").setInputFiles(join(FIX, "red.mp4"));
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1);
  await expect.poll(async () => isRed(await middle(page)), { timeout: 10_000, intervals: [50] }).toBe(true);
  const firstFrameMs = Date.now() - t0;
  await expect.poll(() => importedId(page)).not.toBeNull();
  const id = (await importedId(page))!;
  test.info().annotations.push({ type: "first frame after import (ms)", description: String(firstFrameMs) });
  expect(firstFrameMs).toBeLessThan(5_000);
  // it plays from the file itself (an object URL), not a server copy
  await expect.poll(async () => (await poolVideos(page)).some((v) => v.src.startsWith("blob:"))).toBe(true);

  // 2. drag it from Media onto the overlay track, then play: it plays at once, from this computer
  const tile = page.getByTestId("assets").getByRole("button", { name: "red.mp4", exact: true }).first();
  const lane = page.getByTestId("lane-overlay").first();
  const lb = (await lane.boundingBox())!;
  const dt = await page.evaluateHandle(() => new DataTransfer());
  const at = { dataTransfer: dt, clientX: lb.x + 40, clientY: lb.y + lb.height / 2 };
  await tile.dispatchEvent("dragstart", { dataTransfer: dt });
  await lane.dispatchEvent("dragenter", at);
  await lane.dispatchEvent("dragover", at);
  await lane.dispatchEvent("drop", at);
  await tile.dispatchEvent("dragend", { dataTransfer: dt });
  await expect(page.getByTestId("lane-overlay").first().getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByLabel("Program preview. Space plays or pauses.").focus();
  await page.keyboard.press("Home");
  const t1 = Date.now();
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await expect
    .poll(async () => (await poolVideos(page)).some((v) => v.src.startsWith("blob:") && !v.paused && v.t > 0.2), { timeout: 10_000, intervals: [50] })
    .toBe(true);
  const playingMs = Date.now() - t1;
  test.info().annotations.push({ type: "playing after Play (ms)", description: String(playingMs) });
  console.log(`local-first playback: first frame ${firstFrameMs} ms after import, playing ${playingMs} ms after Play`);
  expect(playingMs).toBeLessThan(3_000);
  // every element plays a file from this computer
  expect((await poolVideos(page)).filter((v) => v.src).every((v) => v.src.startsWith("blob:"))).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();

  // nothing was downloaded back from the server, and nothing was sent to it: the file stays here
  expect(downloads.filter((d) => d.id === id)).toEqual([]);
  expect(puts).toEqual([]);
  await expect(page.getByTestId("assets").getByTestId("asset-local").first()).toBeVisible();

  // 3. after a reload, it plays from the copy kept in the browser (still not sent)
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(async () => (await poolVideos(page)).some((v) => v.src.startsWith("blob:")), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => isRed(await middle(page)), { timeout: 10_000 }).toBe(true);
  expect(downloads.filter((d) => d.id === id)).toEqual([]);
  expect(puts).toEqual([]);

  // 4. the export runs on the server: starting it sends the file first, then the video is made
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect.poll(() => puts.some((u) => u.endsWith(id)), { timeout: 30_000 }).toBe(true);
  await expect(page.getByTestId("export-button")).toContainText("Export ✓", { timeout: 120_000 });
});

test("local-first: the clip view (and split view) plays the imported file from this computer", async ({ page }) => {
  const downloads = watchDownloads(page);
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(join(FIX, "red.mp4"));
  const clip = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(clip).toHaveCount(1);
  await expect.poll(() => importedId(page)).not.toBeNull();
  const id = (await importedId(page))!;
  await expect(async () => {
    await clip.first().click();
    await expect(page.getByRole("button", { name: "Split view: Program and This clip" })).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Split view: Program and This clip" }).click();
  const original = page.getByTestId("split-clip").locator('video[aria-label="Original video"]');
  await expect.poll(() => original.evaluate((v) => (v as HTMLVideoElement).currentSrc)).toMatch(/^blob:/);
  expect(downloads.filter((d) => d.id === id)).toEqual([]);
});

test("a big .mov the browser can't play (ProRes) uploads in chunks and lands on the timeline", async ({ page }) => {
  // (an editor's export: ProRes 422 HQ, about 40 MB; browsers can't decode it, so it goes to the server)
  const mov = join(FIX, "big-prores.mov");
  if (!existsSync(mov))
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=25:d=6", "-c:v", "prores_ks", "-profile:v", "3", mov]);
  const chunks: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && /\/api\/uploads\/[0-9a-f-]{36}\?offset=\d+$/.test(r.url()) && chunks.push(r.url()));
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(mov);
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1, { timeout: 120_000 });
  expect(chunks.length).toBeGreaterThan(2);
  console.log(`big .mov: ${chunks.length} chunks`);
});

