import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";

const FIX = join(__dirname, ".fixtures");
const upload = (page: Page, file: string) => page.getByTestId("file-input").setInputFiles(join(FIX, file));

/** Drag an asset tile over `lane` at (dx, dy from its top-left); returns the shadow's box and label. */
async function dragOver(page: Page, name: string, target: Locator, pos: { x: number; y: number }) {
  const tile = page.getByTestId("assets").getByRole("button", { name, exact: true }).first();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  const at = { dataTransfer: dt, clientX: pos.x, clientY: pos.y };
  await tile.dispatchEvent("dragstart", { dataTransfer: dt });
  await target.dispatchEvent("dragenter", at);
  await target.dispatchEvent("dragover", at);
  const shadow = page.getByTestId("drop-shadow");
  await expect(shadow).toBeVisible();
  const box = (await shadow.boundingBox())!;
  const text = await shadow.innerText();
  await target.dispatchEvent("dragleave", { dataTransfer: dt, clientX: -10, clientY: -10 });
  await tile.dispatchEvent("dragend", { dataTransfer: dt });
  return { box, text };
}
const inside = (b: { y: number; height: number }, lane: { y: number; height: number }) =>
  b.y >= lane.y - 1 && b.y + b.height <= lane.y + lane.height + 1;

test("drop shadow lands on the lane under the pointer, or the nearest one of the clip's kind", async ({ page }) => {
  await page.goto("/editor");
  await upload(page, "veo.mp4");
  const main = page.getByTestId("lane-main");
  await expect(main.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "grey.mp4");
  await expect(main.getByTestId("timeline-clip")).toHaveCount(2);
  await upload(page, "music.m4a");
  await expect(page.getByTestId("lane-audio").first().getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "site.png");
  await expect(page.getByTestId("lane-overlay").first().getByTestId("timeline-clip")).toHaveCount(1);
  const mainBox = (await main.boundingBox())!;
  const audio = page.getByTestId("lane-audio").first();
  const audioBox = (await audio.boundingBox())!;
  const overlay = page.getByTestId("lane-overlay").first();
  const ovBox = (await overlay.boundingBox())!;
  const pic = (await overlay.getByTestId("timeline-clip").first().boundingBox())!;

  // a video over the sound lane: on Video 1 (not at its end: at the pointer)
  const v = await dragOver(page, "grey.mp4", audio, { x: audioBox.x + 60, y: audioBox.y + audioBox.height / 2 });
  expect(inside(v.box, mainBox)).toBe(true);

  // sound over a picture lane: on the audio lane
  const s = await dragOver(page, "music.m4a", overlay, { x: ovBox.x + pic.width + 400, y: ovBox.y + ovBox.height / 2 });
  expect(inside(s.box, audioBox)).toBe(true);

  // a picture over the busy overlay (over its picture): a new track right above it, shown on that lane
  const p2 = await dragOver(page, "site.png", overlay, { x: pic.x + 5, y: ovBox.y + ovBox.height / 2 });
  expect(inside(p2.box, ovBox)).toBe(true);
  expect(p2.text).toContain("new track above");

  // a video in the empty area below the lanes: the nearest lane is the bottom one → Video 1 for a video
  const below = await dragOver(page, "veo.mp4", audio.locator("xpath=.."), { x: audioBox.x + 60, y: audioBox.y + audioBox.height + 12 });
  expect(inside(below.box, mainBox)).toBe(true);
});

test("moving an overlay or audio clip shows a shadow on its lane; sound clips show their waveform", async ({ page }) => {
  // (tall enough that the audio lane is all in view)
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/editor");
  await upload(page, "veo.mp4");
  const main = page.getByTestId("lane-main");
  await expect(main.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "music.m4a");
  const audio = page.getByTestId("lane-audio").first();
  await expect(audio.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "site.png");
  const overlay = page.getByTestId("lane-overlay").first();
  await expect(overlay.getByTestId("timeline-clip")).toHaveCount(1);

  // the sound clip's waveform (made in the browser from the local file)
  const wave = audio.getByTestId("clip-wave");
  await expect(wave).toHaveCount(1);
  await expect.poll(async () => (await wavesOf(page)).every((x) => x.loads), { timeout: 20_000 }).toBe(true);

  // drag the picture along its overlay: a shadow on that lane, the picture lands there on release
  const pic = overlay.getByTestId("timeline-clip").first();
  const pb = (await pic.boundingBox())!;
  const ob = (await overlay.boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width / 2 + 150, pb.y + pb.height / 2, { steps: 10 });
  const shadow = page.getByTestId("drop-shadow");
  await expect(shadow).toBeVisible();
  const sb = (await shadow.boundingBox())!;
  expect(sb.y >= ob.y - 1 && sb.y + sb.height <= ob.y + ob.height + 1).toBe(true);
  await page.mouse.up();
  await expect(shadow).toHaveCount(0);
  await expect.poll(async () => (await overlay.getByTestId("timeline-clip").first().boundingBox())!.x).toBeGreaterThan(pb.x + 100);

  // the sound clip dragged up over the picture lanes: its shadow stays on the audio lane
  const snd = audio.getByTestId("timeline-clip").first();
  const sdb = (await snd.boundingBox())!;
  const ab = (await audio.boundingBox())!;
  // (from its middle: its ends are the trim handles)
  await page.mouse.move(sdb.x + sdb.width / 2, sdb.y + sdb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sdb.x + sdb.width / 2 + 40, ob.y + ob.height / 2, { steps: 10 });
  await expect(shadow).toBeVisible();
  const s2 = (await shadow.boundingBox())!;
  expect(s2.y >= ab.y - 1 && s2.y + s2.height <= ab.y + ab.height + 1).toBe(true);
  await page.mouse.up();
});

test("the timeline toolbar has the color picker: on the selected video it starts picking, again cancels", async ({ page }) => {
  await page.goto("/editor");
  await upload(page, "veo.mp4");
  const clip = page.getByTestId("lane-main").getByTestId("timeline-clip").first();
  await expect(clip).toHaveCount(1);
  const tool = page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Pick key color" });
  await clip.click();
  await expect(tool).toBeEnabled();
  await tool.click();
  await expect(page.getByRole("button", { name: "Cancel picking" }).first()).toBeVisible();
  await tool.click();
  await expect(page.getByRole("button", { name: "Cancel picking" })).toHaveCount(0);
});

test("the preview's drop outline goes away when the drag ends anywhere else", async ({ page }) => {
  await page.goto("/editor");
  const preview = page.getByRole("region", { name: "Preview" });
  const empty = page.getByTestId("empty-preview");
  await expect(empty).toBeVisible();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await empty.dispatchEvent("dragenter", { dataTransfer: dt });
  await expect(preview).toHaveClass(/ring-primary/);
  // dropped somewhere else (the timeline stops the drop from reaching the preview)
  await page.evaluate((d) => document.body.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: d })), dt);
  await expect(preview).not.toHaveClass(/ring-primary/);
  // moving over a button inside the preview keeps it; leaving the preview takes it away
  await empty.dispatchEvent("dragenter", { dataTransfer: dt });
  await expect(preview).toHaveClass(/ring-primary/);
  await page.evaluate((d) => {
    const btn = document.querySelector("[data-testid='empty-preview'] button")!;
    btn.dispatchEvent(new DragEvent("dragleave", { bubbles: true, dataTransfer: d, relatedTarget: btn.parentElement }));
  }, dt);
  await expect(preview).toHaveClass(/ring-primary/);
  await page.evaluate((d) => {
    const btn = document.querySelector("[data-testid='empty-preview'] button")!;
    btn.dispatchEvent(new DragEvent("dragleave", { bubbles: true, dataTransfer: d, relatedTarget: document.body }));
  }, dt);
  await expect(preview).not.toHaveClass(/ring-primary/);
});

/** Each sound clip on the audio lanes shows a waveform: bars drawn from its sound (or the server's picture, loaded). */
async function wavesOf(page: Page) {
  return page.evaluate(async () => {
    const clips = [...document.querySelectorAll<HTMLElement>("[data-testid='lane-audio'] [data-testid='timeline-clip']")];
    return Promise.all(
      clips.map(async (c) => {
        const w = c.querySelector<HTMLElement>("[data-testid='clip-wave']");
        let loads = false;
        if (w instanceof HTMLCanvasElement) {
          const d = w.getContext("2d")!.getImageData(0, 0, w.width, w.height).data;
          let on = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) on++;
          loads = on > 50;
        } else if (w) {
          const url = /url\("?([^")]+)"?\)/.exec(getComputedStyle(w).webkitMaskImage || getComputedStyle(w).maskImage)?.[1];
          loads = url
            ? await new Promise<boolean>((r) => {
                const i = new Image();
                i.onload = () => r(i.naturalWidth > 0);
                i.onerror = () => r(false);
                i.src = url;
              })
            : false;
        }
        return { title: c.getAttribute("title"), wave: w?.tagName ?? null, loads };
      }),
    );
  });
}

test("every sound clip shows its waveform: an upload, a mic recording, a sound effect, and after a reload", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto("/editor");
  const sounds = page.getByTestId("lane-audio").getByTestId("timeline-clip");
  await upload(page, "music.m4a");
  await expect(sounds).toHaveCount(1);
  await expect.poll(async () => (await wavesOf(page)).every((w) => w.loads), { timeout: 20_000 }).toBe(true);

  // a mic recording
  await page.getByRole("button", { name: "Record Voice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record" });
  await dialog.getByRole("button", { name: "Turn on microphone" }).click();
  await dialog.getByTestId("record-start").click();
  await expect(dialog.getByTestId("record-timer")).toContainText("REC", { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await dialog.getByTestId("record-stop").click();
  await dialog.getByTestId("record-add").click();
  await expect(dialog).toBeHidden({ timeout: 90_000 });
  await expect(sounds).toHaveCount(2);

  // a sound effect from the library
  await page.getByRole("navigation", { name: "Panels" }).getByRole("button", { name: "Audio", exact: true }).click();
  const lib = page.getByTestId("audio-library");
  await lib.getByRole("tab", { name: "Sound FX" }).click();
  await lib.getByRole("button", { name: "Add Whoosh at the playhead" }).click({ timeout: 60_000 });
  await expect(sounds).toHaveCount(3, { timeout: 20_000 });

  await page.waitForTimeout(3000);
  const now = await wavesOf(page);
  // after a reload (the files come back from the browser's storage)
  await page.reload();
  await expect(sounds.first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4000);
  const after = await wavesOf(page);
  expect(now.every((w) => w.loads)).toBe(true);
  expect(after.every((w) => w.loads)).toBe(true);
  // (pictures to look at: the sound lanes in both themes)
  const tl = page.getByRole("region", { name: "Timeline" });
  await tl.screenshot({ path: "test-results/waves-a.png" });
  await page.getByTestId("theme-cycle").click();
  await page.waitForTimeout(500);
  await tl.screenshot({ path: "test-results/waves-b.png" });
});
