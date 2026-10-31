import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";

const FIX = join(__dirname, ".fixtures");
const shared: { url?: string; jobId?: string } = {};

async function upload(page: Page, file = "veo.mp4") {
  await page.getByTestId("file-input").setInputFiles(join(FIX, file));
}

/** The bytes of an export's download link: a browser export is a blob: URL (only the page can read it), a server one an /api URL. */
async function downloadBytes(page: Page, href: string): Promise<Buffer> {
  if (!href.startsWith("blob:")) {
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    return res.body();
  }
  const b64 = await page.evaluate(async (u) => {
    const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  return Buffer.from(b64, "base64");
}

/** A saved project: projects are kept in this browser (IndexedDB, lib/storage/db), the server only knows synced ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function savedProject(page: Page, id: string | null): Promise<any> {
  const local = await page.evaluate(
    (pid) =>
      new Promise((resolve) => {
        const req = indexedDB.open("VDO_local_first_db");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const get = req.result.transaction("projects", "readonly").objectStore("projects").get(pid as string);
            get.onsuccess = () => resolve(get.result ?? null);
            get.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
      }),
    id,
  );
  if (local) return local;
  return (await page.request.get(`/api/projects/${id}`)).json();
}

/** The clip's Transform numbers (folded under "Advanced position & size" until opened). */
async function transformPanel(page: Page): Promise<Locator> {
  const panel = page.getByTestId("transform-panel");
  // (text and element cards keep it in their "Transform & Align" section)
  const outer = page.locator("summary", { hasText: /^Transform & Align/ });
  if (!(await panel.isVisible()) && (await outer.count())) await outer.first().click();
  if (!(await panel.evaluate((el) => (el as HTMLDetailsElement).open))) await panel.locator("summary").click();
  return panel;
}

/** Open a left panel: from the rail, or (panels that left the rail: Projects, Library, Background, Edit) from Search tools. */
async function openPanel(page: Page, name: string) {
  const rail = page.getByRole("navigation", { name: "Panels" }).getByRole("button", { name, exact: true });
  if (await rail.count()) return rail.click();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Search tools" });
  await palette.getByRole("combobox", { name: "Search tools" }).fill(`${name} panel`);
  await palette.getByRole("option", { name: new RegExp(`^${name} panel`) }).first().click();
}

/** New clips keep their background: open the color picker (clip view), then use the detected green. */
async function startPick(page: Page) {
  // (a new clip opens on its Adjust tab: the key color is on Cutout)
  const pick = page.getByRole("button", { name: "Pick key color from video" });
  if (!(await pick.isVisible()))
    await page.getByRole("tab", { name: "Cutout", exact: true }).click();
  await pick.click();
}
/** The clip inspector's tab (Adjust · Cutout · Color · Audio · Speed · More). */
async function inspTab(
  page: Page,
  name: "Adjust" | "Cutout" | "Color" | "Audio" | "Speed" | "More",
) {
  await page.getByRole("tab", { name, exact: true }).click();
}
/** Select the first Video 1 clip (after opening a project nothing is selected; a click before the page is ready does nothing, so retry). */
async function selectFirstVideo(page: Page) {
  await expect(async () => {
    await page
      .getByTestId("lane-main")
      .getByTestId("timeline-clip")
      .first()
      .click();
    await expect(page.getByRole("region", { name: "Clip" })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
}
/** Unfold the Cutout tab's "Fine-tune" (presets, edges, spill). */
async function fineTune(page: Page) {
  const d = page.getByTestId("fine-tune");
  if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open)))
    await d.locator("summary").click();
}
/** Export & Share → pick a file format (MP4 is the default). */
async function pickFormat(dialog: Locator, name: RegExp | string) {
  await dialog
    .getByTestId("export-formats")
    .getByRole("radio", { name })
    .check();
}
async function useDetectedGreen(page: Page) {
  await startPick(page);
  await page.getByRole("button", { name: /Use detected green/ }).click();
}

/** Select nothing (→ Project card): Esc from the preview (an empty lane can be scrolled out of the timeline). */
async function deselect(page: Page) {
  await page.getByTestId("program-view").focus();
  await page.keyboard.press("Escape");
}

/** Alpha (0-255) at source pixel (x, y) of a canvas or img, read via a 2D canvas. */
async function alphaAt(page: Page, testId: string, x: number, y: number) {
  return page.getByTestId(testId).evaluate(
    (el, [px, py]) => {
      const src = el as HTMLCanvasElement | HTMLImageElement;
      const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
      const h =
        src instanceof HTMLImageElement ? src.naturalHeight : src.height;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(src, 0, 0);
      return ctx.getImageData(px, py, 1, 1).data[3];
    },
    [x, y],
  );
}

test.describe.serial("one-screen studio", () => {
  test("empty canvas is the upload box; upload opens the preview in place", async ({
    page,
  }) => {
    await page.goto("/");
    // the whole editor is visible before any upload, each area with its empty state
    await expect(
      page.getByRole("heading", { name: "No video loaded" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Videos up to 30 min · max 2 GB/),
    ).toBeVisible();
    await expect(page.getByTestId("assets-empty")).toContainText(
      "No media yet",
    );
    await expect(
      page.getByText("Drop media here to start editing"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record camera", exact: true }),
    ).toBeVisible();
    // one Export: the top bar button (there's no second Export & Share box)
    await expect(page.getByTestId("export-button")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Export & Share" }),
    ).toHaveCount(0);
    // nothing selected yet: the inspector shows the project
    await expect(page.getByRole("region", { name: "Project" })).toBeVisible();
    await openPanel(page, "Projects");
    await expect(page.getByTestId("projects-empty")).toContainText(
      "No projects yet",
    );
    await page
      .getByRole("navigation", { name: "Panels" })
      .getByRole("button", { name: "Media" })
      .click();
    await upload(page);
    // the new clip plays in the program view with its background kept
    await expect(page.getByTestId("program-caption")).toBeVisible();
    // (removal is on the clip's Cutout tab; a new clip opens on Adjust)
    await inspTab(page, "Cutout");
    await expect(page.getByTestId("remove-found")).toBeVisible();
    // a project is made for the new video and saved
    await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/);
    await expect(page.getByTestId("save-state")).toHaveText("✓ Saved");
    await expect(
      page.getByRole("textbox", { name: "Project name" }),
    ).toHaveValue("veo");
    await inspTab(page, "More");
    await page.locator("summary", { hasText: "Video info" }).click();
    const card = page.getByRole("region", { name: "Video info" });
    await expect(card).toContainText("1280 × 720");
    // (a browser can't read the frame rate: it says so until the file is read on the server)
    await expect(card).toContainText(/Frame rate(24 fps|Not known yet)/);
    await expect(card).toContainText("0:04");
    await expect(card).toContainText("Yes (sound detected)");
    await expect(page.getByRole("button", { name: "Add media" })).toBeVisible();
  });

  test("pick → full removed view, compare, split, undo, export, final file, change video", async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page);
    // the clip keeps its background until you ask: the removal card offers it
    await expect(page.getByTestId("remove-found")).toBeVisible();
    await startPick(page);
    await expect(page.getByRole("radio", { name: "Original" })).toBeChecked();
    await expect(
      page.getByRole("button", { name: /Background: Checkerboard/ }),
    ).toBeVisible();
    await expect(page.getByText("Click to pick color")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Use detected green/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Play" })).toBeEnabled({
      timeout: 15_000,
    });

    // magnifier, then a click on the green → the FULL removed view (not split)
    const stage = page.getByTestId("preview-stage");
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.2);
    await expect(page.getByText("click to remove")).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.08, box.y + box.height * 0.2);
    await expect(page.getByRole("radio", { name: "Result" })).toBeChecked();
    await expect(
      page.getByRole("slider", { name: "Split between original and removed" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("exact-frame")).toBeVisible();
    await expect(page.getByTestId("preview-caption")).toContainText(
      "Exact frame",
    );

    // live GPU layer agrees with the exact FFmpeg frame
    for (const [x, y, solid] of [
      [100, 100, false],
      [640, 250, true],
    ] as const) {
      const live = await alphaAt(page, "live-canvas", x, y);
      const exact = await alphaAt(page, "exact-frame", x, y);
      expect(Math.abs(live - exact), `alpha at ${x},${y}`).toBeLessThanOrEqual(
        12,
      );
      if (solid) expect(exact).toBeGreaterThan(245);
      else expect(exact).toBeLessThan(10);
    }

    // hold to compare shows the original while held
    const hold = page.getByRole("button", { name: "Hold to compare" });
    await hold.hover();
    await page.mouse.down();
    await expect(page.getByTestId("preview-caption")).toContainText(
      "Original (release to go back)",
    );
    await page.mouse.up();
    await expect(page.getByTestId("preview-caption")).toContainText(
      "Exact frame",
    );

    // split view with a draggable line
    await page
      .getByRole("radio", { name: "Before / After" })
      .check({ force: true });
    const splitBox = (await stage.boundingBox())!;
    const handle = page.getByRole("slider", {
      name: "Split between original and removed",
    });
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      splitBox.x + splitBox.width * 0.3,
      hb.y + hb.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "30");
    await page.getByRole("radio", { name: "Result" }).check({ force: true });

    // play → live; pause → exact
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByTestId("preview-caption")).toContainText(
      "Live preview",
    );
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByTestId("preview-caption")).toContainText(
      "Exact frame",
    );

    // one exact-frame request per pause in slider movement
    await fineTune(page);
    const previews: string[] = [];
    page.on(
      "request",
      (r) => r.url().includes("/preview") && previews.push(r.url()),
    );
    await page.getByRole("slider", { name: "Edge softness" }).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
    expect(previews.length).toBe(1);

    // undo brings the slider back; redo re-applies it
    const soft = page.getByRole("textbox", { name: "Edge softness" });
    await expect(soft).toHaveValue("0.18");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(soft).toHaveValue("0.15");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(soft).toHaveValue("0.18");
    await page.getByRole("button", { name: "Undo" }).click();

    // see-through warning
    await page.getByRole("textbox", { name: "Green removal" }).fill("0.2");
    await page.getByRole("textbox", { name: "Green removal" }).press("Enter");
    await soft.fill("0.25");
    await soft.press("Enter");
    await expect(
      page.getByText("Parts of the person are turning see-through"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reset to recommended" }).click();
    await expect(
      page.getByText("Parts of the person are turning see-through"),
    ).toBeHidden();

    // the inspector scrolls on its own; the canvas stays put
    const inspector = page
      .getByRole("complementary", { name: "Inspector" })
      .getByTestId("inspector-scroll");
    const before = (await stage.boundingBox())!.y;
    await inspector.evaluate((el) => el.scrollTo(0, 600));
    expect(await inspector.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    expect((await stage.boundingBox())!.y).toBe(before);

    // no removed controls anywhere
    await expect(
      page.getByText(/CRF|bitrate|Green Shade Tolerance|Edge Cleanup/i),
    ).toHaveCount(0);

    // export (survives a reload) → the Export & Share dialog shows the files; the final file plays in the preview
    await page.getByTestId("export-button").click();
    const dialog = page.getByRole("dialog", { name: "Export & Share" });
    // MP4 is the recommended default; the see-through website pack is one of the formats
    await expect(
      dialog
        .getByTestId("export-formats")
        .getByRole("radio", { name: /MP4 \(H\.264\)/ }),
    ).toBeChecked();
    await pickFormat(dialog, /Website pack/);
    await expect(
      dialog.getByText("For Safari, iPhone, iPad (.mov)"),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Make transparent video" })
      .click();
    await expect(page.getByTestId("export-button")).toContainText(
      /Exporting|Export ✓/,
    );
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByTestId("export-button")).toContainText("Export ✓", {
      timeout: 120_000,
    });
    if (!(await dialog.isVisible()))
      await page.getByTestId("export-button").click();
    await expect(
      dialog.getByText("Your transparent video is ready"),
    ).toBeVisible();
    shared.url = page.url();
    const zipHref = (await dialog
      .getByRole("link", { name: /Download website files/ })
      .getAttribute("href"))!;
    shared.jobId = zipHref.split("/")[3];
    await expect(
      dialog.getByText(/avatar-safari\.mov · \d+ KB · HEVC \+ transparency/),
    ).toBeVisible();
    const code = dialog.getByLabel("Embed code text");
    await expect(code).toContainText("playsinline");
    await expect(code).toContainText("/videos/avatar-safari.mov");
    const range = await page.request.get(
      `/api/files/${shared.jobId}/avatar-safari.mov`,
      { headers: { Range: "bytes=0-99" } },
    );
    expect(range.status()).toBe(206);
    await dialog
      .getByRole("button", { name: "Play the final file in the preview" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("radio", { name: "Final file" })).toBeChecked();
    await expect(page.getByTestId("final-video")).toHaveAttribute(
      "src",
      /avatar\.webm$/,
    );
    // the top Export opens the finished files with the download
    await page.getByTestId("export-button").click();
    await expect(
      page
        .getByRole("dialog", { name: "Export & Share" })
        .getByRole("link", { name: /Download website files/ }),
    ).toHaveAttribute("href", /\.zip\?download=1$/);
    await page.keyboard.press("Escape");

    // add media: a second clip on the timeline, same project, export cleared
    const firstUrl = page.url();
    // (Add media opens Import: My computer → Choose files opens the file picker)
    await page.getByRole("button", { name: "Add media" }).click();
    const imp = page.getByRole("dialog", { name: "Import" });
    await expect(imp.getByRole("tab", { name: "My computer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      imp.getByRole("button", { name: "Choose files" }).click(),
    ]);
    await chooser.setFiles(join(FIX, "grey.mp4"));
    await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
    await expect(page).toHaveURL(firstUrl);
    await expect(page.getByTestId("export-button")).toHaveText("Export");
  });
});

/** Draw the playing avatar into a canvas and read the corner pixel's alpha. */
async function cornerAlpha(page: Page) {
  return page.evaluate(async () => {
    const v = document.getElementById("VDO-avatar") as HTMLVideoElement;
    if (v.readyState < 2)
      await new Promise((r) =>
        v.addEventListener("loadeddata", r, { once: true }),
      );
    await new Promise((r) => setTimeout(r, 300));
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0);
    return { corner: ctx.getImageData(2, 2, 1, 1).data[3], src: v.currentSrc };
  });
}

test.afterAll(async () => {
  if (shared.jobId)
    (await import("node:fs")).writeFileSync(
      join(FIX, "last-job.txt"),
      shared.jobId,
    );
});

test("test page: Chrome picks the WebM and it is transparent", async ({
  page,
}) => {
  test.skip(!shared.jobId, "needs the studio flow");
  await page.goto(`/test/${shared.jobId}`);
  await expect(
    page.getByText("This browser is using: Chrome file (.webm)"),
  ).toBeVisible();
  const r = await cornerAlpha(page);
  expect(r.src).toContain("avatar.webm");
  expect(r.corner).toBeLessThan(10);
});

test("test page: WebKit picks the HEVC MOV and it is transparent @webkit @webkit-only", async ({
  page,
}) => {
  const fs = await import("node:fs");
  const id = fs.existsSync(join(FIX, "last-job.txt"))
    ? fs.readFileSync(join(FIX, "last-job.txt"), "utf8").trim()
    : null;
  test.skip(!id, "run the chromium project first");
  await page.goto(`/test/${id}`);
  await expect(
    page.getByText("This browser is using: Safari file (.mov)"),
  ).toBeVisible();
  const r = await cornerAlpha(page);
  expect(r.src).toContain("avatar-safari.mov");
  expect(r.corner).toBeLessThan(10);
});

test("old results/edit links open in the studio, in a project", async ({
  page,
}) => {
  test.skip(!shared.jobId, "needs the studio flow");
  await page.goto(`/results/${shared.jobId}`);
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("export-button")).toContainText("Export ✓");
  await page.reload();
  await page.getByTestId("export-button").click();
  await expect(page.getByText("Your transparent video is ready")).toBeVisible();
});

test("upload errors are shown in the canvas", async ({ page }) => {
  await page.goto("/");
  await upload(page, "fake.mp4");
  await expect(
    page.getByRole("alert").filter({ hasText: "This video can't be used" }),
  ).toBeVisible();
});

test("no horizontal scrolling at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const url of ["/", ...(shared.url ? [shared.url] : [])]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over, url).toBeLessThanOrEqual(0);
  }
});

test("full screen fits and centers the picture", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(
    page.getByRole("button", { name: "Exit full screen" }),
  ).toBeVisible();
  const b = (await page.getByTestId("preview-stage").boundingBox())!;
  const bar = (await page
    .getByRole("group", { name: "Video controls" })
    .boundingBox())!;
  expect(Math.round(b.width)).toBe(1024);
  expect(Math.abs(b.y - (bar.y - b.y - b.height))).toBeLessThanOrEqual(1); // equal space above and below, over the control bar
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
});

test("clicking the logo starts over with default settings", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await fineTune(page);
  const soft = page.getByRole("textbox", { name: "Edge softness" });
  await soft.fill("0.22");
  await soft.press("Enter");
  await page.evaluate(() =>
    localStorage.setItem("VDO:v2:last", JSON.stringify({ remembered: true })),
  );

  await page.getByRole("link", { name: /ViPlay Studio/ }).click();
  await expect(
    page.getByRole("heading", { name: "No video loaded" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("VDO:v2:last")),
  ).toBeNull();

  // a new upload starts from the defaults again
  await upload(page);
  // (removal starts off, so its settings are locked: just read the default)
  await expect(
    page.getByRole("textbox", { name: "Edge softness", includeHidden: true }),
  ).toHaveValue("0.15");
});

test("background removal can be switched off and on", async ({ page }) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  const sw = page.getByRole("switch", { name: "Background removal" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("preview-caption")).toContainText(
    "Background removal is off",
  );
  // MP4 (the default) never needs background removal; only the see-through formats do
  await page.getByTestId("export-button").click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Make video (MP4)" }),
  ).not.toHaveAttribute("aria-disabled", "true");
  await expect(
    page
      .getByRole("dialog")
      .getByTestId("export-formats"),
  ).toContainText("Turn on Background removal");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("switch", { name: "Background removal" }).click();
  await expect(page.getByTestId("preview-caption")).not.toContainText(
    "Background removal is off",
  );
});

test("one preview: Result and Original (no side by side), and picking works on the result", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await expect(page.getByRole("radio", { name: "Side by side" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("radio", { name: "Result" })).toBeChecked();
  const stage = page.getByTestId("preview-stage");
  const b = (await stage.boundingBox())!;
  expect(b.width / b.height).toBeCloseTo(1280 / 720, 1);
  // (a file kept on this computer shows the result live on the GPU; the server's exact frame is for uploaded ones)
  const result = page.getByTestId("live-canvas");
  await expect(result).toBeVisible();
  const img = (await result.boundingBox())!;
  expect(Math.abs(img.x - b.x)).toBeLessThan(2); // the result fills the preview
  await page.getByRole("radio", { name: "Original" }).check({ force: true });
  await expect(page.getByTestId("preview-caption")).toContainText(
    "Original video",
  );
  await page.getByRole("radio", { name: "Result" }).check({ force: true });
  // pick the green (8% / 20% of the frame)
  await startPick(page);
  await page.mouse.click(b.x + b.width * 0.08, b.y + b.height * 0.2);
  await expect(
    page.getByText("This spot looks like part of the person"),
  ).toHaveCount(0);
  await expect(
    // (picked from the frame itself: a file in this browser gives its own green, the server's copy a lighter one)
    page.getByText(/Removing #[0-9A-F]{6} \(picked\)/),
  ).toBeVisible();
});

test("an image can be used as the preview background (preview only)", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  // the preview background lives in a small popover in the preview toolbar
  await page.getByRole("button", { name: /Background: Checkerboard/ }).click();
  await page
    .getByTestId("bg-image-input")
    .first()
    .setInputFiles(join(FIX, "site.png"));
  await expect(
    page.getByRole("radio", { name: "Image" }).first(),
  ).toBeChecked();
  await expect(
    page.getByText("site.png · preview only, not exported").first(),
  ).toBeVisible();
  const bgImage = await page
    .getByTestId("preview-stage")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bgImage).toContain("blob:");
});

test("crop empty area shows the box and the new size; export shows an estimated size", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  // output settings are in the Export dialog
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await pickFormat(dialog, /Website pack/);
  await dialog
    .getByRole("switch", { name: "Crop empty area around the person" })
    .click();
  await expect(dialog.getByTestId("crop-size")).toContainText(
    /New size: \d+ × \d+ \(was 1280 × 720\)/,
    { timeout: 30_000 },
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crop-box")).toBeVisible();
  await page.getByTestId("export-button").click();
  await expect(page.getByTestId("size-estimate")).toContainText(
    /Estimated size: WebM ~\d+ [KM]B · Safari MOV ~\d+ [KM]B/,
    { timeout: 60_000 },
  );
  await expect(page.getByTestId("export-summary")).toContainText(
    /\d+ × \d+ \(cropped\)/,
  );
});

test("a fire-on-black clip starts in Black background mode and the black turns see-through", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "fire.mp4");
  await inspTab(page, "Cutout");
  // it keeps its background until you say "Remove it" (then the Black background button is the pressed one)
  await expect(
    page.getByRole("switch", { name: "Background removal" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Black background found")).toBeVisible();
  await page.getByTestId("remove-found").click();
  await expect(
    page.getByRole("switch", { name: "Background removal" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("button", { name: "Black background", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("radio", { name: "This clip" }).check({ force: true });
  await expect(
    page.getByRole("switch", { name: "Keep glow brightness" }),
  ).toHaveAttribute("aria-checked", "true");
  // (a file kept on this computer shows the result live on the GPU)
  await expect(page.getByTestId("live-canvas")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => alphaAt(page, "live-canvas", 20, 20))
    .toBeLessThan(10);
  // switching to green mode: an info icon says this clip needs Black background (its tip on hover), a click switches back
  await page
    .getByRole("button", { name: "Green / blue screen", exact: true })
    .click();
  const hint = page.getByRole("button", {
    name: /This clip has a black background/,
  });
  await hint.hover();
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: "This clip has a black background" }),
  ).toBeVisible();
  await hint.click();
  await expect(
    page.getByRole("button", { name: "Black background", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("slider", { name: "Dark removal" }),
  ).toBeVisible();
});

test("a clip without a green screen says so (a warning icon with its tip, next to the background type)", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await inspTab(page, "Cutout");
  const hint = page.getByTestId("no-key-hint");
  await expect(hint).toHaveAccessibleName(
    "No green or blue background found: use AI Removal",
  );
  await hint.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "No green or blue screen" }),
  ).toBeVisible();
});

test("background type: clicking the already-highlighted type switches removal on", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await inspTab(page, "Cutout");
  const sw = page.getByRole("switch", { name: "Background removal" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  const green = page.getByRole("button", {
    name: "Green / blue screen",
    exact: true,
  });
  await expect(green).toHaveAttribute("aria-pressed", "false");
  await green.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(green).toHaveAttribute("aria-pressed", "true");
});

test("Reset: the ↺ menu in the Clip header resets a tab or everything, and nothing moves when a change appears", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  const insp = page.getByTestId("clip-inspector");
  const resetBtn = insp.getByTestId("reset-menu-button");
  await expect(resetBtn).toHaveAccessibleName("Reset");
  // always there, dim until something changed
  await expect(resetBtn).toHaveAttribute("aria-disabled", "true");
  // the clip card reaches (at least) the bottom of the right column, even on a short tab
  await inspTab(page, "Speed");
  const col = await page.getByTestId("inspector-scroll").boundingBox();
  const card = await insp.boundingBox();
  expect(card!.y + card!.height).toBeGreaterThan(col!.y + col!.height - 3);
  // green removal on → the Cutout tab has a dot; the settings don't move
  await inspTab(page, "Cutout");
  const sw = page.getByRole("switch", { name: "Background removal" });
  const y0 = (await sw.boundingBox())!.y;
  await page
    .getByRole("button", { name: "Green / blue screen", exact: true })
    .click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(
    page
      .getByRole("tab", { name: "Cutout", exact: true })
      .getByTestId("tab-changed"),
  ).toBeVisible();
  expect(Math.abs((await sw.boundingBox())!.y - y0)).toBeLessThan(1);
  await expect(resetBtn).not.toHaveAttribute("aria-disabled", "true");
  await resetBtn.click();
  const menu = page.getByRole("menu", { name: "Reset" });
  await menu.getByRole("menuitem", { name: "Reset Cutout" }).click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("tab-changed")).toHaveCount(0);
  await expect(resetBtn).toHaveAttribute("aria-disabled", "true");
  // Undo brings it back
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  // a change on another tab too, then Reset all
  await inspTab(page, "Audio");
  const vol = page.getByRole("textbox", { name: "Volume" });
  await vol.fill("40");
  await vol.press("Enter");
  await expect(page.getByTestId("tab-changed")).toHaveCount(2);
  await resetBtn.click();
  // clicking ↺ again closes the menu
  await resetBtn.click();
  await expect(menu).toHaveCount(0);
  await resetBtn.click();
  await menu.getByRole("menuitem", { name: "Reset all" }).click();
  await expect(page.getByTestId("tab-changed")).toHaveCount(0);
  await expect(vol).toHaveValue("100");
  await inspTab(page, "Cutout");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  // the clip is still on the timeline
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
});

test("effects mode turns off the see-through warning", async ({ page }) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await expect(
    page.getByRole("radio", { name: "Person or object" }),
  ).toBeChecked();
  await fineTune(page);
  await page.getByRole("textbox", { name: "Green removal" }).fill("0.2");
  await page.getByRole("textbox", { name: "Green removal" }).press("Enter");
  const soft = page.getByRole("textbox", { name: "Edge softness" });
  await soft.fill("0.25");
  await soft.press("Enter");
  await expect(
    page.getByText("Parts of the person are turning see-through"),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "This is an effects clip (smoke, fire, sparks)",
    })
    .click();
  await expect(
    page.getByRole("radio", { name: "Effects (smoke, fire, sparks)" }),
  ).toBeChecked();
  await expect(
    page.getByText("Parts of the person are turning see-through"),
  ).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("radio", { name: "Person or object" }),
  ).toBeChecked();
});

test("projects save automatically, can be renamed, reopened and deleted", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await expect(page).toHaveURL(/\?p=/);
  const url = page.url();
  await fineTune(page);
  const soft = page.getByRole("textbox", { name: "Edge softness" });
  await soft.fill("0.21");
  await soft.press("Enter");
  const name = page.getByRole("textbox", { name: "Project name" });
  await name.fill("News anchor intro");
  await name.press("Enter");
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "News anchor intro",
  );
  // (after opening a project nothing is selected: the clip's settings show once it's clicked)
  await selectFirstVideo(page);
  await inspTab(page, "Cutout");
  await expect(
    page.getByRole("textbox", { name: "Edge softness", includeHidden: true }),
  ).toHaveValue("0.21");

  // New project → empty editor; the old one is in Projects and opens again
  await openPanel(page, "Projects");
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(
    page.getByRole("heading", { name: "No video loaded" }),
  ).toBeVisible();
  await openPanel(page, "Projects");
  await page.getByRole("button", { name: "Open News anchor intro" }).click();
  await expect(page).toHaveURL(url);
  await selectFirstVideo(page);
  await inspTab(page, "Cutout");
  await expect(
    page.getByRole("textbox", { name: "Edge softness", includeHidden: true }),
  ).toHaveValue("0.21");

  // removing a video a project uses says which project (it only leaves My Assets); cancelled here
  const media = page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Media" });
  if ((await media.getAttribute("aria-pressed")) !== "true")
    await media.click();
  await page.getByRole("button", { name: "Options for veo.mp4" }).first().click();
  await page.getByRole("menuitem", { name: "Delete veo.mp4" }).click();
  const ask = page.getByRole("dialog", { name: "Remove Asset" });
  await expect(ask).toContainText("News anchor intro");
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();

  // delete the project (the editor empties because it was open)
  await openPanel(page, "Projects");
  await page.getByRole("button", { name: "Options for News anchor intro" }).first().click();
  await page.getByRole("menuitem", { name: "Delete News anchor intro" }).click();
  await page
    .getByRole("dialog", { name: "Delete Project" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No video loaded" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open News anchor intro" }),
  ).toHaveCount(0);
  // (projects are kept in this browser: a link to one that's gone says it isn't here)
  await page.goto(url);
  await expect(page.getByText(/That project isn't saved in this browser/)).toBeVisible();
});

test("My Assets: + adds to the timeline; pictures and music get their own tracks; all saved", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  // thumbnails; one click only selects, the + button (or a double-click) adds it again (at the end of Video 1)
  const grey = page
    .getByRole("button", { name: "grey.mp4", exact: true })
    .first();
  const thumbOk = await grey
    .locator("img")
    .evaluate(async (img: HTMLImageElement) => {
      if (!img.complete)
        await new Promise((r) =>
          img.addEventListener("load", r, { once: true }),
        );
      return img.naturalWidth;
    });
  expect(thumbOk).toBe(320);
  // click selects, a second click (or Esc, or a click outside the files) unselects
  await grey.click();
  await expect(grey).toHaveAttribute("aria-pressed", "true");
  await grey.click();
  await expect(grey).toHaveAttribute("aria-pressed", "false");
  await grey.click();
  await grey.press("Escape");
  await expect(grey).toHaveAttribute("aria-pressed", "false");
  await grey.click();
  // a click on the panel next to the files (here: the "My Assets" heading) unselects
  await page.getByRole("heading", { name: "My Assets" }).click();
  await expect(grey).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Add grey.mp4 to the timeline" })
    .first()
    .click();
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(3);
  await expect(page.getByTestId("timeline-length")).toHaveText(
    "0:08.0 · 3 clips",
  );
  // a picture goes on an overlay track, music on an audio track
  await upload(page, "site.png");
  await expect(
    page.locator('[data-testid="lane-overlay"] [data-type="image"]'),
  ).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Picture" })).toBeVisible();
  await upload(page, "music.m4a");
  await expect(
    page.locator('[data-testid="lane-audio"] [data-type="audio"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("switch", { name: "Quieter while someone speaks" }),
  ).toBeVisible();
  // the program preview plays the whole timeline
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  await expect(page.getByTestId("program-caption")).toContainText(
    /Program\s*·?\s*1280 × 720/,
  );
  // everything is saved with the project
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved");
  await page.reload();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(5);
});

test("Export ▾ menu, Help dialog and the timeline", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No video loaded" }),
  ).toBeVisible();
  // help opens with ? and closes with Esc
  await page.keyboard.press("Shift+Slash");
  const help = page.getByRole("dialog", { name: "Help & keyboard shortcuts" });
  await expect(help).toBeVisible();
  await expect(help.getByText("Compare with the original video")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();

  await upload(page);
  await useDetectedGreen(page);
  // the menu: arrow keys move, Esc closes and returns focus
  await page
    .getByRole("button", { name: "Export options", exact: true })
    .click();
  const menu = page.getByRole("menu", { name: "Export options" });
  // MP4 at the project size (recommended, first) + 4 video sizes + 2 website packs + "All formats…"
  await expect(menu.getByRole("menuitem")).toHaveCount(8);
  await expect(menu.getByRole("menuitem").first()).toContainText(
    "MP4 · project size",
  );
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Export options", exact: true }),
  ).toBeFocused();
  // "All formats & settings…" opens the dialog
  await page
    .getByRole("button", { name: "Export options", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /All formats/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Export & Share" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // the timeline shows the clip and moves the playhead
  await expect(page.getByTestId("timeline-clip")).toContainText("veo.mp4");
  const ruler = page.getByRole("slider", { name: "Timeline position" });
  const rb = (await ruler.boundingBox())!;
  const cb0 = (await page.getByTestId("timeline-clip").first().boundingBox())!;
  await page.mouse.click(cb0.x + cb0.width * 0.75, rb.y + rb.height / 2);
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).not.toHaveValue("0");
  await expect(ruler).not.toHaveAttribute("aria-valuenow", "0");
  // a quick preset starts the export right away
  await page
    .getByRole("button", { name: "Export options", exact: true })
    .click();
  await page
    .getByRole("menu", { name: "Export options" })
    .getByRole("menuitem")
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Export & Share" }),
  ).toBeVisible();
  await expect(page.getByTestId("export-button")).toContainText(
    /Exporting|Export ✓/,
  );
});

test("AI Removal cuts out the subject of a clip without a green screen", async ({
  page,
}) => {
  test.skip(process.platform !== "darwin", "AI Removal uses Apple Vision");
  await page.goto("/");
  await upload(page, "grey.mp4");
  await page.getByRole("button", { name: /use AI Removal/ }).click();
  await expect(page.getByRole("radio", { name: "AI Removal" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Result" })).toBeChecked();
  // the synthetic clip has an object, not a person
  await page.getByRole("radio", { name: "Main object" }).check({ force: true });
  await expect(page.getByTestId("ai-status")).toContainText(
    "Subject found in every frame",
    { timeout: 120_000 },
  );
  await expect(page.getByTestId("exact-frame")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => alphaAt(page, "exact-frame", 20, 20))
    .toBeLessThan(10);
  // the ellipse at t=0: x ≈ 430+210 = 640, y ≈ 360
  await expect
    .poll(() => alphaAt(page, "exact-frame", 640, 360))
    .toBeGreaterThan(240);
  // export: the job has an AI step and the file is transparent
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await pickFormat(dialog, /Website pack/);
  await dialog.getByRole("button", { name: "Make transparent video" }).click();
  await expect(dialog.getByText("Your transparent video is ready")).toBeVisible(
    { timeout: 180_000 },
  );
});

test("timeline: split, cut and trim; the cuts are saved with the project", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled({
    timeout: 15_000,
  });
  const ruler = page.getByRole("slider", { name: "Timeline position" });
  const length = page.getByTestId("timeline-length");
  await expect(length).toHaveText("0:04.0");
  const rb = (await ruler.boundingBox())!;
  // the ruler goes on past the end (room to add clips): place clicks by the clip's own width
  const cb = (await page.getByTestId("timeline-clip").first().boundingBox())!;
  const at = (f: number) =>
    page.mouse.click(cb.x + cb.width * f, rb.y + rb.height / 2);

  // split at 1 s and 2 s (S key), then cut the middle part (Delete)
  await at(0.25);
  await page.keyboard.press("s");
  await at(0.5);
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await expect(length).toContainText("3 clips");
  await page.getByTestId("timeline-clip").nth(1).getByRole("button").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await expect(length).toHaveText("0:03.0 · 2 clips");
  // the player shows the timeline's length
  await expect(
    page.getByRole("slider", { name: "Video position" }),
  ).toHaveAttribute("aria-valuetext", /of 0:03$/);

  // undo brings the part back, redo cuts it again
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);

  // trim the end of the last part to the playhead (W): at 2.7 s (the scale stays: 1 s = a quarter of the first clip's width)
  await at(2.7 / 4);
  await page.keyboard.press("w");
  await expect(length).toHaveText("0:02.7 · 2 clips");

  // a trim handle moves by one frame with the arrow keys
  const endHandle = page
    .getByRole("slider", { name: "End of veo.mp4" })
    .first();
  const before = Number(await endHandle.getAttribute("aria-valuenow"));
  await endHandle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => Number(await endHandle.getAttribute("aria-valuenow")))
    .toBeLessThan(before);

  // saved with the project
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved");
  await page.reload();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);

  // locking Video 1 stops edits
  await page.getByRole("button", { name: "Lock Video 1" }).click();
  await expect(
    page.getByRole("button", { name: "Split", exact: true }),
  ).toBeDisabled();
});

test("Remove silences cuts the pauses; right-click menu; the timeline can be made taller", async ({
  page,
}) => {
  // (the dialog marking its pauses must not draw the editor again and again)
  const loops: string[] = [];
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      /Maximum update depth/.test(m.text()) &&
      loops.push(m.text()),
  );
  await page.goto("/");
  await upload(page, "pauses.mp4");
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled({
    timeout: 15_000,
  });
  const length = page.getByTestId("timeline-length");
  await expect(length).toHaveText("0:04.0");

  // Remove silences: two pauses found, marked on the timeline, cut in one step
  await page.getByRole("button", { name: "Silences", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove silences" });
  await expect(dialog.getByTestId("silence-summary")).toContainText(
    "2 pauses",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("silence-mark")).toHaveCount(2);
  await page.waitForTimeout(500);
  expect(loops).toEqual([]);
  await dialog.getByRole("button", { name: "Cut 2 pauses" }).click();
  await expect(length).toHaveText(/^0:02\.\d · 3 clips$/);
  await expect(page.getByTestId("silence-mark")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(length).toHaveText("0:04.0");

  // right-click a part → Split here
  const clip = page.getByTestId("timeline-clip").first();
  const cb = (await clip.boundingBox())!;
  await page.mouse.click(cb.x + cb.width * 0.5, cb.y + cb.height / 2, {
    button: "right",
  });
  const menu = page.getByRole("menu", { name: "Clip" });
  await expect(
    menu.getByRole("menuitem", { name: /Split here/ }),
  ).toBeFocused();
  await menu.getByRole("menuitem", { name: /Split here/ }).click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);

  // drag bar / arrow keys make the timeline taller
  const resizer = page.getByTestId("timeline-resizer");
  const before = Number(await resizer.getAttribute("aria-valuenow"));
  await resizer.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(before + 48));
  const timeline = page.getByRole("region", { name: "Timeline" });
  expect(Math.round((await timeline.boundingBox())!.height)).toBe(before + 48);
});

test("two clips on a colored canvas export as one MP4", async ({ page }) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await upload(page, "pauses.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  // nothing selected → the Project card: canvas and background
  await deselect(page);
  const project = page.getByRole("region", { name: "Project" });
  await project.getByRole("radio", { name: "Color" }).check({ force: true });
  await expect(project).toContainText("Exports as a normal video (MP4)");
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  const href = (await dialog
    .getByRole("link", { name: /Download video \(MP4\)/ })
    .getAttribute("href"))!;
  const body = await downloadBytes(page, href);
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const file = join(FIX, "export-test.mp4");
  writeFileSync(file, body);
  const d = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );
  expect(d).toBeGreaterThan(5.9); // 2 s + 4 s
  expect(d).toBeLessThan(6.2);
});

test("text: a lower third shows on the preview, moves by dragging, and is in the MP4 @webkit", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text" })
    .click();
  await page.getByRole("button", { name: /^Add Lower third/ }).click();
  const text = page
    .getByRole("region", { name: "Text" })
    .getByRole("textbox", { name: "Text", exact: true });
  await text.fill("Asha Rao\nReporter");
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="text"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="text"]'),
  ).toContainText("Asha Rao");
  // the name bar (#1d4ed8) is drawn at the bottom left of the 1280×720 program
  const rgbAt = (x: number, y: number) =>
    page
      .getByTestId("program-canvas")
      .evaluate(
        (el, [px, py]) => [
          ...(el as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(px, py, 1, 1).data,
        ],
        [x, y],
      );
  await expect
    .poll(async () => (await rgbAt(80, 560))[2], { timeout: 10_000 })
    .toBeGreaterThan(180);
  // drag it right on the preview; undo puts it back in one step
  const sel = page.getByTestId("selection-box");
  const b0 = (await sel.boundingBox())!;
  await page.mouse.move(b0.x + 10, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b0.x + 70, b0.y + b0.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await sel.boundingBox())!.x - b0.x)
    .toBeGreaterThan(50);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => Math.abs((await sel.boundingBox())!.x - b0.x))
    .toBeLessThan(2);
  // a colored canvas → MP4, with the text drawn in
  await deselect(page);
  await page
    .getByRole("region", { name: "Project" })
    .getByRole("radio", { name: "Color" })
    .check({ force: true });
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  const href = (await dialog
    .getByRole("link", { name: /Download video \(MP4\)/ })
    .getAttribute("href"))!;
  const body = await downloadBytes(page, href);
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const file = join(FIX, "export-text.mp4");
  writeFileSync(file, body);
  const px = [
    ...execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "1",
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "crop=1:1:80:560,format=rgba",
      "-f",
      "rawvideo",
      "pipe:1",
    ]),
  ];
  expect(px[2]).toBeGreaterThan(170); // blue bar
  expect(px[0]).toBeLessThan(90);
  // the video is as long as the text (5 s), longer than the 2 s clip
  const d = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );
  expect(d).toBeGreaterThan(4.9);
});

test("program preview shows the right clip at every time, even with more than 40 cuts", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await upload(page, "yellow.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  await upload(page, "grey.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(3);
  const clips = page.getByTestId("lane-main").getByTestId("timeline-clip");
  const program = page
    .getByRole("region", { name: "Preview" })
    .getByLabel("Program preview. Space plays or pauses.");
  // cut the red clip (0–4 s) every 2 frames: 44 cuts → 47 clips
  await program.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 44; i++) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("s");
  }
  await expect(clips).toHaveCount(47);
  const rgbAt = async () =>
    page.getByTestId("program-canvas").evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return [
        ...c
          .getContext("2d")!
          .getImageData(
            Math.round(c.width * 0.08),
            Math.round(c.height * 0.1),
            1,
            1,
          ).data,
      ];
    });
  const colorAt = async () => {
    const [r, g, b] = await rgbAt();
    return r > 150 && g < 80 && b < 80
      ? "red"
      : r > 150 && g > 150 && b < 80
        ? "yellow"
        : Math.abs(r - 128) < 30 && Math.abs(g - 128) < 30
          ? "grey"
          : `other ${r},${g},${b}`;
  };
  // times: inside cut 5, inside cut 42 (after the 40th), the yellow clip, the grey clip
  const at = async (frames: number) => {
    await program.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < Math.floor(frames / 24); i++)
      await page.keyboard.press("Shift+ArrowRight");
    for (let i = 0; i < frames % 24; i++)
      await page.keyboard.press("ArrowRight");
  };
  for (const [frames, want] of [
    [11, "red"],
    [85, "red"],
    [93, "red"],
    [110, "yellow"],
    [150, "grey"],
    [30, "red"],
  ] as const) {
    await at(frames);
    await expect
      .poll(colorAt, { timeout: 10_000, message: `frame ${frames}` })
      .toBe(want);
  }
  // playing across the cuts and into the next files: never an empty (black) frame
  await at(60);
  await page.keyboard.press("Space");
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    seen.push(await colorAt());
    await page.waitForTimeout(60);
  }
  await page.keyboard.press("Space");
  expect(
    seen.filter((c) => c.startsWith("other")),
    seen.join(" "),
  ).toEqual([]);
  expect(seen).toContain("yellow");
});

test("timeline keeps its scale when clips are added, scrolls sideways, and zooms / fits", async ({
  page,
}) => {
  await page.goto("/");
  const clips = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await upload(page, "red.mp4");
  await expect(clips).toHaveCount(1);
  const w0 = (await clips.first().boundingBox())!.width;
  for (const f of [
    "yellow.mp4",
    "grey.mp4",
    "red.mp4",
    "yellow.mp4",
    "red.mp4",
    "red.mp4",
    "red.mp4",
  ]) {
    const n = await clips.count();
    await upload(page, f);
    await expect(clips).toHaveCount(n + 1);
  }
  // the first clip didn't shrink: the timeline grew instead, and scrolls
  expect(
    Math.abs((await clips.first().boundingBox())!.width - w0),
  ).toBeLessThan(2);
  const scroller = page.getByTestId("timeline-scroller");
  const [sw, cw] = await scroller.evaluate((el) => [
    el.scrollWidth,
    el.clientWidth,
  ]);
  expect(sw).toBeGreaterThan(cw);
  // Fit shows everything; zoom in makes clips wider again
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  const wFit = (await clips.first().boundingBox())!.width;
  expect(wFit).toBeLessThan(w0);
  const last = (await clips.last().boundingBox())!;
  const view = (await scroller.boundingBox())!;
  expect(last.x + last.width).toBeLessThanOrEqual(view.x + view.width + 1);
  await page.getByRole("button", { name: "Zoom in the timeline" }).click();
  await expect
    .poll(async () => (await clips.first().boundingBox())!.width)
    .toBeGreaterThan(wFit + 1);
});

test("Record: camera, then screen + camera (two clips), then a voiceover", async ({
  page,
}) => {
  await page.goto("/");
  // camera: 3-2-1, record ~2 s, add → a clip on Video 1
  await page
    .getByRole("button", { name: "Record Camera", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Record" });
  await dialog.getByRole("button", { name: "Turn on camera" }).click();
  await dialog.getByTestId("record-start").click();
  await expect(dialog.getByTestId("record-countdown")).toBeVisible();
  await expect(dialog.getByTestId("record-timer")).toContainText("REC", {
    timeout: 10_000,
  });
  await page.waitForTimeout(2200);
  await dialog.getByTestId("record-stop").click();
  await expect(dialog.getByTestId("record-review")).toBeVisible();
  await dialog.getByTestId("record-add").click();
  await expect(dialog).toBeHidden({ timeout: 90_000 });
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  await expect(main.first()).toHaveAttribute(
    "title",
    /Video: Camera .*\.mp4 · 0:0[1-3]/,
  );
  // the recording was re-encoded: a real length, constant 30 fps
  const assets = await (await page.request.get("/api/videos")).json();
  const cam = assets.videos.find((v: { fileName: string }) =>
    v.fileName.startsWith("Camera"),
  );
  expect(cam.info.fps).toBe(30);
  expect(cam.info.duration).toBeGreaterThan(1);

  // screen + camera → the screen on Video 1, the camera on an overlay track, same start
  await page
    .getByRole("button", { name: "Record Screen + cam", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Choose screen" }).click();
  await dialog.getByTestId("record-start").click();
  await expect(dialog.getByTestId("record-timer")).toContainText("REC", {
    timeout: 10_000,
  });
  await page.waitForTimeout(1500);
  await dialog.getByTestId("record-stop").click();
  await expect(dialog.getByText("screen + camera (2 clips)")).toBeVisible();
  await dialog.getByTestId("record-add").click();
  await expect(dialog).toBeHidden({ timeout: 90_000 });
  await expect(main).toHaveCount(2);
  const overlay = page.getByTestId("lane-overlay").getByTestId("timeline-clip");
  await expect(overlay).toHaveCount(1);
  const [a, b] = [
    (await main.nth(1).boundingBox())!,
    (await overlay.first().boundingBox())!,
  ];
  expect(Math.abs(a.x - b.x)).toBeLessThan(4);

  // voice only → a sound clip
  await page.getByRole("button", { name: "Record Voice", exact: true }).click();
  await dialog.getByRole("button", { name: "Turn on microphone" }).click();
  await dialog.getByTestId("record-start").click();
  await expect(dialog.getByTestId("record-timer")).toContainText("REC", {
    timeout: 10_000,
  });
  await page.waitForTimeout(1500);
  await dialog.getByTestId("record-stop").click();
  await dialog.getByTestId("record-add").click();
  await expect(dialog).toBeHidden({ timeout: 90_000 });
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip"),
  ).toHaveCount(1);
});

test("no page scroll: the editor is one fixed screen at common sizes", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text" })
    .click();
  await page.getByRole("button", { name: /^Add Lower third/ }).click();
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollHeight - innerHeight,
        ),
      )
      .toBe(0);
  }
});

test("AI Tools: every tool is shown; ready ones work on the clip; Text to Speech adds a voiceover", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "pauses.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "AI", exact: true })
    .click();
  const panel = page.getByTestId("ai-tools");
  await expect(panel).toBeVisible();
  // the preview and the timeline stay in the middle
  await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
  for (const name of [
    "Create with AI",
    "Modify & Edit with AI",
    "Enhance with AI",
    "Audio & Voice with AI",
    "Creative Tools",
  ])
    await expect(panel.getByRole("region", { name })).toBeVisible();
  // the search finds the tool
  await panel
    .getByRole("textbox", { name: /Describe what you want to do/ })
    .fill("clean the noise in my audio");
  await panel.getByRole("button", { name: "Find the tool" }).click();
  await expect(panel.locator('[data-tool="denoise"]')).toBeFocused();
  // Remove Background Noise: turns it on for the clip, the inspector shows it
  await panel.locator('[data-tool="denoise"]').click();
  await expect(panel).toBeHidden();
  await expect(
    page
      .getByRole("radiogroup", { name: "Clean up the sound" })
      .or(page.getByRole("group", { name: "Clean up the sound" }))
      .getByRole("radio", { name: "Light" }),
  ).toBeChecked();
  // Remove Silences opens its dialog
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "AI", exact: true })
    .click();
  await panel.locator('[data-tool="silences"]').click();
  await expect(
    page.getByRole("dialog", { name: "Remove silences" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // Text to Speech (Mac voices)
  test.skip(
    process.platform !== "darwin",
    "Text to speech uses the Mac's voices",
  );
  // (the panel stays open after the silences dialog)
  await panel.locator('[data-tool="tts"]').click();
  const tts = page.getByRole("dialog", { name: "Text to Speech" });
  await tts
    .getByRole("textbox", { name: "Script" })
    .fill("Welcome to our channel. Today we test the editor.");
  await tts.getByRole("button", { name: "Make voice" }).click();
  await expect(tts.getByTestId("tts-result")).toBeVisible({ timeout: 60_000 });
  await tts.getByRole("button", { name: "Add to timeline" }).click();
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip").first(),
  ).toHaveAttribute("title", /Sound: Voice - Welcome to our channel/);
});

test("coming-soon panels and the shareable plan page", async ({ page }) => {
  await page.goto("/");
  await openPanel(page, "Background");
  await expect(page.getByTestId("background-panel")).toBeVisible();
  for (const name of ["Audio", "Subtitles", "Brand Kit", "Templates"]) {
    await page
      .getByRole("navigation", { name: "Panels" })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("Soon").first()).toBeVisible();
  }
  // a ready feature in a panel works from there
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Audio", exact: true })
    .click();
  await page
    .getByTestId("audio-library")
    .getByRole("button", { name: "Text to speech" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Text to Speech" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // the plan page
  await page.goto("/roadmap");
  await expect(
    page.getByRole("heading", { name: /ViPlay/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Summary" })).toContainText(
    "Ready now",
  );
  await expect(
    page.getByRole("heading", { name: "AI tools", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("Auto subtitles")).toBeVisible();
});

test("Easy: crop & rotate (inspector and on the preview) and color", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  const card = page.getByRole("region", { name: "Picture" });
  // (a picture opens on its Basic tab, with Crop & rotate unfolded)
  await expect(
    card.getByRole("tab", { name: "Adjust", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  // a ratio button crops and shows it on the preview as an outline (crop mode)
  await card.getByRole("button", { name: "1:1" }).click();
  const left = card.getByRole("slider", { name: "Left", exact: true });
  await expect(left).toHaveValue("22");
  await expect(page.getByTestId("crop-box")).toBeVisible();
  await card.getByRole("button", { name: "Turn right 90 degrees" }).click();
  await expect(page.getByTestId("crop-frame")).toHaveAttribute(
    "style",
    /rotate: 90deg/,
  );
  // crop mode: the whole picture stands still; dragging the left edge crops more
  await card.getByTestId("crop-mode").click();
  await expect(page.getByTestId("crop-box")).toBeVisible();
  const frame0 = (await page.getByTestId("crop-frame").boundingBox())!;
  const h = (await page.getByTestId("crop-l").boundingBox())!;
  // turned 90°: the picture's left edge is at the top on screen, so drag down
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 30, {
    steps: 5,
  });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await left.inputValue()))
    .toBeGreaterThan(22);
  // the picture didn't move (only the box did)
  const frame1 = (await page.getByTestId("crop-frame").boundingBox())!;
  expect(
    Math.abs(frame1.x - frame0.x) +
      Math.abs(frame1.y - frame0.y) +
      Math.abs(frame1.width - frame0.width),
  ).toBeLessThan(1.5);
  await page.getByTestId("crop-done").click();
  await expect(page.getByTestId("selection-box")).toHaveAttribute(
    "data-rotation",
    "90",
  );
  await expect(page.getByTestId("crop-box")).toHaveCount(0);
  // color: black & white on the preview (the green bar of the test picture turns to its grey)
  await inspTab(page, "Color");
  await card.getByRole("textbox", { name: "Saturation" }).fill("0");
  await card.getByRole("textbox", { name: "Saturation" }).press("Enter");
  await expect
    .poll(() =>
      page.getByTestId("program-canvas").evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const d = c
          .getContext("2d")!
          .getImageData(
            Math.round(c.width / 2),
            Math.round(c.height / 2),
            1,
            1,
          ).data;
        return Math.max(Math.abs(d[0] - d[1]), Math.abs(d[1] - d[2]));
      }),
    )
    .toBeLessThan(4);
  // Auto color sets real numbers
  await card.getByRole("button", { name: "Reset" }).last().click();
  await card.getByTestId("auto-color").click();
  await expect
    .poll(async () =>
      card.getByRole("textbox", { name: "Contrast" }).inputValue(),
    )
    .not.toBe("100");
});

test("Easy: Replace background with a studio set, and an MP4 at Shorts size", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await openPanel(page, "Background");
  await page.getByRole("button", { name: "Studio set: Newsroom blue" }).click();
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  // the corner is the dark-blue studio, not the green screen
  await expect
    .poll(() =>
      page
        .getByTestId("program-canvas")
        .evaluate((el) => [
          ...(el as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(20, 20, 1, 1).data,
        ]),
    )
    .toEqual(expect.arrayContaining([255]));
  const px = await page
    .getByTestId("program-canvas")
    .evaluate((el) => [
      ...(el as HTMLCanvasElement).getContext("2d")!.getImageData(20, 20, 1, 1)
        .data,
    ]);
  expect(px[2]).toBeGreaterThan(px[1]);
  expect(px[1]).toBeLessThan(100);
  // Export ▾ → Shorts / Reels 9:16 → a 1080×1920 MP4 (the project stays 1280×720)
  await page
    .getByRole("button", { name: "Export options", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: /Shorts \/ Reels \/ TikTok 9:16/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  const href = (await dialog
    .getByRole("link", { name: /Download video \(MP4\)/ })
    .getAttribute("href"))!;
  const body = await downloadBytes(page, href);
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const file = join(FIX, "export-shorts.mp4");
  writeFileSync(file, body);
  expect(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      file,
    ])
      .toString()
      .trim(),
  ).toBe("1080,1920");
  // the project itself is still 1280 × 720
  const pid = new URL(page.url()).searchParams.get("p")!;
  const proj = await savedProject(page, pid);
  expect([
    proj.project?.doc?.canvas?.width ?? proj.doc?.canvas?.width,
    proj.project?.doc?.canvas?.height ?? proj.doc?.canvas?.height,
  ]).toEqual([1280, 720]);
});

test("Easy: stabilize a clip, and the music ducks under speech in the preview", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "pauses.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  // stabilize: the steadied copy is made and the preview uses it
  await inspTab(page, "Speed");
  await page
    .getByRole("region", { name: "Clip" })
    .getByRole("switch", { name: /Stabilize/ })
    .click();
  await expect(page.getByTestId("stabilize-status")).toContainText(
    "Stabilized ✓",
    { timeout: 60_000 },
  );
  await expect
    .poll(() =>
      page
        .getByTestId("video-pool")
        .evaluate((el) =>
          [...el.querySelectorAll("video")]
            .map((v) => v.getAttribute("src"))
            .join(" "),
        ),
    )
    .toContain("/derived/stabilize");
  // music, quieter while someone speaks (speech 0–1 s, a pause 1–2 s)
  await upload(page, "music.m4a");
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page
    .getByRole("region", { name: "Sound" })
    .getByRole("switch", { name: "Quieter while someone speaks" })
    .click();
  const program = page.getByLabel("Program preview. Space plays or pauses.");
  const volumeAt = async (frames: number) => {
    await program.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < frames; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
    const v = await page.evaluate(() =>
      Math.max(
        ...[...document.querySelectorAll("audio")].map((a) =>
          a.paused ? 0 : Number(a.dataset.level ?? a.volume),
        ),
      ),
    );
    await page.keyboard.press("Space");
    return v;
  };
  await expect.poll(() => volumeAt(6), { timeout: 20_000 }).toBeLessThan(0.45); // 0.25 s: speech
  await expect
    .poll(() => volumeAt(33), { timeout: 20_000 })
    .toBeGreaterThan(0.9); // 1.4 s: the pause
});

test("preview ratio can be switched or typed; tracks can be renamed and the names column resized", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  const ratio = page.getByRole("button", { name: /^Aspect ratio/ });
  await ratio.click();
  // (the preview's ratio menu; the clip's crop has its own 9:16 button)
  await page.getByTitle("9:16 · Reels, Shorts, Stories").click();
  await expect(page.getByTestId("program-caption")).toContainText(
    "1080 × 1920",
  );
  const stage = (await page.getByTestId("program-stage").boundingBox())!;
  expect(stage.height / stage.width).toBeCloseTo(1920 / 1080, 1);
  // a custom size
  await page.getByRole("textbox", { name: "Custom width" }).fill("1000");
  await page.getByRole("textbox", { name: "Custom height" }).fill("1001");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.getByTestId("program-caption")).toContainText(
    "1000 × 1002",
  ); // made even
  await page.keyboard.press("Escape");
  // rename a track (double-click), saved with the project
  await page
    .getByRole("button", { name: /^Overlay 1\. Press Enter to rename/ })
    .dblclick();
  await page
    .getByRole("textbox", { name: "Track name" })
    .fill("Logo and titles");
  await page.getByRole("textbox", { name: "Track name" }).press("Enter");
  await expect(
    page.getByRole("button", { name: /^Logo and titles\. Press Enter/ }),
  ).toBeVisible();
  // widen the names column by dragging its edge
  const handle = page.getByTestId("track-head-resizer");
  const w0 = Number(await handle.getAttribute("aria-valuenow"));
  const r = (await handle.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + 50);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 60, r.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await handle.getAttribute("aria-valuenow")))
    .toBeGreaterThan(w0 + 40);
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Logo and titles\. Press Enter/ }),
  ).toBeVisible();
  expect(
    Number(
      await page
        .getByTestId("track-head-resizer")
        .getAttribute("aria-valuenow"),
    ),
  ).toBeGreaterThan(w0 + 40);
});

test("Medium: speed 2× halves the clip, reverse makes a backwards copy, freeze adds a picture", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "pauses.mp4");
  const clips = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(clips).toHaveCount(1);
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  const length = page.getByTestId("timeline-length");
  await expect(length).toHaveText("0:04.0");
  // Speed ▾ → 2× (the new clip is selected)
  await page.getByRole("button", { name: "Speed", exact: true }).click();
  await page.getByRole("menuitem", { name: /^2×/ }).click();
  await expect(length).toHaveText("0:02.0");
  await expect(page.getByTestId("speed-badge")).toHaveText("2×");
  // Reverse: the backwards copy is made and the preview plays it
  await page.getByRole("button", { name: "Reverse", exact: true }).click();
  await expect(page.getByTestId("reverse-status")).toContainText("Reversed ✓", {
    timeout: 60_000,
  });
  await expect
    .poll(() =>
      page
        .getByTestId("video-pool")
        .evaluate((el) =>
          [...el.querySelectorAll("video")]
            .map((v) => `${v.getAttribute("src")}@${v.playbackRate}`)
            .join(" "),
        ),
    )
    .toMatch(/reversed\?a=\d+&b=\d+@2/);
  // Freeze at 1 s: split + a 2-second picture in between
  const program = page.getByLabel("Program preview. Space plays or pauses.");
  await program.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Freeze", exact: true }).click();
  await expect(clips).toHaveCount(3, { timeout: 30_000 });
  await expect(
    page.getByTestId("lane-main").locator('[data-type="image"]'),
  ).toHaveCount(1);
  await expect(length).toHaveText(/^0:04\.0 · 3 clips$/);
});

test("AI Removal keeps the clip's voice in the preview", async ({ page }) => {
  test.skip(process.platform !== "darwin", "AI Removal uses Apple Vision");
  await page.goto("/");
  await upload(page); // veo.mp4 has sound
  await useDetectedGreen(page);
  await page.getByRole("radio", { name: "AI Removal" }).check({ force: true });
  await page.getByRole("radio", { name: "Main object" }).check({ force: true });
  await expect(page.getByTestId("ai-status")).toContainText(
    "Subject found in every frame",
    { timeout: 120_000 },
  );
  const src = await expect
    .poll(
      () =>
        page
          .getByTestId("preview-stage")
          .locator("video")
          .first()
          .getAttribute("src"),
      { timeout: 60_000 },
    )
    .toContain("/packed/")
    .then(() =>
      page
        .getByTestId("preview-stage")
        .locator("video")
        .first()
        .getAttribute("src"),
    );
  const res = await page.request.get(src!);
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const file = join(FIX, "packed-check.mp4");
  writeFileSync(file, await res.body());
  expect(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  ).toContain("audio");
});

test("Watermark & logo: a box covers a logo on the preview (remove / blur / cover)", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  const card = page.getByRole("region", { name: "Picture" });
  await inspTab(page, "More");
  await card.getByText("Watermark & logo").click();
  await card.getByTestId("add-patch").click();
  await expect(page.getByTestId("patch-box")).toBeVisible();
  // drag the box to the top-left (where the test picture has its time stamp)
  const box = (await page.getByTestId("patch-box").boundingBox())!;
  const stage = (await page.getByTestId("program-stage").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    stage.x + box.width / 2 + 4,
    stage.y + box.height / 2 + 4,
    { steps: 8 },
  );
  await page.mouse.up();
  await card.getByRole("button", { name: "Cover", exact: true }).click();
  await card.getByLabel("Cover color").fill("#ffff00");
  await page.getByTestId("patch-done").click();
  await expect(page.getByTestId("patch-box")).toHaveCount(0);
  const px = () =>
    page.getByTestId("program-canvas").evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return [
        ...c
          .getContext("2d")!
          .getImageData(
            Math.round(c.width * 0.05),
            Math.round(c.height * 0.05),
            1,
            1,
          ).data,
      ];
    });
  await expect
    .poll(async () => (await px()).slice(0, 3))
    .toEqual([255, 255, 0]);
});

test("Medium: transitions between Video 1 clips (marker, card, preview)", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await upload(page, "yellow.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  const length = page.getByTestId("timeline-length");
  await expect(length).toHaveText(/^0:06\.0/);
  // the cut marker adds a crossfade (0.5 s): the clips overlap
  await page.getByTestId("transition-marker").click();
  await expect(page.getByTestId("transition-card")).toBeVisible();
  await expect(length).toHaveText(/^0:05\.5/);
  // 1 s long, "Slide left"
  const len = page
    .getByTestId("transition-card")
    .getByRole("textbox", { name: "Length" });
  await len.fill("1");
  await len.press("Enter");
  await expect(length).toHaveText(/^0:05\.0/);
  await page
    .getByTestId("transition-card")
    .getByRole("radio", { name: /Slide left/ })
    .click();
  // half-way through (4.5 s = the overlap 3–4 s? no: red is 4 s, overlap 3–4 s): at 3.5 s the yellow covers the right half
  const program = page.getByLabel("Program preview. Space plays or pauses.");
  await program.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  const at = (fx: number) =>
    page.getByTestId("program-canvas").evaluate((el, f) => {
      const c = el as HTMLCanvasElement;
      return [
        ...c
          .getContext("2d")!
          .getImageData(Math.round(c.width * f), Math.round(c.height / 2), 1, 1)
          .data,
      ];
    }, fx);
  await expect.poll(async () => (await at(0.85))[1]).toBeGreaterThan(180); // yellow
  await expect.poll(async () => (await at(0.15))[1]).toBeLessThan(60); // red
  // Delete removes the selected transition
  await page.getByTestId("transition-marker").click();
  await page.keyboard.press("Delete");
  await expect(length).toHaveText(/^0:06\.0/);
  // "None" in the card, and in the Transitions panel: a plain cut again
  await page.getByTestId("transition-marker").click();
  await expect(length).toHaveText(/^0:05\.5/);
  await page
    .getByTestId("transition-card")
    .getByRole("radio", { name: /None/ })
    .click();
  await expect(length).toHaveText(/^0:06\.0/);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Transitions", exact: true })
    .click();
  await page
    .getByTestId("transitions-panel")
    .getByRole("button", { name: /Crossfade every cut/ })
    .click();
  await expect(length).toHaveText(/^0:05\.5/);
  await page.getByTestId("transition-none").click();
  await expect(length).toHaveText(/^0:06\.0/);
  await page
    .getByTestId("transitions-panel")
    .getByRole("button", { name: /Crossfade every cut/ })
    .click();
  await page
    .getByTestId("transitions-panel")
    .getByRole("button", { name: /Remove every transition/ })
    .click();
  await expect(length).toHaveText(/^0:06\.0/);
});

/** The program canvas pixel at a share (fx, fy) of its size: [r, g, b, a]. */
async function programPixel(page: Page, fx: number, fy: number) {
  return page.getByTestId("program-canvas").evaluate(
    (el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      return [
        ...c
          .getContext("2d")!
          .getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1)
          .data,
      ];
    },
    [fx, fy],
  );
}

test("Medium: Mask tool makes a round camera bubble; a look from the Effects panel; preview zoom", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect
    .poll(async () => (await programPixel(page, 0.5, 0.5))[0])
    .toBeGreaterThan(200);
  // Mask ▸ Round camera bubble: a centred circle, the corners of its square are empty
  await page.getByRole("button", { name: "Mask", exact: true }).click();
  await page.getByRole("menuitem", { name: /Round camera bubble/ }).click();
  await expect
    .poll(async () => (await programPixel(page, 0.5 - 0.4 * (9 / 16), 0.1))[0])
    .toBeLessThan(40);
  expect((await programPixel(page, 0.5, 0.5))[0]).toBeGreaterThan(200);
  // Mask ▸ No mask: the full picture again
  await page.getByRole("button", { name: "Mask", exact: true }).click();
  await page.getByRole("menuitem", { name: /No mask/ }).click();
  await expect
    .poll(async () => (await programPixel(page, 0.05, 0.05))[0])
    .toBeGreaterThan(200);

  // Effects ▸ B&W: red turns grey on the preview
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Effects", exact: true })
    .click();
  await page
    .getByTestId("effects-panel")
    .getByRole("radio", { name: "B&W" })
    .click();
  await expect
    .poll(async () => {
      const [r, g, b] = await programPixel(page, 0.5, 0.5);
      return Math.max(Math.abs(r - g), Math.abs(g - b));
    })
    .toBeLessThan(6);

  // preview zoom: + makes the picture bigger than the view (scrollable); the size menu goes back to Fit
  const view = page.getByTestId("program-view");
  const stage = page.getByTestId("program-stage");
  const w0 = (await stage.boundingBox())!.width;
  await page.getByRole("button", { name: "Zoom in the preview" }).click();
  await page.getByRole("button", { name: "Zoom in the preview" }).click();
  await expect(page.getByTestId("preview-zoom")).toHaveText("125%");
  expect((await stage.boundingBox())!.width).toBeGreaterThan(w0 * 1.2);
  expect(await view.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await page.getByTestId("preview-zoom").click();
  await page
    .getByRole("menu", { name: "Zoom size" })
    .getByRole("menuitemradio", { name: "Fit · 100%" })
    .click();
  await expect(page.getByTestId("preview-zoom")).toHaveText("Fit");
  // − goes down in small steps (95, 90…); the menu has every size
  await page.getByRole("button", { name: "Zoom out the preview" }).click();
  await expect(page.getByTestId("preview-zoom")).toHaveText("95%");
  await page.getByRole("button", { name: "Zoom out the preview" }).click();
  await expect(page.getByTestId("preview-zoom")).toHaveText("90%");
  await page.getByTestId("preview-zoom").click();
  const sizes = page
    .getByRole("menu", { name: "Zoom size" })
    .getByRole("menuitemradio");
  await expect(sizes).toHaveCount(14);
  await expect(
    page.getByRole("menuitemradio", { name: "90%", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "50%", exact: true }).click();
  await expect(page.getByTestId("preview-zoom")).toHaveText("50%");
  expect((await stage.boundingBox())!.width).toBeLessThan(w0 * 0.55);
});

test("Medium: Brand Kit logo shows on the preview; a font and brand colors are ready for text", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Brand Kit", exact: true })
    .click();
  const panel = page.getByTestId("brand-panel");
  await panel
    .getByTestId("brand-logo-input")
    .setInputFiles(join(FIX, "site.png"));
  await expect(panel.getByRole("img", { name: "Your logo" })).toBeVisible({
    timeout: 20_000,
  });
  // show it on this video, bottom left: the corner of the preview changes
  const before = await programPixel(page, 0.08, 0.9);
  await panel
    .getByRole("switch", { name: "Show my logo on this video" })
    .click();
  await panel.getByRole("button", { name: "Bottom left" }).click();
  await expect
    .poll(async () => JSON.stringify(await programPixel(page, 0.08, 0.9)))
    .not.toBe(JSON.stringify(before));
  // brand color and a font
  await panel.getByRole("button", { name: "Add color" }).click();
  // (the color itself shows; its × to remove it appears on hover)
  await expect(
    panel.getByRole("button", { name: /Brand color #.*copy the code/ }).first(),
  ).toBeVisible();
  await panel
    .getByTestId("brand-font-input")
    .setInputFiles(join(FIX, "Georgia.ttf"));
  await expect(panel.getByText("Georgia", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  // a text clip lists the font and shows the brand colors next to its color pickers
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Plain text/ })
    .first()
    .click();
  const card = page.getByRole("region", { name: "Text", exact: true });
  // (the font picker: a popover with search; brand fonts come first)
  await card.getByRole("button", { name: /^Font: / }).click();
  await page.getByRole("searchbox", { name: "Search fonts" }).fill("Georgia");
  await page.getByRole("option", { name: /Georgia/ }).first().click();
  await expect(
    card.getByRole("group", { name: "Brand colors for text color" }),
  ).toBeVisible();
  // the logo is part of the saved project
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  expect(proj.doc.watermark.corner).toBe("bl");
  // clean up the shared Brand Kit for other tests
  const kit = await (await page.request.get("/api/brand")).json();
  for (const f of kit.fonts)
    await page.request.delete(`/api/brand/fonts/${f.id}`);
  await page.request.put("/api/brand", { data: { logo: null, colors: [] } });
});

test("Medium: a template makes a new project; the music library adds starter sounds and reads a folder", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Browse all templates" }).click();
  await page
    .getByTestId("template-hub")
    .getByRole("button", { name: "Use template Breaking news", exact: true })
    .click();
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect
    .poll(async () => page.getByTestId("timeline-clip").count(), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await expect(page.getByTestId("program-caption")).toContainText(
    "1920 × 1080",
  );

  // Audio ▸ Sound effects ▸ Whoosh + : it goes on an audio track
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Audio", exact: true })
    .click();
  const lib = page.getByTestId("audio-library");
  await lib.getByRole("tab", { name: "Sound FX" }).click();
  const n = await page
    .getByTestId("lane-audio")
    .getByTestId("timeline-clip")
    .count();
  await lib
    .getByRole("button", { name: "Add Whoosh at the playhead" })
    .click({ timeout: 60_000 });
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip"),
  ).toHaveCount(n + 1, { timeout: 20_000 });
  // My folder: a folder on the server, set by its super admin only (the test user isn't one)
  await lib.getByRole("tab", { name: "My folder" }).click();
  await lib.getByRole("textbox", { name: "Music folder path" }).fill(FIX);
  await lib.getByRole("button", { name: "Use this folder" }).click();
  await expect(lib).toContainText("Only the site's admin can set the music folder");
});

test("export formats: MP4 is recommended; GIF, MP3 and a PNG picture are real files; alpha formats say what they need", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  const formats = dialog.getByTestId("export-formats");
  await expect(
    formats.getByRole("radio", { name: /MP4 \(H\.264\)/ }),
  ).toBeChecked();
  await expect(formats.getByText("Recommended")).toBeVisible();
  // background removal is still off: the see-through formats (on the Video tab) say so, MP4 is fine
  await expect(formats).toContainText("Turn on Background removal");
  await expect(
    dialog.getByRole("button", { name: "Make video (MP4)" }),
  ).not.toHaveAttribute("aria-disabled", "true");

  const make = async (
    format: RegExp,
    button: string,
    ready: string,
    link: RegExp,
    type: string,
    magic: string,
  ) => {
    await pickFormat(dialog, format);
    await dialog.getByRole("button", { name: button }).click();
    await expect(dialog.getByText(ready)).toBeVisible({ timeout: 120_000 });
    const href = (await dialog.getByRole("link", { name: link }).getAttribute("href"))!;
    // (a browser export's blob: link carries no content type; the server's does)
    if (!href.startsWith("blob:"))
      expect((await page.request.get(href)).headers()["content-type"]).toContain(type);
    expect(
      (await downloadBytes(page, href)).subarray(0, magic.length).toString("latin1"),
    ).toBe(magic);
    await dialog
      .getByRole("button", { name: "Change export settings" })
      .click();
  };
  // the formats are on tabs: Video, Image / GIF, Audio
  const tab = (name: string) => dialog.getByRole("button", { name, exact: true }).click();
  await tab("Image / GIF");
  await make(
    /GIF \(animated\)/,
    "Make GIF",
    "Your GIF is ready",
    /Download GIF/,
    "image/gif",
    "GIF8",
  );
  await tab("Audio");
  await make(
    /^MP3/,
    "Make MP3",
    "Your sound (MP3) is ready",
    /Download sound \(MP3\)/,
    "audio/mpeg",
    "ID3",
  );
  await tab("Image / GIF");
  await make(
    /PNG picture/,
    "Make PNG",
    "Your picture (PNG) is ready",
    /Download picture \(PNG\)/,
    "image/png",
    "\x89PNG",
  );
});

test("a single see-through file (WebM VP9 + alpha, no MOV) exports without breaking the page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await upload(page);
  await inspTab(page, "Cutout");
  await page
    .getByRole("button", { name: "Green / blue screen", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Background removal" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await pickFormat(dialog, /WebM \(VP9 \+ alpha\)/);
  await dialog.getByRole("button", { name: "Make WebM + alpha" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  const webm = await downloadBytes(
    page,
    (await dialog
      .getByRole("link", { name: /Download/ })
      .first()
      .getAttribute("href"))!,
  );
  // (a WebM starts with the EBML header)
  expect(webm.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  // the editor is still there (it used to crash looking for the Safari MOV)
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("clicking the dark area around the preview picture unselects the clip", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1, {
    timeout: 30_000,
  });
  await page.getByTestId("timeline-clip").first().click();
  await expect(page.getByRole("region", { name: "Project" })).toHaveCount(0);
  const view = (await page.getByTestId("program-view").boundingBox())!;
  const stage = (await page.getByTestId("program-stage").boundingBox())!;
  // the 16:9 picture leaves bars at the sides (or top and bottom): click one
  const side = stage.x - view.x > 6;
  await page.mouse.click(
    side ? view.x + 3 : view.x + view.width / 2,
    side ? view.y + view.height / 2 : view.y + 3,
  );
  await expect(page.getByRole("region", { name: "Project" })).toBeVisible();
});

test("theme: one top-bar icon steps through Dark, Light and Match my computer; the choice is kept after a reload", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  const btn = page.getByTestId("theme-cycle");
  await expect(html).not.toHaveAttribute("data-theme");
  await expect(btn).toHaveAttribute("aria-label", /^Theme: Dark/);
  await btn.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(236, 238, 243)");
  // the preview area follows the theme too (not dark on light)
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-preview")
          .trim(),
      ),
    )
    .toBe("#d9dce3");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(btn).toHaveAttribute("aria-label", /^Theme: Light/);
  // Match my computer: follows the system setting
  await page.emulateMedia({ colorScheme: "dark" });
  await btn.click();
  await expect(html).toHaveAttribute("data-theme", "system");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(8, 9, 11)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(236, 238, 243)");
  // and back to dark (the default)
  await btn.click();
  await expect(html).not.toHaveAttribute("data-theme");
});

/** Every request the page makes must stay on this computer (the Gemini ones go through our own server). */
function watchOutside(page: Page) {
  const outside: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (!/^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/.test(u))
      outside.push(u);
  });
  return outside;
}

test("Gemini subtitles (pretend Gemini): captions on their own track at the right times, a translation, and an .srt file", async ({
  page,
}) => {
  const outside = watchOutside(page);
  await page.goto("/");
  await upload(page, "pauses.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await openPanel(page, "Captions");
  const panel = page.getByTestId("subtitles-panel");
  await expect(panel.getByTestId("gemini-note")).toContainText(
    "Sends the sound of this clip",
  );
  await expect(panel.getByTestId("make-subtitles")).toContainText(
    "less than 1¢",
  );
  await panel.getByTestId("make-subtitles").click();
  await expect(panel.getByRole("status")).toContainText(/\d+ subtitles added/, {
    timeout: 60_000,
  });
  // a "Subtitles" track of Caption texts; the first one starts 0.3 s in (the pretend transcript)
  const tracks = panel.getByTestId("subtitle-tracks");
  await expect(tracks).toContainText("Subtitles");
  await expect(page.getByRole("region", { name: "Timeline" })).toContainText(
    "Subtitles",
  );
  await expect(
    page
      .getByRole("button", { name: /Text: Hello and welcome to the news\./ })
      .or(page.locator('[title*="Hello and welcome to the news."]'))
      .first(),
  ).toBeVisible();
  // .srt download
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    tracks.getByRole("button", { name: ".srt" }).click(),
  ]);
  const { readFileSync } = await import("node:fs");
  const srt = readFileSync((await dl.path())!, "utf8");
  expect(
    srt.startsWith(
      "1\n00:00:00,300 --> 00:00:02,400\nHello and welcome to the news.",
    ),
  ).toBe(true);
  // translate: a second track, the first one hidden
  await tracks
    .getByRole("combobox", { name: /Translate Subtitles to/ })
    .selectOption("hi");
  await tracks.getByRole("button", { name: /Translate/ }).click();
  await expect(tracks).toContainText("Subtitles (Hindi)", { timeout: 30_000 });
  await expect(tracks).toContainText("hidden");
  await expect(
    page.locator('[title*="[hi] Hello and welcome"]').first(),
  ).toBeAttached();
  expect(outside).toEqual([]);
});

test("Gemini pictures (pretend Gemini): a background behind everything, a picture on the timeline", async ({
  page,
}) => {
  const outside = watchOutside(page);
  await page.goto("/");
  await upload(page);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  // Background panel → Describe a background
  await openPanel(page, "Background");
  await page.getByTestId("describe-background").click();
  const dlg = page.getByRole("dialog", { name: /Background Studio/ });
  await dlg
    .getByRole("textbox", { name: /Visual Prompt/ })
    .fill("a modern news studio");
  await expect(dlg.getByTestId("generate-image-button")).toContainText(
    "~$0.10",
  );
  await dlg.getByRole("button", { name: /^Quick/ }).click();
  await expect(dlg.getByTestId("generate-image-button")).toContainText(
    "~$0.03",
  );
  await dlg.getByTestId("generate-image-button").click();
  await expect(dlg.getByTestId("generated-image")).toBeVisible({
    timeout: 30_000,
  });
  await dlg.getByRole("button", { name: "Set as Background" }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const pid = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, pid);
  expect(proj.doc.canvas.backdrop.kind).toBe("media");
  const assets = await (await page.request.get("/api/videos")).json();
  const made = (assets.videos ?? assets).find(
    (v: { id: string }) => v.id === proj.doc.canvas.backdrop.mediaId,
  );
  expect(made.ai.what).toBe("background");
  // AI Tools → Generate Image → Add to timeline
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "AI", exact: true })
    .click();
  await page.getByTestId("ai-tools").locator('[data-tool="gen-image"]').click();
  const img = page.getByRole("dialog", { name: /Image Studio/ });
  await img
    .getByRole("textbox", { name: /Visual Prompt/ })
    .fill("a map of India");
  await img.getByTestId("generate-image-button").click();
  await img
    .getByRole("button", { name: "Add to Timeline" })
    .click({ timeout: 30_000 });
  await expect(
    page.getByTestId("lane-overlay").getByTestId("timeline-clip").first(),
  ).toHaveAttribute("title", /Gemini - a map of India/);
  expect(outside).toEqual([]);
});

test("Gemini voice and Veo video (pretend Gemini): a voiceover, and a generated clip at the end of Video 1", async ({
  page,
}) => {
  const outside = watchOutside(page);
  await page.goto("/");
  await upload(page);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  // Audio → Text to speech → Gemini voices
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Audio", exact: true })
    .click();
  await page
    .getByTestId("audio-library")
    .getByRole("button", { name: "Text to speech" })
    .click();
  // (the Voiceover Studio: Gemini voices, a persona, the script, Generate, then Insert)
  const tts = page.getByRole("dialog", { name: /Voiceover Studio/ });
  await tts.getByRole("radio", { name: /Gemini Neural Voices/ }).click();
  await tts.getByRole("button", { name: /Puck/ }).first().click();
  await tts
    .getByRole("textbox", { name: "Voiceover Script" })
    .fill("Breaking news from the city.");
  await tts.getByRole("button", { name: /Generate Voiceover/ }).click();
  await expect(tts.getByTestId("tts-result")).toBeVisible({ timeout: 30_000 });
  await tts.getByRole("button", { name: /Insert onto Timeline/ }).click();
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip").first(),
  ).toHaveAttribute("title", /Voice \(Puck\) - Breaking news/);
  // AI Tools → Generate Video: price on the button, progress, then the clip
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "AI", exact: true })
    .click();
  await page.getByTestId("ai-tools").locator('[data-tool="gen-video"]').click();
  const veo = page.getByRole("dialog", { name: /Veo Studio/ });
  await veo
    .getByRole("textbox", { name: "Describe the video scene" })
    .fill("a sunset over the sea");
  await expect(veo.getByTestId("generate-video-button")).toContainText(
    "~$0.80",
  );
  await veo.getByRole("radio", { name: /Lite/ }).click();
  await veo.getByRole("button", { name: "4 seconds" }).click();
  await expect(veo.getByTestId("generate-video-button")).toContainText(
    "~$0.20",
  );
  await veo.getByTestId("generate-video-button").click();
  await expect(veo.getByTestId("veo-working")).toBeVisible();
  await expect(veo.getByTestId("veo-ready")).toBeVisible({ timeout: 60_000 });
  await veo.getByRole("button", { name: /Add to End of Video 1/ }).click();
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  expect(outside).toEqual([]);
});

test("AI settings: add, switch off and remove an API key; the Gemini features follow", async ({
  page,
}) => {
  // start with no Gemini key saved
  await page.request.delete("/api/ai/keys?provider=gemini");
  await page.goto("/");
  await upload(page);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "AI", exact: true })
    .click();
  await page.getByTestId("ai-settings-button").click();
  const dlg = page.getByRole("dialog", { name: "API keys" });
  const gem = dlg.getByTestId("ai-provider-gemini");
  await expect(dlg.getByTestId("ai-provider-grok")).toBeVisible();
  await expect(dlg.getByTestId("ai-provider-openai")).toBeVisible();
  // a wrong-looking key is refused before anything is saved
  await gem.getByLabel("API key").fill("hello");
  await gem.getByRole("button", { name: "Check & save" }).click();
  await expect(gem.getByRole("alert")).toContainText(
    /doesn\'t look like a (valid )?Google Gemini key/,
  );
  // a good one is saved and shown only by its last 4 characters
  const key = "AIza" + "TESTKEY".padEnd(35, "x") + "Wxyz";
  await gem.getByLabel("API key").fill(key);
  await gem.getByRole("button", { name: "Check & save" }).click();
  await expect(gem.getByTestId("ai-provider-status")).toHaveText(
    "Connected · ••••Wxyz",
  );
  await expect(dlg).not.toContainText(key);
  // switched off: the Gemini features say so
  await gem.getByRole("switch", { name: "Google Gemini features" }).click();
  await expect(gem.getByTestId("ai-provider-status")).toHaveText(
    "Switched off",
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("ai-tools").locator('[data-tool="gen-image"]').click();
  const why = page.getByRole("dialog", { name: "No Gemini API Key Available" });
  await expect(why).toContainText("Gemini is switched off");
  // "Open AI Settings" from there, switch it on again: the feature is back
  await why.getByRole("button", { name: "Open AI Settings" }).click();
  await gem.getByRole("switch", { name: "Google Gemini features" }).click();
  await expect(gem.getByTestId("ai-provider-status")).toHaveText(
    "Connected · ••••Wxyz",
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("ai-tools").locator('[data-tool="gen-image"]').click();
  const img = page.getByRole("dialog", { name: /Image Studio/ });
  await expect(img.getByTestId("generate-image-button")).toBeVisible();
  await page.keyboard.press("Escape");
  // removed: the features run on the site's key again (paid with AI credits), no key card
  await page.getByTestId("ai-settings-button").click();
  await gem.getByRole("button", { name: "Remove key" }).click();
  await expect(gem.getByTestId("ai-provider-status")).toHaveText("No key");
  await page.keyboard.press("Escape");
  await page.getByTestId("ai-tools").locator('[data-tool="gen-video"]').click();
  const veo = page.getByRole("dialog", { name: /Veo Studio/ });
  await expect(veo).toBeVisible();
  await expect(veo.getByTestId("gemini-key-card")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // (put a key back for the other tests: the pretend Gemini then works again)
  const r = await page.request.put("/api/ai/keys", {
    data: { provider: "gemini", key },
  });
  expect(r.ok()).toBe(true);
});

test("copy, cut and paste clips on the timeline (keys and the clip menu)", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  // a text clip, copied with ⌘C and pasted at the playhead with ⌘V
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Plain text/ })
    .first()
    .click();
  const texts = page.getByTestId("lane-overlay").getByTestId("timeline-clip");
  await expect(texts).toHaveCount(1);
  await texts.first().click();
  await page.keyboard.press("ControlOrMeta+c");
  const program = page.getByLabel("Program preview. Space plays or pauses.");
  await program.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.locator('[data-testid="timeline-clip"][title^="Text:"]'),
  ).toHaveCount(2);
  // the video: right-click → Copy, then Paste at the playhead (Video 1 gets a second clip)
  await main.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Copy(?! style)/ }).click();
  await main.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Paste at the playhead/ }).click();
  await expect(main).toHaveCount(2);
  // ⌘X cuts the selected (pasted) clip; undo brings it back
  await page.keyboard.press("ControlOrMeta+x");
  await expect(main).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(main).toHaveCount(2);
});

test("Import (pretend libraries): Pexels to the timeline, Pixabay to My Assets", async ({
  page,
}) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (r.frame() !== page.mainFrame()) return;
    if (!/^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/.test(u)) outside.push(u);
  });
  await page.goto("/");
  await upload(page);
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  // Media → Import from the web → Pexels: search, pick, Add to timeline
  await page.getByTestId("open-import").click();
  const dlg = page.getByRole("dialog", { name: "Import" });
  await expect(dlg.getByRole("tab", { name: "Pexels" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dlg
    .getByRole("textbox", { name: "Search Pexels" })
    .fill("city at night");
  await dlg.getByRole("button", { name: "Search" }).click();
  const results = dlg
    .getByTestId("import-results")
    .getByRole("button", { pressed: false });
  await expect(results.first()).toBeVisible();
  await results.first().click();
  await expect(dlg.getByTestId("import-picked")).toContainText("free to use");
  await dlg.getByRole("button", { name: "Add to timeline" }).click();
  await expect(main).toHaveCount(2, { timeout: 30_000 });
  // Pixabay → Save to My Assets (the timeline stays the same)
  await dlg.getByRole("tab", { name: "Pixabay" }).click();
  await dlg.getByRole("textbox", { name: "Search Pixabay" }).fill("ocean");
  await dlg.getByRole("button", { name: "Search" }).click();
  await dlg.getByTestId("import-results").getByRole("button").first().click();
  await dlg.getByRole("button", { name: "Save to My Assets" }).click();
  await expect(
    dlg
      .getByTestId("import-results")
      .locator('[aria-pressed="true"] svg')
      .last(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(main).toHaveCount(2);
  await page.keyboard.press("Escape");
  // the imports are in My Assets, with their credit
  const assets = await (await page.request.get("/api/videos")).json();
  const list = (assets.videos ?? assets) as { credit?: { source: string } }[];
  expect(
    list
      .filter((v) => v.credit)
      .map((v) => v.credit!.source)
      .sort(),
  ).toEqual(["pexels", "pixabay"]);
  expect(outside).toEqual([]);
});

test("fixes: clip volume reaches the preview (0 is silent, 150% is louder), sticky clip header, My Assets marks follow the timeline", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "pauses.mp4");
  const clip = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(clip).toHaveCount(1);
  await page.getByRole("radio", { name: "Program" }).check({ force: true });
  // the playing element's level follows the clip's volume
  await inspTab(page, "Audio");
  const vol = page
    .getByRole("region", { name: "Clip" })
    .getByRole("textbox", { name: "Volume" });
  await vol.fill("0");
  await vol.press("Enter");
  const program = page.getByLabel(/Program preview/);
  await program.focus();
  await page.keyboard.press("Space");
  const levels = () =>
    page
      .getByTestId("video-pool")
      .evaluate((el) =>
        [...el.querySelectorAll("video")]
          .filter((v) => !v.paused)
          .map((v) => v.dataset.level),
      );
  await expect.poll(levels).toEqual(["0.000"]);
  await vol.fill("150");
  await vol.press("Enter");
  await expect.poll(levels).toEqual(["1.500"]);
  await program.focus();
  await page.keyboard.press("Space");
  // nothing else plays
  await expect.poll(levels).toEqual([]);
  // the Clip header and tabs stay in sight when the settings scroll
  await inspTab(page, "Adjust");
  const scroller = page.getByTestId("inspector-scroll");
  await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const head = (await page.getByTestId("clip-inspector-head").boundingBox())!;
  const box = (await scroller.boundingBox())!;
  expect(Math.abs(head.y - box.y)).toBeLessThan(4);
  // My Assets: the check follows the timeline (deleting the clip removes it)
  await expect(
    page.getByTestId("assets").getByTestId("asset-used"),
  ).toHaveCount(1);
  await page
    .getByRole("region", { name: "Clip" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(clip).toHaveCount(0);
  await expect(
    page.getByTestId("assets").getByTestId("asset-used"),
  ).toHaveCount(0);
});

// ---------- export size, compact right panel, Media icons, logo, crop, timeline shadow ----------

test("Export & Share: the file size shows before exporting, for every format, and follows the quality", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  const formats = dialog.getByTestId("export-formats");
  // each format card shows its estimated size ("Est. 1.2 MB")
  const mp4 = formats.locator("label").filter({ hasText: "MP4 (H.264)" });
  await expect(mp4).toContainText(/Est\. [\d.]+ (KB|MB)/, { timeout: 30_000 });
  await expect(mp4.getByRole("radio")).toBeChecked();
  const bytes = async () => {
    const m = (await mp4.textContent())!.match(/Est\. ([\d.]+) (KB|MB)/)!;
    return Number(m[1]) * (m[2] === "MB" ? 1e6 : 1e3);
  };
  const balanced = await bytes();
  await dialog.getByRole("button", { name: /^Small/ }).click();
  await expect.poll(bytes).toBeLessThan(balanced);
  expect(await formats.getByText(/^Est\. /).count()).toBeGreaterThan(2);
  // the sound formats too
  await dialog.getByRole("button", { name: "Audio", exact: true }).click();
  await expect(formats.getByText(/^Est\. /).first()).toBeVisible();
});

test("compact right panel: narrow number boxes without %, icon view switch, a small pipette, thin scrollbars", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await inspTab(page, "Audio");
  const vol = page.getByRole("textbox", { name: "Volume" });
  expect((await vol.boundingBox())!.width).toBeLessThanOrEqual(41);
  await expect(page.getByRole("group", { name: "Volume" })).not.toContainText(
    "%",
  );
  // Program / This clip: icons (the names stay for screen readers)
  const label = page.locator("label", {
    has: page.getByRole("radio", { name: "Program" }),
  });
  expect((await label.boundingBox())!.width).toBeLessThan(40);
  await expect(label.locator("svg")).toHaveCount(1);
  // the key color's pipette is a small icon button
  await inspTab(page, "Cutout");
  await page
    .getByRole("button", { name: "Green / blue screen", exact: true })
    .click();
  const pick = page.getByRole("button", { name: "Pick key color from video" });
  expect((await pick.boundingBox())!.width).toBeLessThanOrEqual(30);
  // scrollbars are 6 px
  const bar = await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText =
      "position:fixed;top:0;left:0;width:100px;height:100px;overflow:scroll";
    document.body.append(d);
    const w = d.offsetWidth - d.clientWidth;
    d.remove();
    return w;
  });
  expect(bar).toBeLessThanOrEqual(8);
});

test("Media panel: record buttons are icons in one row with a tip; the note is an (i) tip; nothing scrolls sideways", async ({
  page,
}) => {
  await page.goto("/");
  const names = [
    "Record Camera",
    "Record Screen",
    "Record Screen + cam",
    "Record Voice",
  ];
  const boxes = await Promise.all(
    names.map(
      async (n) =>
        (await page
          .getByRole("button", { name: n, exact: true })
          .boundingBox())!,
    ),
  );
  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
  for (const b of boxes) expect(b.width).toBeLessThan(70);
  const scroller = page
    .getByRole("button", { name: "Record Screen", exact: true })
    .locator("xpath=ancestor::div[contains(@class,'overflow-y-auto')][1]");
  const sideways = () =>
    scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  for (const n of names) {
    await page.getByRole("button", { name: n, exact: true }).hover();
    await expect(page.getByTestId("record-tip")).toContainText(
      n.replace("Record ", ""),
    );
    expect(await sideways()).toBe(false);
  }
  await page.getByRole("button", { name: "About My Assets" }).hover();
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: "Everything stays on this computer" }),
  ).toBeVisible();
  expect(await sideways()).toBe(false);
});

test("Logo: a picture dropped on the preview lands logo-sized, where it was dropped, for the whole video", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "site.png");
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="image"]'),
  ).toHaveCount(1);
  const tile = page
    .getByTestId("assets")
    .getByRole("button", { name: "site.png", exact: true })
    .first();
  const stage = page.getByTestId("program-stage");
  const sb = (await stage.boundingBox())!;
  // (a slow machine: the first drag can come before the preview is ready; try again)
  await expect(async () => {
    await tile.dragTo(stage, {
      targetPosition: { x: sb.width * 0.8, y: sb.height * 0.25 },
    });
    await expect(
      page.locator('[data-testid="timeline-clip"][data-type="image"]'),
    ).toHaveCount(2, { timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  type C = {
    type: string;
    start?: number;
    duration?: number;
    in?: number;
    out?: number;
    transform?: { scale: number; x: number; y: number };
  };
  const clips: C[] = proj.doc.tracks.flatMap((t: { clips: C[] }) => t.clips);
  const logo = clips.find(
    (c) => c.type === "image" && c.transform!.scale < 0.6,
  )!;
  expect(logo).toBeTruthy();
  expect(logo.transform!.x).toBeGreaterThan(0.15);
  expect(logo.transform!.y).toBeLessThan(-0.1);
  expect(logo.start).toBe(0);
  const video = clips.find((c) => c.type === "video")!;
  expect(logo.duration!).toBeGreaterThanOrEqual(video.out! - video.in! - 0.01);
});

test("Brand Kit logo: click it on the preview and drag it anywhere (saved); a corner button puts it back; Delete removes it", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Brand Kit", exact: true })
    .click();
  const panel = page.getByTestId("brand-panel");
  await panel
    .getByTestId("brand-logo-input")
    .setInputFiles(join(FIX, "site.png"));
  await expect(panel.getByRole("img", { name: "Your logo" })).toBeVisible({
    timeout: 20_000,
  });
  await panel
    .getByRole("switch", { name: "Show my logo on this video" })
    .click();
  // top right, 12 % wide, 3 % from the edges: click just inside its top edge
  const sb = (await page.getByTestId("program-stage").boundingBox())!;
  const top = sb.y + sb.width * 0.03 + 4;
  const x0 = sb.x + sb.width * 0.91;
  await page.mouse.click(x0, top);
  await expect(page.getByTestId("logo-box")).toBeVisible();
  await expect(page.getByTestId("logo-card")).toBeVisible();
  // drag it to the middle (it snaps there)
  await page.mouse.move(x0, top);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  const saved = async () => {
    await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
      timeout: 15_000,
    });
    const id = new URL(page.url()).searchParams.get("p");
    return (await savedProject(page, id)).doc
      .watermark;
  };
  await expect.poll(async () => (await saved())?.x).toBe(0.5);
  // a corner button puts it back in that corner
  await page
    .getByTestId("logo-card")
    .getByRole("button", { name: "Top left" })
    .click();
  await expect
    .poll(async () => JSON.stringify(await saved()))
    .toMatch(/"corner":"tl"/);
  expect((await saved()).x).toBeUndefined();
  // Delete removes it from the video
  await page.getByTestId("logo-box").focus();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("logo-card")).toHaveCount(0);
  await expect.poll(async () => await saved()).toBeUndefined();
  await page.request.put("/api/brand", { data: { logo: null, colors: [] } });
});

test("crop: a flipped picture crops the side you drag; moving the box stops at 45 % and the project still saves", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  const card = page.getByRole("region", { name: "Picture" });
  await card.getByRole("button", { name: "Flip ↔" }).click();
  await card.getByTestId("crop-mode").click();
  const drag = async (id: string, dx: number) => {
    const h = (await page.getByTestId(id).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
  };
  // the handle on the left of the screen is the flipped picture's right edge
  await drag("crop-l", 60);
  const left = card.getByRole("slider", { name: "Left", exact: true });
  const right = card.getByRole("slider", { name: "Right", exact: true });
  await expect
    .poll(async () => Number(await right.inputValue()))
    .toBeGreaterThan(3);
  expect(Number(await left.inputValue())).toBe(0);
  // a box half as wide, pushed far to one side: no edge past 45 %
  for (const edge of ["Left", "Right"]) {
    const box = card.getByRole("textbox", {
      name: `${edge} percent`,
      exact: true,
    });
    await box.fill("25");
    await box.press("Enter");
  }
  await drag("crop-box", -2000);
  await expect
    .poll(async () =>
      Math.max(
        Number(await left.inputValue()),
        Number(await right.inputValue()),
      ),
    )
    .toBe(45);
  await page.getByTestId("crop-done").click();
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
});

test("timeline: dragging a file shows a shadow where it lands; dragging a Video 1 clip makes room", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  await upload(page, "grey.mp4");
  await expect(main).toHaveCount(2);
  // a file from My Assets over the overlay track: a dashed shadow as long as the file
  const tile = page
    .getByTestId("assets")
    .getByRole("button", { name: "grey.mp4", exact: true })
    .first();
  const lane = page.getByTestId("lane-overlay").first();
  const lb = (await lane.boundingBox())!;
  // (the drag events themselves: a mouse gesture doesn't start a browser drag in the test browser)
  const dt = await page.evaluateHandle(() => new DataTransfer());
  const at = {
    dataTransfer: dt,
    clientX: lb.x + 180,
    clientY: lb.y + lb.height / 2,
  };
  await tile.dispatchEvent("dragstart", { dataTransfer: dt });
  await lane.dispatchEvent("dragenter", at);
  await lane.dispatchEvent("dragover", at);
  const shadow = page.getByTestId("drop-shadow");
  await expect(shadow).toBeVisible();
  const sh = (await shadow.boundingBox())!;
  const greyOnMain = (await main.nth(1).boundingBox())!;
  expect(Math.abs(sh.width - greyOnMain.width)).toBeLessThan(4);
  await lane.dispatchEvent("drop", at);
  await tile.dispatchEvent("dragend", { dataTransfer: dt });
  const pip = page
    .getByTestId("lane-overlay")
    .first()
    .getByTestId("timeline-clip");
  await expect(pip).toHaveCount(1);
  expect(Math.abs((await pip.boundingBox())!.x - sh.x)).toBeLessThan(4);
  await expect(shadow).toHaveCount(0);
  // Video 1: drag the second clip to the front; the first one slides over to make room
  const first0 = (await main.nth(0).boundingBox())!;
  const second = (await main.nth(1).boundingBox())!;
  await page.mouse.move(
    second.x + second.width / 2,
    second.y + second.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(first0.x + 4, second.y + second.height / 2, {
    steps: 12,
  });
  await expect(shadow).toBeVisible();
  await expect
    .poll(async () => (await main.nth(0).boundingBox())!.x)
    .toBeGreaterThan(first0.x + 10);
  await page.mouse.up();
  await expect(main.nth(0)).toHaveAttribute("title", /grey/);
});

test("timeline follows the playing playhead smoothly (no page jumps); scrolling yourself stops it; the rail lists what you add", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Panels" }).getByRole("button"),
  ).toHaveText([
    // (what you add to the video; projects are in the project menu, settings on the right)
    /Media/,
    /Text/,
    /Elements/,
    /Audio/,
    /Captions/,
    /Transitions/,
    /Effects/,
    /Templates/,
    /Brand Kit/,
    /^AI$/,
  ]);
  await upload(page);
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  await upload(page, "grey.mp4");
  await expect(main).toHaveCount(2);
  const scroller = page.getByTestId("timeline-scroller");
  // zoom in until the timeline is much wider than its box
  for (let i = 0; i < 6; i++) {
    const [sw, cw] = await scroller.evaluate((el) => [
      el.scrollWidth,
      el.clientWidth,
    ]);
    if (sw > cw * 3) break;
    await page.getByRole("button", { name: "Zoom in the timeline" }).click();
  }
  await page.getByLabel("Program preview. Space plays or pauses.").focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Play" }).click();
  // sample while it plays: the timeline pages ahead smoothly, and the red line stays in view
  const samples: { left: number; line: number; mid: number; right: number }[] = [];
  for (let i = 0; i < 30; i++) {
    samples.push(
      await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          '[data-testid="timeline-scroller"]',
        )!;
        const line = document
          .querySelector<HTMLElement>('[data-testid="playhead"]')!
          .getBoundingClientRect().left;
        const lanes = document
          .querySelector<HTMLElement>('[data-testid="lane-main"]')!
          .getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
          left: el.scrollLeft,
          line,
          right: r.right,
          mid:
            Math.max(lanes.left, r.left) +
            (r.right - Math.max(lanes.left, r.left)) / 2,
        };
      }),
    );
    await page.waitForTimeout(100);
  }
  const moved = samples.filter((s) => s.left > 0);
  expect(moved.length).toBeGreaterThan(5);
  const view = await scroller.evaluate((el) => el.clientWidth);
  for (let i = 1; i < samples.length; i++)
    expect(samples[i].left - samples[i - 1].left, "no page jumps").toBeLessThan(
      view,
    );
  // (it pages ahead before the red line reaches the right edge: the line is always in view)
  for (const s of samples)
    expect(s.line, "the red line stays in view").toBeLessThan(s.right);
  // scrolling the timeline yourself: it stays where you put it
  await scroller.evaluate((el) => (el.scrollLeft = 0));
  await page.waitForTimeout(600);
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeLessThan(5);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
});

test("keyframes: ◆ at the playhead; a change later adds one and the clip glides between; diamonds on the timeline; saved; exported", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  const card = page.getByRole("region", { name: "Picture" });
  const bar = card.getByTestId("keyframe-bar");
  const count = bar.getByTestId("keyframe-count");
  await expect(count).toHaveText("0");
  const program = page.getByLabel("Program preview. Space plays or pauses.");
  const go = async (keys: string[]) => {
    await program.focus();
    for (const k of keys) await page.keyboard.press(k);
  };
  // at the start: a keyframe
  await go(["Home"]);
  await bar.getByRole("button", { name: "Add keyframe" }).click();
  await expect(count).toHaveText("1");
  // 2 s later: a bigger size adds the second one there (like CapCut)
  await go(["Shift+ArrowRight", "Shift+ArrowRight"]);
  const size = card.getByRole("textbox", { name: "Size" });
  await size.fill("200");
  await size.press("Enter");
  await expect(count).toHaveText("2");
  const diamonds = page
    .getByRole("region", { name: "Timeline" })
    .getByTestId("keyframe");
  await expect(diamonds).toHaveCount(2);
  // halfway: in between
  await go(["Shift+ArrowLeft"]);
  await expect
    .poll(async () => Number(await size.inputValue()))
    .toBeGreaterThan(110);
  expect(Number(await size.inputValue())).toBeLessThan(190);
  await expect(bar.getByRole("button", { name: "Add keyframe" })).toBeVisible();
  // ▶ / ◀ go to the keyframes
  await bar.getByRole("button", { name: "Next keyframe" }).click();
  await expect(size).toHaveValue("200");
  await expect(
    bar.getByRole("button", { name: "Remove keyframe" }),
  ).toBeVisible();
  await bar.getByRole("button", { name: "Previous keyframe" }).click();
  await expect(size).toHaveValue("100");
  // the move to the next one can be steady instead of smooth
  await bar.getByRole("radio", { name: "Steady" }).click();
  await expect(bar.getByRole("radio", { name: "Steady" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // drag the second diamond a bit to the right: one undo step puts it back
  const d2 = (await diamonds.nth(1).boundingBox())!;
  await page.mouse.move(d2.x + d2.width / 2, d2.y + d2.height / 2);
  await page.mouse.down();
  await page.mouse.move(d2.x + d2.width / 2 + 40, d2.y + d2.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await diamonds.nth(1).boundingBox())!.x)
    .toBeGreaterThan(d2.x + 20);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => Math.abs((await diamonds.nth(1).boundingBox())!.x - d2.x))
    .toBeLessThan(3);
  // saved with the project
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  const saved = proj.doc.tracks
    .flatMap(
      (t: {
        clips: { keyframes?: { t: number; scale: number; ease?: string }[] }[];
      }) => t.clips,
    )
    .find((c: { keyframes?: unknown[] }) => c.keyframes);
  expect(saved.keyframes.map((k: { scale: number }) => k.scale)).toEqual([
    1, 2,
  ]);
  expect(saved.keyframes[0].ease).toBe("linear");
  // an MP4 with the moving picture
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  await dialog.getByRole("button", { name: "Close" }).first().click();
  // Reset (Basic) takes the keyframes away
  await card.getByTestId("reset-menu-button").click();
  await page
    .getByRole("menu", { name: "Reset" })
    .getByRole("menuitem", { name: "Reset Adjust" })
    .click();
  await expect(count).toHaveText("0");
  await expect(diamonds).toHaveCount(0);
});

test("Edit panel: the editing tools for the selected clip, and its settings", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await openPanel(page, "Edit");
  const panel = page.getByTestId("edit-panel");
  await expect(panel).toContainText("Video:");
  await panel.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  await panel.getByRole("button", { name: /Color ·/ }).click();
  await expect(
    page.getByRole("tab", { name: "Color", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await panel.getByRole("button", { name: "Keyframe" }).click();
  await panel.getByRole("button", { name: /Adjust ·/ }).click();
  await expect(page.getByTestId("keyframe-count")).toHaveText("1");
});

test("Brand Kit logo: a box in a brand color, rounded corners, a part of the video, a fade; switched off and on it comes back the same", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Brand Kit", exact: true })
    .click();
  const panel = page.getByTestId("brand-panel");
  // a brand color: a click on it copies it, it doesn't go away
  await panel.getByRole("button", { name: "Add color" }).click();
  const swatch = panel
    .getByRole("button", { name: /Brand color #.*copy the code/ })
    .first();
  await swatch.click();
  await expect(swatch).toBeVisible();
  await panel
    .getByTestId("brand-logo-input")
    .setInputFiles(join(FIX, "site.png"));
  await expect(panel.getByRole("img", { name: "Your logo" })).toBeVisible({
    timeout: 20_000,
  });
  const on = panel.getByRole("switch", { name: "Show my logo on this video" });
  await on.click();
  await panel.getByRole("button", { name: "Bottom left" }).click();
  await panel.getByRole("switch", { name: "A box behind the logo" }).click();
  // a new box starts white
  await expect(panel.getByLabel("Box color (any color)")).toHaveValue(
    "#ffffff",
  );
  await panel
    .getByRole("group", { name: "Box color" })
    .getByRole("button", { name: /Brand color/ })
    .first()
    .click();
  const corners = panel.getByRole("textbox", { name: "Round corners" });
  await corners.fill("20");
  await corners.press("Enter");
  await panel
    .getByRole("combobox", { name: "Logo comes in" })
    .selectOption("fade");
  await panel.getByRole("switch", { name: "The whole video" }).click();
  const saved = async () => {
    await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
      timeout: 15_000,
    });
    const id = new URL(page.url()).searchParams.get("p");
    return (await savedProject(page, id)).doc
      .watermark;
  };
  await expect.poll(async () => (await saved())?.plate?.pad).toBe(0.15);
  const wm = await saved();
  expect(wm).toMatchObject({
    corner: "bl",
    radius: 0.2,
    anim: { in: "fade" },
    from: 0,
  });
  // off, then on again: the same look (the Brand Kit remembered it)
  await on.click();
  await expect.poll(async () => (await saved()) ?? null).toBeNull();
  await on.click();
  await expect.poll(async () => (await saved())?.corner).toBe("bl");
  expect(await saved()).toMatchObject({
    radius: 0.2,
    plate: { pad: 0.15 },
    anim: { in: "fade" },
  });
  // an MP4 with the drawn badge
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  await page.request.put("/api/brand", {
    data: { logo: null, colors: [], logoLook: null },
  });
});

test("Text: more styles (with effects and new animations); Transitions: wipes, circles, zoom, spin", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page.getByRole("button", { name: /Add Subscribe button/ }).click();
  const card = page.getByRole("region", { name: "Text", exact: true });
  await expect(
    card.getByRole("textbox", { name: "Text", exact: true }),
  ).toHaveText("SUBSCRIBE");
  await expect(card.getByRole("combobox", { name: "Comes in" })).toHaveValue(
    "pop",
  );
  // effects: an outline
  await card.getByTestId("text-effects").locator("summary").click();
  await card.getByRole("switch", { name: "Outline" }).click();
  await expect(
    card.getByRole("textbox", { name: "Outline width" }),
  ).toBeVisible();
  // typewriter is offered for text
  await card
    .getByRole("combobox", { name: "Comes in" })
    .selectOption("typewriter");
  // transitions: the new ones are there
  await upload(page, "grey.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(2);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Transitions", exact: true })
    .click();
  const tp = page.getByTestId("transitions-panel");
  for (const name of ["Wipe left", "Circle open", "Zoom in", "Spin"])
    await expect(
      tp.getByRole("button", { name: new RegExp(`Add ${name}`) }),
    ).toBeVisible();
  await tp.getByRole("button", { name: /Add Wipe left/ }).click();
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  expect(JSON.stringify(proj.doc)).toContain('"wipeLeft"');
  expect(JSON.stringify(proj.doc)).toContain('"typewriter"');
});

test("an empty timeline: the first thing dropped starts at 0", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  // empty again
  await page.getByTestId("timeline-clip").first().click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(0);
  const tile = page
    .getByTestId("assets")
    .getByRole("button", { name: "site.png", exact: true })
    .first();
  const lane = page.getByTestId("lane-overlay").first();
  const lb = (await lane.boundingBox())!;
  const dt = await page.evaluateHandle(() => new DataTransfer());
  const at = {
    dataTransfer: dt,
    clientX: lb.x + lb.width * 0.7,
    clientY: lb.y + lb.height / 2,
  };
  await tile.dispatchEvent("dragstart", { dataTransfer: dt });
  await lane.dispatchEvent("dragover", at);
  await lane.dispatchEvent("drop", at);
  await tile.dispatchEvent("dragend", { dataTransfer: dt });
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  const clip = proj.doc.tracks.flatMap(
    (t: { clips: { start?: number }[] }) => t.clips,
  )[0];
  expect(clip.start ?? 0).toBe(0);
});

test("top bar: no second panel menu; ⌘K Search tools runs tools and opens panels; the size icon changes size and frame rate; AI status", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  await expect(page.getByRole("navigation", { name: "Main menu" })).toHaveCount(
    0,
  );

  // ⌘K → "brand" → Enter opens Brand Kit
  const palette = page.getByRole("dialog", { name: "Search tools" });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette).toBeVisible();
  const box = palette.getByRole("combobox", { name: "Search tools" });
  await expect(box).toBeFocused();
  await box.fill("brand");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.locator("#side-title")).toHaveText("Brand Kit");
  // a tool that can't be used says why (nothing to redo)
  await page.getByRole("button", { name: /Search tools/ }).click();
  await box.fill("redo");
  await expect(palette.getByRole("option", { name: /Redo/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(palette.getByText("Nothing to redo.")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  // "split" at 1 s cuts the clip in two
  const program = page.getByLabel("Program preview. Space plays or pauses.");
  await program.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("ControlOrMeta+k");
  await box.fill("split");
  await expect(palette.getByRole("option").first()).toContainText("Split");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  // ⌘K again closes it
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette).toBeHidden();

  // the project's size is an icon: its facts in the name and the panel; 9:16 and 25 fps from there
  const facts = page.getByRole("button", { name: /^Project settings:/ });
  // (a file kept in this browser: its frame rate isn't known, the project starts at 30)
  await expect(facts).toHaveAccessibleName(
    /1280×720 · 16:9 · (24|30) fps · 0:04 · 2 clips/,
  );
  await facts.click();
  const settings = page.getByRole("dialog", { name: "Project settings" });
  await settings.getByRole("button", { name: "9:16" }).click();
  await expect(page.getByTestId("program-caption")).toContainText(
    "1080 × 1920",
  );
  await settings
    .getByRole("group", { name: "Frame rate" })
    .getByRole("button", { name: "25" })
    .click();
  await expect(settings.getByTestId("project-facts-line")).toContainText(
    "25 fps",
  );
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  expect(proj.doc.canvas).toMatchObject({ width: 1080, height: 1920, fps: 25 });

  // API keys: in the top bar's ⋯ menu (the key itself is never on the page)
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /API keys/ }).click();
  await expect(page.getByRole("dialog", { name: "API keys" })).toBeVisible();
});

test("focus mode hides the side panels for a big preview; F, Esc and the rail bring them back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  const stage = page.getByTestId("program-stage");
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector).toBeVisible();
  const w0 = (await stage.boundingBox())!.width;
  // focus mode is in the top bar's ⋯ menu (what isn't needed all the time)
  const focusItem = async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    return page.getByRole("menu", { name: "More" }).getByRole("menuitemradio", { name: /^Focus mode/ });
  };
  await (await focusItem()).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.locator("#side-title")).toHaveCount(0);
  await expect
    .poll(async () => (await stage.boundingBox())!.width)
    .toBeGreaterThan(w0 + 60);
  // Esc brings them back; F hides them again; a rail button leaves focus mode with that panel open
  await page.getByLabel("Program preview. Space plays or pauses.").focus();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeVisible();
  await page.keyboard.press("f");
  await expect(inspector).toHaveCount(0);
  // with a popup open, Esc only closes the popup
  await page.getByRole("button", { name: /^Background tasks/ }).click();
  const list = page.getByRole("dialog", { name: "Background tasks" });
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(inspector).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await expect(inspector).toBeVisible();
  await expect(page.locator("#side-title")).toHaveText("Text");
  await expect(await focusItem()).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
});

test("project menu: switch to another saved project, duplicate this one; background tasks list an export", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  await page.getByRole("textbox", { name: "Project name" }).fill("Red one");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const first = new URL(page.url()).searchParams.get("p");
  // a second project
  await page.getByRole("button", { name: "Project menu" }).click();
  await page
    .getByRole("menuitem", { name: "New project", exact: true })
    .click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(0);
  await expect(page).not.toHaveURL(/p=/);
  await upload(page, "blue.mp4");
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const second = new URL(page.url()).searchParams.get("p");
  expect(second).not.toBe(first);
  // ▾ lists the saved projects (this one ticked); a click switches
  await page.getByRole("button", { name: "Project menu" }).click();
  const menu = page.getByRole("menu", { name: "Project menu" });
  await expect(
    menu.getByRole("menuitemradio", { name: /blue/ }).first(),
  ).toHaveAttribute("aria-checked", "true");
  await menu
    .getByRole("menuitemradio", { name: /Red one/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`p=${first}`));
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Red one",
  );
  // Rename… focuses the name
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await expect(
    page.getByRole("textbox", { name: "Project name" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  // Duplicate: a copy, opened
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByRole("menuitem", { name: /Duplicate/ }).click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "Red one copy",
  );
  const copy = new URL(page.url()).searchParams.get("p");
  expect(copy).not.toBe(first);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);

  // an export shows in Background tasks while it runs, then under Recently finished; a click opens Export & Share
  const tasks = page.getByRole("button", { name: /^Background tasks/ });
  await expect(tasks).toHaveAccessibleName("Background tasks: nothing running");
  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("menuitem", { name: /MP4 · project size/ }).click();
  // (a short clip exports in a moment: "Export ready" is only listed for an export seen running)
  await expect(page.getByTestId("export-button")).toContainText("Export ✓", {
    timeout: 120_000,
  });
  const share = page.getByRole("dialog", { name: "Export & Share" });
  if (await share.isVisible()) await page.keyboard.press("Escape");
  await expect(share).toBeHidden();
  await tasks.click();
  const list = page.getByRole("dialog", { name: "Background tasks" });
  const ready = list.getByTestId("task").filter({ hasText: "Export ready" });
  await expect(ready).toHaveAttribute("data-state", "done");
  await expect(list.getByText("Recently finished")).toBeVisible();
  await ready.click();
  await expect(share).toBeVisible();
});

test("versions: save one, change the timeline, restore it (what you had is kept as an automatic version, ⌘Z undoes); delete", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  // Versions… is in the top bar's ⋯ menu; it opens the Versions window
  const open = {
    click: async () => {
      await page.getByRole("button", { name: "More", exact: true }).click();
      await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: /^Versions…/ }).click();
    },
  };
  await open.click();
  const pop = page.getByRole("dialog", { name: "Versions" });
  await pop.getByRole("textbox", { name: "Version name" }).fill("One clip");
  await pop.getByRole("button", { name: "Save", exact: true }).click();
  await expect(pop.getByText("✓ Saved “One clip”.")).toBeVisible();
  await expect(pop.getByTestId("version")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  // change: split in two
  await page.getByLabel("Program preview. Space plays or pauses.").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("s");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  // restore
  await open.click();
  await pop.getByRole("button", { name: "Restore One clip" }).click();
  await page
    .getByRole("dialog", { name: "Restore Version" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await expect(page.getByText(/Restored “One clip”/)).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  // ⌘Z brings back the two clips
  await page.getByLabel("Program preview. Space plays or pauses.").focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  // (saved)
  const id = new URL(page.url()).searchParams.get("p");
  await expect
    .poll(
      async () =>
        (
          await savedProject(page, id)
        ).doc.tracks.reduce(
          (a: number, t: { clips: unknown[] }) => a + t.clips.length,
          0,
        ),
      { timeout: 15_000 },
    )
    .toBe(2);
  // the automatic backup is listed (also after a reload), and a version can be deleted
  await page.reload();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await open.click();
  await expect(pop.getByTestId("version")).toHaveCount(2);
  await expect(pop.getByTestId("version").first()).toContainText(
    "Before restoring “One clip”",
  );
  await expect(pop.getByTestId("version").first()).toContainText("automatic");
  await pop.getByRole("button", { name: "Delete One clip" }).click();
  await page
    .getByRole("dialog", { name: "Delete Version" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(pop.getByTestId("version")).toHaveCount(1);
});

test("turn a clip from its corners (or the dot above it): the angle shows while turning; [ and ] turn it too", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await selectFirstVideo(page);
  // (the dot on a stem above the box turns it too)
  await expect(page.getByTestId("rotate-handle")).toHaveCount(1);
  await expect(page.getByTestId("rotate-corner")).toHaveCount(4);
  // room around the frame
  await page.getByRole("button", { name: "Zoom out the preview" }).click();
  await page.getByRole("button", { name: "Zoom out the preview" }).click();
  await page.getByRole("button", { name: "Zoom out the preview" }).click();
  const sel = (await page.getByTestId("selection-box").boundingBox())!;
  const zone = (await page.getByTestId("rotate-corner").nth(1).boundingBox())!;
  const cx = sel.x + sel.width / 2;
  const cy = sel.y + sel.height / 2;
  const gx = zone.x + zone.width * 0.8;
  const gy = zone.y + zone.height * 0.2;
  const r = Math.hypot(gx - cx, gy - cy);
  const a0 = Math.atan2(gy - cy, gx - cx);
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const a = a0 + (i / 10) * ((30 * Math.PI) / 180);
    await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  await expect(page.getByTestId("turn-angle")).toHaveText("30°");
  await page.mouse.up();
  await expect(page.getByTestId("turn-angle")).toHaveCount(0);
  const selBox = page.getByTestId("selection-box");
  await expect(selBox).toHaveAttribute("data-rotation", "30");
  // keys: ] +1°, Shift+[ −15°
  await selBox.focus();
  await page.keyboard.press("]");
  await expect(selBox).toHaveAttribute("data-rotation", "31");
  await page.keyboard.press("Shift+BracketLeft");
  await expect(selBox).toHaveAttribute("data-rotation", "16");
  // saved with the clip
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  expect(
    proj.doc.tracks.find((t: { kind: string }) => t.kind === "main").clips[0]
      .transform.rotation,
  ).toBe(16);
});

test("tablets and phones: the top bar stays one line (search, help, theme and API keys are under ⋯)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  const header = page.locator("header").first();
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(57);
  await expect(
    page.getByRole("button", { name: "Help and keyboard shortcuts" }),
  ).toBeHidden();
  await expect(page.getByTestId("theme-cycle")).toBeHidden();
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(
    menu.getByRole("menuitemradio", { name: "Dark" }),
  ).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await more.click();
  await menu.getByRole("menuitem", { name: /Search tools/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Search tools" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await more.click();
  await menu.getByRole("menuitem", { name: /API keys/ }).click();
  await expect(page.getByRole("dialog", { name: "API keys" })).toBeVisible();
});

test("My Assets: every card is the same size (a tall video shows whole), names use the whole width, pictures show no length", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page, "export-shorts.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  const tiles = page.getByTestId("assets").locator("li");
  const tall = tiles
    .filter({
      has: page.getByRole("button", { name: "export-shorts.mp4", exact: true }),
    })
    .first();
  const pic = tiles
    .filter({
      has: page.getByRole("button", { name: "site.png", exact: true }),
    })
    .first();
  const other = tiles
    .filter({
      hasNot: page.getByRole("button", {
        name: /export-shorts\.mp4|site\.png/,
      }),
    })
    .first();
  const h = async (l: Locator) => Math.round((await l.boundingBox())!.height);
  if (await other.count())
    expect(Math.abs((await h(tall)) - (await h(other)))).toBeLessThanOrEqual(1);
  expect(Math.abs((await h(tall)) - (await h(pic)))).toBeLessThanOrEqual(1);
  // the thumbnail is 16:9 whatever the video's shape
  const thumb = (await tall
    .getByRole("button", { name: "export-shorts.mp4", exact: true })
    .boundingBox())!;
  expect(Math.abs(thumb.width / thumb.height - 16 / 9)).toBeLessThan(0.05);
  // the name has the card's width (the buttons are on the picture)
  const name = (await tall
    .getByText("export-shorts.mp4", { exact: true })
    .boundingBox())!;
  expect(name.width).toBeGreaterThan(thumb.width * 0.7);
  // (a card shows its length and size together: "0:04 · 304 KB"; a picture has no length)
  await expect(pic.getByText(/^\d+:\d\d\b/)).toHaveCount(0);
  await expect(tall.getByText(/^\d+:\d\d\b/)).toHaveCount(1);
  // + and delete are on the picture
  await expect(
    tall.getByRole("button", { name: "Add export-shorts.mp4 to the timeline" }),
  ).toBeVisible();
  await tall.hover();
  await expect(
    // (delete is in the card's options menu)
    tall.getByRole("button", { name: "Options for export-shorts.mp4" }),
  ).toBeVisible();
});

test("Elements: search, add, recolor, stretch and turn a box; emoji, words, a moving ticker, the logo tile; undo; saved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page, "grey.mp4");
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Elements", exact: true })
    .click();
  const panel = page.getByTestId("elements-panel");
  await expect(
    page.getByRole("heading", { name: "Elements", level: 2 }),
  ).toBeVisible();
  await expect(panel.getByText("Soon")).toHaveCount(0);
  // search
  const search = panel.getByRole("searchbox", { name: "Search elements" });
  await search.fill("arrow");
  await expect(
    panel.getByRole("button", { name: "Add Arrow", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Add Box", exact: true }),
  ).toHaveCount(0);
  await search.fill("");
  // a box: an element clip, drawn in the middle of the 1280 × 720 program
  await panel.getByRole("button", { name: "Add Box", exact: true }).click();
  const elClips = page.locator(
    '[data-testid="timeline-clip"][data-type="element"]',
  );
  await expect(elClips).toHaveCount(1);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  const rgbAt = (x: number, y: number) =>
    page
      .getByTestId("program-canvas")
      .evaluate(
        (el, [px, py]) => [
          ...(el as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(px, py, 1, 1).data,
        ],
        [x, y],
      );
  await expect
    .poll(async () => (await rgbAt(640, 360))[2], { timeout: 10_000 })
    .toBeGreaterThan(200);
  // its fill → green
  const card = page.getByRole("region", { name: "Element", exact: true });
  await expect(card.getByTestId("element-name")).toHaveText("Box");
  await card.locator('input[type="color"][aria-label="Fill"]').fill("#22c55e");
  await expect
    .poll(async () => (await rgbAt(640, 360))[1])
    .toBeGreaterThan(150);
  // stretch it from its right side: wider, the left side stays put
  const sel = page.getByTestId("selection-box");
  await expect(page.getByTestId("stretch-handle")).toHaveCount(4);
  const b0 = (await sel.boundingBox())!;
  const hb = (await page
    .locator('[data-testid="stretch-handle"][data-edge="r"]')
    .boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await sel.boundingBox())!.width - b0.width)
    .toBeGreaterThan(60);
  expect(Math.abs((await sel.boundingBox())!.x - b0.x)).toBeLessThan(2);
  // turned upright (Shift+] six times: 90°) it keeps its length (no size jump at a quarter turn)
  const w0 = await sel.getAttribute("data-size");
  await sel.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+BracketRight");
  await expect(sel).toHaveAttribute("data-rotation", "90");
  expect(await sel.getAttribute("data-size")).toBe(w0);
  // undo: the quick turns were one step
  await page.keyboard.press("ControlOrMeta+z");
  await expect(sel).toHaveAttribute("data-rotation", "0");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(sel).toHaveAttribute("data-rotation", "90");
  // emoji: from the list, and any emoji
  await search.fill("fire");
  await panel
    .getByRole("button", { name: "Add emoji: fire", exact: true })
    .click();
  await expect(elClips.filter({ hasText: "🔥" })).toHaveCount(1);
  await search.fill("");
  await panel.getByRole("textbox", { name: "Any emoji" }).fill("🦄");
  await panel.getByRole("button", { name: "Add emoji 🦄" }).click();
  await expect(elClips.filter({ hasText: "🦄" })).toHaveCount(1);
  // a sticker's words
  await panel
    .getByRole("button", { name: "Add WOW! burst", exact: true })
    .click();
  await card.getByRole("textbox", { name: "Words" }).fill("YES!");
  await expect(elClips.filter({ hasText: "YES!" })).toHaveCount(1);
  // the ticker's words move while it plays
  await panel
    .getByRole("button", { name: "Add News ticker", exact: true })
    .click();
  await expect(elClips).toHaveCount(5);
  const row = () =>
    page
      .getByTestId("program-canvas")
      .evaluate((el) =>
        [
          ...(el as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(300, 693, 900, 1).data,
        ].join(","),
      );
  await page.waitForTimeout(400);
  const r0 = await row();
  const program = page
    .getByRole("region", { name: "Preview" })
    .getByLabel("Program preview. Space plays or pauses.");
  await program.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(700);
  await page.keyboard.press("Space");
  expect(await row()).not.toBe(r0);
  // the logo tile: your Brand Kit logo in a corner (without one: the Brand Kit opens)
  const logoTile = panel.getByRole("button", {
    name: /^(Add )?Logo in the corner/,
  });
  if (
    /Brand Kit first/.test((await logoTile.getAttribute("aria-label")) ?? "")
  ) {
    await logoTile.click();
    await expect(
      page.getByRole("heading", { name: "Brand Kit", level: 2 }),
    ).toBeVisible();
  } else {
    await logoTile.click();
    await expect(page.getByTestId("logo-card")).toBeVisible();
  }
  // saved, and there after a reload
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  const saved = proj.doc.tracks
    .flatMap((t: { clips: { type: string }[] }) => t.clips)
    .filter((c: { type: string }) => c.type === "element");
  expect(saved).toHaveLength(5);
  const box = saved.find(
    (c: { el: { preset?: string } }) => c.el.preset === "box",
  );
  expect(box.el.fill).toBe("#22c55e");
  expect(box.el.aspect).toBeGreaterThan(1.7);
  expect(box.transform.rotation).toBe(90);
  await page.reload();
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="element"]'),
  ).toHaveCount(5);
});

test("Elements export: a timeline of only elements makes an MP4 with them in it (a box, a progress bar that fills)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Elements", exact: true })
    .click();
  const panel = page.getByTestId("elements-panel");
  await panel.getByRole("button", { name: "Add Box", exact: true }).click();
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="element"]'),
  ).toHaveCount(1);
  await panel
    .getByRole("button", { name: "Add Progress bar", exact: true })
    .click();
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="element"]'),
  ).toHaveCount(2);
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  const href = (await dialog
    .getByRole("link", { name: /Download video \(MP4\)/ })
    .getAttribute("href"))!;
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const file = join(FIX, "export-elements.mp4");
  writeFileSync(file, await downloadBytes(page, href));
  const px = (t: number, x: number, y: number) => [
    ...execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(t),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `crop=1:1:${x}:${y},format=rgba`,
      "-f",
      "rawvideo",
      "pipe:1",
    ]),
  ];
  // the blue box in the middle of the 1920 × 1080 video
  const mid = px(1, 960, 540);
  expect(mid[2]).toBeGreaterThan(200);
  expect(mid[0]).toBeLessThan(100);
  // the bar along the bottom edge (5 s): a quarter full at 1.25 s, three quarters at 3.75 s
  expect(px(1.25, 100, 1075)[0]).toBeGreaterThan(180);
  expect(px(1.25, 1000, 1075)[0]).toBeLessThan(120);
  expect(px(3.75, 1000, 1075)[0]).toBeGreaterThan(180);
});

test("phones: Elements & Stickers opens from the More sheet, and an emoji can be added", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  // (phones: the bottom bar edits the selected clip; Done goes back to the tools, More lists the panels)
  const done = page.getByRole("button", { name: "Done editing clip" });
  if (await done.isVisible()) await done.click();
  await page.getByRole("navigation", { name: "Mobile Editing Tools" }).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Elements & Stickers" }).click();
  const panel = page.getByTestId("elements-panel");
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Add emoji: thumbs up", exact: true })
    .click();
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="element"]'),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Blank scenes: + after the last clip adds a 3 s black blank; drag it anywhere on Video 1 (not onto an overlay); right-click before / after; its color, length and a title on it; saved", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await upload(page, "red.mp4");
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  await upload(page, "yellow.mp4");
  await expect(main).toHaveCount(2);
  const types = () =>
    main.evaluateAll((els) =>
      els.map((e) => (e as HTMLElement).dataset.type).join(","),
    );
  const length = page.getByTestId("timeline-length");
  await expect(length).toContainText("0:06.0");
  // + at the end of Video 1: a black 3 s blank, selected, the program black on it
  await page
    .getByRole("button", { name: "Add a blank scene at the end of Video 1" })
    .click();
  await expect.poll(types).toBe("video,video,blank");
  await expect(length).toContainText("0:09.0");
  const card = page.getByRole("region", { name: "Blank", exact: true });
  await expect(card).toBeVisible();
  const rgbAt = (x: number, y: number) =>
    page
      .getByTestId("program-canvas")
      .evaluate(
        (el, [px, py]) => [
          ...(el as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(px, py, 1, 1).data,
        ],
        [x, y],
      );
  await expect
    .poll(
      async () => (await rgbAt(320, 180)).slice(0, 3).reduce((a, b) => a + b),
      { timeout: 10_000 },
    )
    .toBeLessThan(40);
  // its color shows on the program; it gets longer like any clip
  await card.locator('input[type="color"][aria-label="Color"]').fill("#2255ff");
  await expect
    .poll(async () => (await rgbAt(320, 180))[2])
    .toBeGreaterThan(200);
  const len = card.getByRole("textbox", { name: "Length" });
  await len.fill("4");
  await len.press("Enter");
  await expect(length).toContainText("0:10.0");
  // a title on it: from its start (6 s), for 3 s
  await card.getByRole("button", { name: "Add a title on it" }).click();
  await expect(
    page.locator('[data-testid="timeline-clip"][data-type="text"]'),
  ).toHaveCount(1);
  // drag the blank to the start of Video 1
  const bl = (await main.nth(2).boundingBox())!;
  const f0 = (await main.nth(0).boundingBox())!;
  await page.mouse.move(bl.x + bl.width / 2, bl.y + bl.height / 2);
  await page.mouse.down();
  await page.mouse.move(bl.x + bl.width / 2 - 40, bl.y + bl.height / 2, {
    steps: 4,
  });
  await page.mouse.move(f0.x + 4, f0.y + f0.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(types).toBe("blank,video,video");
  // it never goes onto an overlay track: it stays on Video 1
  const b0 = (await main.nth(0).boundingBox())!;
  const ov = (await page.getByTestId("lane-overlay").first().boundingBox())!;
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b0.x + b0.width / 2 + 10, ov.y + ov.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(types).toBe("blank,video,video");
  await expect(
    page
      .getByTestId("lane-overlay")
      .getByTestId("timeline-clip")
      .filter({ has: page.locator('[data-type="blank"]') }),
  ).toHaveCount(0);
  // right-click the red clip: Add blank after
  const red = (await main.nth(1).boundingBox())!;
  await page.mouse.click(red.x + red.width / 2, red.y + red.height / 2, {
    button: "right",
  });
  await page
    .getByRole("menu", { name: "Clip" })
    .getByRole("menuitem", { name: "Add blank after" })
    .click();
  await expect.poll(types).toBe("blank,video,blank,video");
  // saved (and there after a reload)
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  const v1 = proj.doc.tracks.find(
    (t: { kind: string }) => t.kind === "main",
  ).clips;
  expect(v1.map((c: { type: string }) => c.type)).toEqual([
    "blank",
    "video",
    "blank",
    "video",
  ]);
  expect(v1[0]).toMatchObject({ fill: "#2255ff", duration: 4 });
  expect(v1[2]).toMatchObject({ fill: "#000000", duration: 3 });
  const title = proj.doc.tracks
    .flatMap((t: { clips: { type: string }[] }) => t.clips)
    .find((c: { type: string }) => c.type === "text");
  expect(title.start).toBeCloseTo(6, 1);
  expect(title.duration).toBe(3);
  await page.reload();
  await expect.poll(types).toBe("blank,video,blank,video");
});

test("Start with a blank on an empty project; its MP4 shows it; New project with a blank from the project menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start with a blank" }).click();
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  await expect(main.first()).toHaveAttribute("data-type", "blank");
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/, { timeout: 15_000 });
  const first = new URL(page.url()).searchParams.get("p");
  // red, then an MP4: red, 3 s
  await page
    .getByRole("region", { name: "Blank", exact: true })
    .locator('input[type="color"][aria-label="Color"]')
    .fill("#ff0000");
  await page.getByTestId("export-button").click();
  const dialog = page.getByRole("dialog", { name: "Export & Share" });
  await dialog.getByRole("button", { name: "Make video (MP4)" }).click();
  await expect(dialog.getByText("Your video is ready")).toBeVisible({
    timeout: 120_000,
  });
  const href = (await dialog
    .getByRole("link", { name: /Download video \(MP4\)/ })
    .getAttribute("href"))!;
  const { writeFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const file = join(FIX, "export-blank.mp4");
  writeFileSync(file, await downloadBytes(page, href));
  const px = [
    ...execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "1.5",
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "crop=1:1:960:540,format=rgba",
      "-f",
      "rawvideo",
      "pipe:1",
    ]),
  ];
  expect(px[0]).toBeGreaterThan(200);
  expect(px[1]).toBeLessThan(60);
  const d = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );
  expect(d).toBeGreaterThan(2.9);
  expect(d).toBeLessThan(3.2);
  await page.keyboard.press("Escape");
  // a new project that starts with a blank
  await page.getByRole("button", { name: "Project menu" }).click();
  await page
    .getByRole("menu", { name: "Project menu" })
    .getByRole("menuitem", { name: /^New project with a blank/ })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("p"), { timeout: 15_000 })
    .not.toBe(first);
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(main).toHaveCount(1);
  await expect(main.first()).toHaveAttribute("data-type", "blank");
});

test("polish: + overlay / + audio icons; the sideways scrollbar is under the lanes only; drags never select text", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(1);
  // two icons instead of "+ Track"
  const overlays = page.getByTestId("lane-overlay");
  const audios = page.getByTestId("lane-audio");
  const [o0, a0] = [await overlays.count(), await audios.count()];
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Add an overlay track" }).click();
  await expect(overlays).toHaveCount(o0 + 6);
  await page.getByRole("button", { name: "Add an audio track" }).click();
  await expect(audios).toHaveCount(a0 + 1);
  await expect(page.getByRole("button", { name: /^\+? ?Track$/ })).toHaveCount(
    0,
  );
  // the lanes scroll on their own: they start right of the track names
  const scroller = page.getByTestId("timeline-scroller");
  const heads = page.getByTestId("track-heads");
  const sb = (await scroller.boundingBox())!;
  const hb = (await heads.boundingBox())!;
  expect(Math.abs(sb.x - (hb.x + hb.width))).toBeLessThan(2);
  // scrolled down: the names stay level with their lanes
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect
    .poll(() => heads.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  const lastLane = (await audios.last().boundingBox())!;
  const lastHead = (await heads
    .locator(":scope > div")
    .nth((await overlays.count()) + (await audios.count()))
    .boundingBox())!;
  expect(Math.abs(lastLane.y - lastHead.y)).toBeLessThan(2);
  await scroller.evaluate((el) => (el.scrollTop = 0));
  // trim the end with the mouse: nothing on the page gets selected, and the drag look goes away after
  const end = page.getByRole("slider", { name: "End of veo.mp4" });
  // (six new overlay tracks sit above Video 1)
  await end.scrollIntoViewIfNeeded();
  const eb = (await end.boundingBox())!;
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await page.mouse.down();
  await page.mouse.move(eb.x - 60, eb.y + eb.height / 2 + 40, { steps: 8 });
  expect(await page.evaluate(() => document.documentElement.dataset.drag)).toBe(
    "trim",
  );
  await page.mouse.move(eb.x - 200, eb.y - 200, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");
  expect(
    await page.evaluate(() => document.documentElement.dataset.drag ?? null),
  ).toBeNull();
  // moving a clip too
  await main.first().scrollIntoViewIfNeeded();
  const cb = (await main.first().boundingBox())!;
  await page.mouse.move(cb.x + 30, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + 30, cb.y - 150, { steps: 10 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");
});

test("polish: the filmstrip keeps the frames' shape when zooming, and shows a removed background see-through", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  const clip = page
    .getByTestId("lane-main")
    .getByTestId("timeline-clip")
    .first();
  await expect(clip).toBeVisible();
  const film = clip.getByTestId("clip-film");
  const tile = film.getByTestId("film-tile").first();
  await expect(tile).toBeVisible();
  const shape = async () => {
    const b = (await tile.boundingBox())!;
    return b.width / b.height;
  };
  const s0 = await shape();
  // veo.mp4 is 16:9
  expect(Math.abs(s0 - 16 / 9)).toBeLessThan(0.1);
  await page.getByRole("button", { name: "Zoom in the timeline" }).click();
  await page.getByRole("button", { name: "Zoom in the timeline" }).click();
  expect(Math.abs((await shape()) - s0)).toBeLessThan(0.02);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  expect(Math.abs((await shape()) - s0)).toBeLessThan(0.02);
  // (a file kept on this computer gets its film made in the browser: a blob; an uploaded one the server's /film)
  const plain = await film.getAttribute("data-src");
  expect(plain).toMatch(/^blob:|\/film$/);
  // green removal on: the frames come see-through (new frames, for these settings), on a checkerboard
  await useDetectedGreen(page);
  await expect.poll(() => film.getAttribute("data-src"), { timeout: 15_000 }).not.toBe(plain);
  await expect(film).toHaveClass(/bg-checker-dark/);
});

test("polish: Cutout sliders stay put when their Reset appears; Custom preset is always listed", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await useDetectedGreen(page);
  await inspTab(page, "Cutout");
  await fineTune(page);
  const custom = page.getByRole("radio", { name: "Custom" });
  await expect(custom).toBeDisabled();
  const spill = page.getByRole("textbox", { name: "Spill strength" });
  const soft = page.getByRole("textbox", { name: "Edge softness" });
  // where it is inside the settings column (typing in a field scrolls the column to it: that's not a shift)
  const y = (l: Locator) =>
    l.evaluate(
      (el) =>
        el.getBoundingClientRect().top +
        (el.closest('[data-testid="inspector-scroll"]')?.scrollTop ?? 0),
    );
  const [y1, y2] = [await y(spill), await y(soft)];
  await soft.fill("0.16");
  await soft.press("Enter");
  await expect(
    page.getByRole("button", { name: "Reset", exact: true }).first(),
  ).toBeVisible();
  expect(Math.abs((await y(soft)) - y2)).toBeLessThan(1);
  await spill.fill("80");
  await spill.press("Enter");
  expect(Math.abs((await y(spill)) - y1)).toBeLessThan(1);
  await expect(custom).toBeChecked();
});

test("polish: side bars stretch only the width (or height), the opposite side staying put; elements keep their own stretch", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await selectFirstVideo(page);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Zoom out the preview" }).click();
  const box = page.getByTestId("selection-box");
  await expect(box.getByTestId("side-handle")).toHaveCount(4);
  const b0 = (await box.boundingBox())!;
  const r = (await box
    .locator('[data-testid="side-handle"][data-edge="r"]')
    .boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    r.x + r.width / 2 - b0.width * 0.3,
    r.y + r.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  const b1 = (await box.boundingBox())!;
  expect(Math.abs(b1.x - b0.x)).toBeLessThan(3);
  expect(b1.width).toBeLessThan(b0.width * 0.8);
  // a side resizes evenly (the shape stays; one-way stretch is W/H without the lock in the Transform numbers)
  expect(Math.abs(b1.height / b0.height - b1.width / b0.width)).toBeLessThan(0.03);
  // one drag is one undo step
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => Math.abs((await box.boundingBox())!.width - b0.width))
    .toBeLessThan(3);
  // an element: its own stretch handles (re-drawn sharp), not these
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Elements", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Add Box/ })
    .first()
    .click();
  await expect(box.getByTestId("stretch-handle")).toHaveCount(4);
  await expect(box.getByTestId("side-handle")).toHaveCount(0);
});

test("corner handles resize a clip without console errors or maximum update depth exceeded", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await selectFirstVideo(page);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Zoom out the preview" }).click();
  const box = page.getByTestId("selection-box");
  await expect(box.getByTestId("resize-handle")).toHaveCount(4);
  const b0 = (await box.boundingBox())!;
  const corner = (await box
    .getByTestId("resize-handle")
    .first()
    .boundingBox())!;
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    corner.x + corner.width / 2 + 40,
    corner.y + corner.height / 2 + 40,
    { steps: 15 },
  );
  await page.mouse.up();
  const b1 = (await box.boundingBox())!;
  expect(b1.width).toBeLessThan(b0.width);
  expect(errors.filter((e) => e.includes("Maximum update depth"))).toHaveLength(
    0,
  );
});

test("polish: split view shows Program and This clip side by side; one plays at a time; remembered", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await selectFirstVideo(page);
  const toggle = page.getByRole("button", {
    name: "Split view: Program and This clip",
  });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  const split = page.getByTestId("split-view");
  await expect(split).toBeVisible();
  // both, next to each other, each at the video's shape
  const pg = page.getByTestId("split-program");
  const cl = page.getByTestId("split-clip");
  await expect(cl.getByTestId("preview-frame")).toBeVisible();
  const [bp, bc] = [(await pg.boundingBox())!, (await cl.boundingBox())!];
  expect(bc.x).toBeGreaterThan(bp.x + bp.width - 2);
  expect(Math.abs(bp.y - bc.y)).toBeLessThan(2);
  // the Program / This clip switch isn't needed while both show
  await expect(page.getByRole("radio", { name: "Program" })).toHaveCount(0);
  // starting one pauses the other
  await pg.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    pg.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await cl.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    cl.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(
    pg.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await cl.getByRole("button", { name: "Pause", exact: true }).click();
  // remembered after a reload
  await page.reload();
  await expect(page.getByTestId("split-view")).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("button", { name: "Split view: Program and This clip" })
    .click();
  await expect(page.getByTestId("split-view")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Program" })).toHaveCount(1);
});

test("polish: more templates (News, YouTube, Social, Business) with elements and blank scenes", async ({
  page,
}) => {
  await page.goto("/");
  // (Templates is a panel; Browse all opens the full gallery)
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Browse all templates" }).click();
  const g = page.getByTestId("template-hub");
  // the starter templates are in the library's groups
  await g.getByRole("button", { name: "Business", exact: true }).click();
  for (const n of [
    "Company update",
    "Product launch",
    "Event invite",
    "We're hiring",
  ])
    await expect(
      g.getByRole("button", { name: `Use template ${n}`, exact: true }),
    ).toHaveCount(1);
  await g.getByRole("button", { name: "YouTube", exact: true }).click();
  await g.getByRole("button", { name: "Use template Countdown intro" }).click();
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/, { timeout: 15_000 });
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main).toHaveCount(3);
  await expect(main.first()).toHaveAttribute("data-type", "blank");
  await expect(
    page.getByTestId("lane-overlay").getByTestId("timeline-clip").first(),
  ).toBeVisible();
});

test("custom templates: your video + audio + a base look; in My Templates after a reload; used, renamed and deleted; the audio is in Audio → My uploads", async ({
  page,
}) => {
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Panels" });
  await rail.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "Browse all templates" }).click();
  const hub = page.getByTestId("template-hub");
  await hub.getByRole("button", { name: "Create template" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a template" });
  await dialog
    .getByTestId("create-template-video-input")
    .setInputFiles(join(FIX, "veo.mp4"));
  await expect(dialog.getByTestId("create-template-video")).toContainText(
    "16:9",
    { timeout: 60_000 },
  );
  await dialog
    .getByTestId("create-template-audio-input")
    .setInputFiles(join(FIX, "music.m4a"));
  await expect(dialog.getByTestId("create-template-audio")).toBeVisible({
    timeout: 60_000,
  });
  await dialog.getByRole("textbox", { name: "Template name" }).fill("My show");
  // the looks offered fit the video's shape; pick the first one
  const look = dialog.getByRole("combobox", { name: "Base look" });
  await look.selectOption({ index: 1 });
  const baseId = await look.inputValue();
  expect(baseId).not.toBe("");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toHaveCount(0);
  const card = hub.getByRole("button", { name: "Select My show", exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("custom-badge")).toBeVisible();
  await expect(
    hub.getByRole("button", { name: "My Templates", exact: true }),
  ).toBeVisible();
  // kept on the server
  await page.reload();
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Browse all templates" }).click();
  await expect(
    page
      .getByTestId("template-hub")
      .getByRole("button", { name: "Select My show", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  // use it: your video first on Video 1, your audio on an audio track, the look's titles on top
  await page
    .getByTestId("template-hub")
    .getByRole("button", { name: "Use template My show", exact: true })
    .click();
  await expect(page).toHaveURL(/\?p=[0-9a-f-]{36}$/, { timeout: 15_000 });
  const main = page.getByTestId("lane-main").getByTestId("timeline-clip");
  await expect(main.first()).toHaveAttribute("title", /veo\.mp4/, {
    timeout: 20_000,
  });
  await expect(
    page.getByTestId("lane-audio").getByTestId("timeline-clip").first(),
  ).toHaveAttribute("title", /music/);
  await expect(
    page.getByTestId("lane-overlay").getByTestId("timeline-clip").first(),
  ).toBeVisible();
  // the audio is in the Audio library
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Audio", exact: true })
    .click();
  const lib = page.getByTestId("audio-library");
  await lib.getByRole("tab", { name: "My uploads" }).click();
  await expect(lib.getByRole("list", { name: "Sounds" })).toContainText(
    "music",
    { timeout: 20_000 },
  );
  // rename, then delete (the files stay in My Assets)
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Browse all templates" }).click();
  const hub2 = page.getByTestId("template-hub");
  await hub2.getByRole("button", { name: "My Templates", exact: true }).click();
  // (a double-click on the name renames it; Delete asks first)
  await hub2.getByRole("heading", { name: "My show", exact: true, level: 3 }).dblclick();
  const rename = hub2.getByRole("textbox", { name: "Rename template" });
  await rename.fill("Evening show");
  await rename.press("Enter");
  await expect(
    hub2.getByRole("button", { name: "Select Evening show", exact: true }),
  ).toBeVisible();
  await hub2.getByRole("button", { name: "Delete Evening show" }).click();
  await page
    .getByRole("dialog", { name: "Delete Template" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    hub2.getByRole("button", { name: "Select Evening show", exact: true }),
  ).toHaveCount(0);
  const assets = (await (await page.request.get("/api/videos")).json()) as
    | { fileName: string }[]
    | { videos: { fileName: string }[] };
  expect(JSON.stringify(assets)).toContain("music");
});

test("every video plays: a see-through ProRes .mov and an .mkv get playable copies; a broken file says why", async ({
  page,
}) => {
  // (the Brand Kit picks its intro and outro from My Assets now; what mattered here is the upload)
  await page.goto("/");
  const { readFileSync } = await import("node:fs");
  const up = (name: string, type: string) =>
    page.request.post("/api/videos", {
      data: readFileSync(join(FIX, name)),
      headers: { "Content-Type": type, "X-File-Name": name },
    });
  const sting = ((await (await up("sting.mov", "video/quicktime")).json()) as { id: string }).id;
  const mkv = ((await (await up("clip.mkv", "video/x-matroska")).json()) as { id: string }).id;
  expect(sting && mkv).toBeTruthy();
  // the preview plays the copies (see-through VP9 / H.264); the originals stay for the export
  await expect
    .poll(async () => (await page.request.get(`/api/videos/${sting}/play`, { headers: { range: "bytes=0-99" } })).headers()["content-type"], { timeout: 90_000 })
    .toBe("video/webm");
  await expect
    .poll(async () => (await page.request.get(`/api/videos/${mkv}/play`, { headers: { range: "bytes=0-99" } })).headers()["content-type"], { timeout: 90_000 })
    .toBe("video/mp4");
  // a broken file is refused with a reason
  const bad = await up("broken.mov", "video/quicktime");
  expect(bad.ok()).toBe(false);
  expect((await bad.json()).error.message).toBeTruthy();
});

/** The middle of an element on the page. */
const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** Drag from one point to another with the mouse (Shift held when asked). */
async function dragBy(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  shift = false,
) {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

test("transform tools: corners keep the shape (Shift frees it), sides stretch one way, Skew and Perspective modes, Reset shape", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByTestId("timeline-clip").first().click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Zoom out the preview" }).click();
  const box = page.getByTestId("selection-box");
  const corner = (k: string) => box.locator(`[data-corner="${k}"]`);
  const shape = async () => {
    const b = (await box.boundingBox())!;
    return b.width / b.height;
  };
  // a corner: bigger, same shape, the opposite corner stays
  const tl0 = await centre(corner("tl"));
  const s0 = await shape();
  await dragBy(page, await centre(corner("br")), 60, 20);
  expect(Math.abs((await shape()) - s0)).toBeLessThan(0.02);
  const tl1 = await centre(corner("tl"));
  expect(Math.hypot(tl1.x - tl0.x, tl1.y - tl0.y)).toBeLessThan(3);
  // Shift: the shape changes (from the top-left corner: the bottom-right one is near the panel's edge now)
  await dragBy(page, await centre(corner("tl")), 60, -30, true);
  expect(Math.abs((await shape()) - s0)).toBeGreaterThan(0.1);
  // Skew mode: the bottom bar slants it
  const panel = await transformPanel(page);
  await page
    .getByTestId("transform-toolbar")
    .getByRole("button", { name: "Skew" })
    .click();
  await expect(box).toHaveAttribute("data-mode", "skew");
  await dragBy(
    page,
    await centre(box.locator('[data-testid="skew-handle"][data-edge="b"]')),
    50,
    0,
  );
  await expect
    .poll(async () =>
      Number(await panel.getByRole("textbox", { name: "Skew X" }).inputValue()),
    )
    .not.toBe(0);
  // Perspective mode: a corner moves on its own, onto the pointer
  await page
    .getByTestId("transform-toolbar")
    .getByRole("button", { name: "Perspective" })
    .click();
  const tr0 = await centre(corner("tr"));
  await dragBy(page, tr0, -30, 40);
  const tr1 = await centre(corner("tr"));
  expect(Math.hypot(tr1.x - (tr0.x - 30), tr1.y - (tr0.y + 40))).toBeLessThan(
    4,
  );
  // the outline follows the corners but doesn't tint the picture
  const outline = box.locator("svg polygon");
  await expect(outline).toBeVisible();
  await expect
    .poll(() => outline.evaluate((el) => getComputedStyle(el).fill))
    .toBe("none");
  await expect(panel.getByTestId("perspective-row")).toBeVisible();
  // Esc goes back to Transform; Reset shape takes away the stretch, skew and perspective
  await box.focus();
  await page.keyboard.press("Escape");
  await expect(box).toHaveAttribute("data-mode", "transform");
  await page
    .getByTestId("transform-toolbar")
    .getByRole("button", { name: "Reset shape" })
    .click();
  await expect(panel.getByRole("textbox", { name: "Skew X" })).toHaveValue("0");
  await expect(panel.getByRole("textbox", { name: "Scale X" })).toHaveValue(
    "100",
  );
  await expect(panel.getByTestId("perspective-row")).toHaveCount(0);
});

test("pivot and corners: turning keeps the pivot (moved to a corner) in place; the radius dot rounds the corners", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page.getByTestId("timeline-clip").first().click();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Zoom out the preview" }).click();
  const box = page.getByTestId("selection-box");
  const tl = await centre(box.locator('[data-corner="tl"]'));
  const pv = await centre(box.getByTestId("pivot-handle"));
  await dragBy(page, pv, tl.x - pv.x + 2, tl.y - pv.y + 2);
  const panel = await transformPanel(page);
  await expect(panel.getByRole("textbox", { name: "Pivot X" })).toHaveValue(
    "0",
  );
  // the picture didn't move when the pivot did
  const tlAfter = await centre(box.locator('[data-corner="tl"]'));
  expect(Math.hypot(tlAfter.x - tl.x, tlAfter.y - tl.y)).toBeLessThan(3);
  const rot = panel.getByRole("textbox", { name: "Rotation" });
  await rot.fill("30");
  await rot.press("Enter");
  await expect
    .poll(async () => {
      const p = await centre(box.locator('[data-corner="tl"]'));
      return Math.round(Math.hypot(p.x - tl.x, p.y - tl.y));
    })
    .toBeLessThan(4);
  // the corner-radius dot
  await dragBy(page, await centre(box.getByTestId("radius-handle")), 30, 30);
  await expect
    .poll(async () =>
      Number(
        await panel
          .getByRole("textbox", { name: "Corner radius" })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(5);
});

test("Transform panel: W with the lock changes H too, without it only W; X in px moves it; a blend mode lightens the preview", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "red.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await upload(page, "site.png");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  await page
    .getByTestId("lane-overlay")
    .getByTestId("timeline-clip")
    .first()
    .click();
  const panel = await transformPanel(page);
  const W = panel.getByLabel("W (pixels)");
  const H = panel.getByLabel("H (pixels)");
  const w0 = Number(await W.inputValue());
  const h0 = Number(await H.inputValue());
  await W.fill(String(Math.round(w0 / 2)));
  await W.press("Enter");
  await expect
    .poll(async () => Number(await H.inputValue()))
    .toBeLessThan(h0 * 0.6);
  await panel.getByRole("button", { name: /Keep the shape: on/ }).click();
  const h1 = Number(await H.inputValue());
  await W.fill(String(Math.round(w0 * 0.8)));
  await W.press("Enter");
  await expect
    .poll(async () => Number(await W.inputValue()))
    .toBe(Math.round(w0 * 0.8));
  expect(Math.abs(Number(await H.inputValue()) - h1)).toBeLessThanOrEqual(1);
  // X in pixels moves the box
  const box = page.getByTestId("selection-box");
  const x0 = (await box.boundingBox())!.x;
  const X = panel.getByLabel("X (pixels)");
  await X.fill(String(Number(await X.inputValue()) + 100));
  await X.press("Enter");
  await expect
    .poll(async () => (await box.boundingBox())!.x)
    .toBeGreaterThan(x0 + 10);
  // Screen over the red video: the picture's dark parts take the red (brighter than Normal)
  const at = async () =>
    page
      .getByTestId("program-stage")
      .locator("canvas")
      .first()
      .evaluate((cv: HTMLCanvasElement) => {
        const c = cv.getContext("2d")!;
        const d = c.getImageData(
          Math.round(cv.width * 0.5),
          Math.round(cv.height * 0.5),
          1,
          1,
        ).data;
        return d[0] + d[1] + d[2];
      });
  const before = await at();
  await panel
    .getByRole("combobox", { name: "Blend mode" })
    .selectOption("screen");
  await expect.poll(at).toBeGreaterThanOrEqual(before);
  await page.getByRole("button", { name: "Undo" }).click();
});

test("template files: deleting one a template uses is refused; a template whose video is gone says so and gets a new one", async ({
  page,
}) => {
  await page.goto("/");
  const { readFileSync, rmSync } = await import("node:fs");
  const up = async (name: string, type: string) =>
    (await (
      await page.request.post("/api/videos", {
        data: readFileSync(join(FIX, name)),
        headers: { "Content-Type": type, "X-File-Name": name },
      })
    ).json()) as { id: string };
  const v = await up("veo.mp4", "video/mp4");
  const made = await (
    await page.request.post("/api/templates/custom", {
      data: { name: "Guarded show", baseId: null, videoId: v.id },
    })
  ).json();
  // a file a template uses is only hidden from My Assets: the template keeps playing it
  const del = await page.request.delete(`/api/videos/${v.id}`);
  expect(del.status()).toBe(204);
  expect((await page.request.get(`/api/videos/${v.id}`)).ok()).toBe(true);
  // (a file gone anyway, e.g. before this guard: removed from the test server's storage)
  const v2 = await up("grey.mp4", "video/mp4");
  await page.request.post("/api/templates/custom", {
    data: { name: "Lost video", baseId: null, videoId: v2.id },
  });
  rmSync(join(__dirname, ".storage", "videos", v2.id), {
    recursive: true,
    force: true,
  });
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: "Browse all templates" }).click();
  const hub = page.getByTestId("template-hub");
  await hub.getByRole("button", { name: "My Templates", exact: true }).click();
  const card = hub.getByRole("button", {
    name: "Select Lost video",
    exact: true,
  });
  await expect(card.getByTestId("missing-badge")).toHaveText("Video missing");
  await card.click();
  await expect(hub.getByTestId("template-video-missing")).toBeVisible();
  await hub
    .getByTestId("replace-video-input")
    .setInputFiles(join(FIX, "red.mp4"));
  await expect(hub.getByTestId("template-video-missing")).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(card.getByTestId("missing-badge")).toHaveCount(0);
  // its video shows in the pane's preview (not the moving background), also when paused
  const red = async () =>
    hub
      .getByTestId("template-preview-canvas")
      .evaluate((cv: HTMLCanvasElement) => {
        const d = cv
          .getContext("2d")!
          .getImageData(
            Math.round(cv.width / 2),
            Math.round(cv.height / 2),
            1,
            1,
          ).data;
        return d[0] > 180 && d[1] < 70 && d[2] < 70;
      });
  await expect.poll(red, { timeout: 20_000 }).toBe(true);
  await hub.getByRole("button", { name: "Pause preview" }).click();
  await expect.poll(red).toBe(true);
  void made;
});

test("perspective on text: a corner moves on its own, the letters bend with it, and it's saved", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, "grey.mp4");
  await expect(page.getByTestId("timeline-clip")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Plain text/ })
    .first()
    .click();
  await expect(page.getByTestId("timeline-clip")).toHaveCount(2);
  // (the new text is selected: its card shows)
  await expect(
    page
      .getByRole("region", { name: "Text", exact: true })
      .getByRole("textbox", { name: "Text", exact: true }),
  ).toBeVisible();
  // (big letters, so a corner can move well inside the box)
  const size = page
    .getByRole("region", { name: "Text", exact: true })
    .getByRole("textbox", { name: "Text size" });
  await size.fill("220");
  await size.press("Enter");
  const box = page.getByTestId("selection-box");
  await expect(box).toBeVisible();
  const bar = page.getByTestId("transform-toolbar");
  await expect(bar.getByRole("button", { name: "Perspective" })).toBeEnabled();
  // text has no pivot dot (it grows from its anchor)
  await expect(box.getByTestId("pivot-handle")).toHaveCount(0);
  const canvas = page.getByTestId("program-canvas");
  const snap = () =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return [
        ...c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
      ].filter((_, i) => i % 4 === 0);
    });
  const before = await snap();
  await bar.getByRole("button", { name: "Perspective" }).click();
  await expect(box).toHaveAttribute("data-mode", "perspective");
  const corner = box.locator('[data-corner="tr"]');
  const tr0 = await centre(corner);
  await dragBy(page, tr0, -20, 35);
  const tr1 = await centre(corner);
  expect(Math.hypot(tr1.x - (tr0.x - 20), tr1.y - (tr0.y + 35))).toBeLessThan(
    4,
  );
  // (the panel's row: in the text card's Transform section)
  await expect(
    (await transformPanel(page)).getByTestId("perspective-row"),
  ).toBeAttached();
  // the drawn letters changed (bent), and there's still text on the preview
  await expect
    .poll(async () => {
      const after = await snap();
      return after.reduce(
        (n, v, i) => n + (Math.abs(v - before[i]) > 40 ? 1 : 0),
        0,
      );
    })
    .toBeGreaterThan(50);
  // saved with the clip
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  const text = proj.doc.tracks
    .flatMap((t: { clips: { type: string }[] }) => t.clips)
    .find((c: { type: string }) => c.type === "text");
  expect(text.transform.corners.tr.y).toBeGreaterThan(0);
});

test("AI image generated from the Overlay lane replaces its placeholder (not stuck at a %)", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  // the picture Gemini "made": saved server-side like /api/ai/image does; its metadata is the mocked response
  const { readFileSync } = await import("node:fs");
  const saved = await page.request.post("/api/videos", {
    data: readFileSync(join(FIX, "site.png")),
    headers: { "Content-Type": "image/png", "X-File-Name": "site.png" },
  });
  expect(saved.ok()).toBe(true);
  const meta = await saved.json();
  const overlay = page.getByTestId("lane-overlay");
  await expect(overlay.getByTestId("timeline-clip")).toHaveCount(0);
  // a slow fake Gemini: the progress ticker runs (and re-renders) before the result arrives
  await page.route("**/api/ai/image", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(meta),
    });
  });
  // right-click an empty part of the Overlay lane → Generate AI with Gemini → Image
  const box = (await overlay.boundingBox())!;
  await overlay.click({
    button: "right",
    position: { x: box.width - 30, y: box.height / 2 },
  });
  await page.getByRole("menuitem", { name: /Generate AI with Gemini/ }).click();
  const card = page.getByTestId("universal-ai-card");
  await card.getByRole("button", { name: /Video/i }).first().click();
  await card.getByText("AI Image").click();
  await card.getByRole("textbox").first().fill("A modern newsroom");
  await card.getByRole("button", { name: "Generate to Timeline" }).click();
  await expect(page.getByTestId("generating-overlay")).toBeVisible();
  // the placeholder is swapped for the picture, on the overlay track
  await expect(page.getByTestId("generating-overlay")).toBeHidden({
    timeout: 15_000,
  });
  await expect(overlay.locator('[data-type="image"]')).toHaveCount(1);
  await expect(
    page.getByTestId("lane-main").getByTestId("timeline-clip"),
  ).toHaveCount(1);
  // saved: the overlay clip uses the real picture and is no longer a placeholder
  await expect(page.getByTestId("save-state")).toHaveText("✓ Saved", {
    timeout: 15_000,
  });
  const id = new URL(page.url()).searchParams.get("p");
  const proj = await savedProject(page, id);
  const ov = proj.doc.tracks.find(
    (t: { kind: string }) => t.kind === "overlay",
  );
  expect(ov.clips.map((c: { mediaId: string }) => c.mediaId)).toEqual([
    meta.id,
  ]);
  expect(ov.clips.some((c: { generation?: unknown }) => c.generation)).toBe(
    false,
  );
});
