import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

/**
 * Local-first playback (lib/media/localMedia): an imported file plays from this computer at once. Its first
 * frame shows without waiting for the upload, nothing is downloaded back from the server, dragging it on
 * the timeline plays at once, and after a reload it plays from the copy kept in the browser.
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
  const put = page.waitForRequest((r) => r.method() === "PUT" && /\/api\/videos\/[0-9a-f-]{36}$/.test(r.url()));

  // 1. import: the first frame is on the stage without waiting for the upload
  const t0 = Date.now();
  await page.getByTestId("file-input").setInputFiles(join(FIX, "red.mp4"));
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1);
  await expect.poll(async () => isRed(await middle(page)), { timeout: 10_000, intervals: [50] }).toBe(true);
  const firstFrameMs = Date.now() - t0;
  const id = /\/api\/videos\/([0-9a-f-]{36})$/.exec((await put).url())![1]!;
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

  // nothing was downloaded back from the server
  expect(downloads.filter((d) => d.id === id)).toEqual([]);

  // 3. after a reload (the upload done), it plays from the copy kept in the browser, not the server's
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", { timeout: 30_000 });
  await expect.poll(() => page.evaluate((i) => !!Object.keys(JSON.parse(Object.entries(localStorage).find(([k]) => k.startsWith("viplay:local-media:"))?.[1] ?? "{}")).includes(i), id)).toBe(true);
  await page.reload();
  await expect(page.getByTestId("lane-main").getByTestId("timeline-clip")).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(async () => (await poolVideos(page)).some((v) => v.src.startsWith("blob:")), { timeout: 15_000 }).toBe(true);
  await expect.poll(async () => isRed(await middle(page)), { timeout: 10_000 }).toBe(true);
  expect(downloads.filter((d) => d.id === id)).toEqual([]);
});

test("local-first: the clip view (and split view) plays the imported file from this computer", async ({ page }) => {
  const downloads = watchDownloads(page);
  await page.goto("/editor");
  const put = page.waitForRequest((r) => r.method() === "PUT" && /\/api\/videos\/[0-9a-f-]{36}$/.test(r.url()));
  await page.getByTestId("file-input").setInputFiles(join(FIX, "red.mp4"));
  const clip = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(clip).toHaveCount(1);
  const id = /\/api\/videos\/([0-9a-f-]{36})$/.exec((await put).url())![1]!;
  await expect(async () => {
    await clip.first().click();
    await expect(page.getByRole("button", { name: "Split view: Program and This clip" })).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Split view: Program and This clip" }).click();
  const original = page.getByTestId("split-clip").locator('video[aria-label="Original video"]');
  await expect.poll(() => original.evaluate((v) => (v as HTMLVideoElement).currentSrc)).toMatch(/^blob:/);
  expect(downloads.filter((d) => d.id === id)).toEqual([]);
});
