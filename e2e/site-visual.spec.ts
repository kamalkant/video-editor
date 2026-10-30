import { expect, test, type Page } from "@playwright/test";

// The marketing site (/), as a signed-out visitor: layout at three widths and both themes,
// what it downloads up front, reduced motion, and how many videos play at once.
test.use({ storageState: { cookies: [], origins: [] } });

// The website moved to viplay.in (its own app); here "/" opens the editor (next.config.ts redirects). These
// checks belong with the website now.
test.skip(true, "the marketing website is viplay.in now, not this app");

const playingVideos = (page: Page) => page.evaluate(() => [...document.querySelectorAll("video")].filter((v) => !v.paused && !v.ended).length);

for (const width of [390, 768, 1440]) {
  for (const scheme of ["dark", "light"] as const) {
    test(`website at ${width}px, ${scheme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      if (scheme === "light") await page.addInitScript(() => localStorage.setItem("VDO:theme", "light"));
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByText("Limits.")).toBeVisible();
      // nothing sticks out sideways
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath(`hero-${width}-${scheme}.png`) });
      await page.locator("#pricing").scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: info.outputPath(`pricing-${width}-${scheme}.png`) });
    });
  }
}

test("first load stays light: posters first, videos only near the screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let media = 0;
  page.on("response", async (res) => {
    const type = res.headers()["content-type"] ?? "";
    if (/^(video|image)\//.test(type)) media += Number(res.headers()["content-length"] ?? 0) || (await res.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(media).toBeLessThan(2.5 * 1024 * 1024);

  // the largest thing painted is the headline or the hero's poster, not a late image
  const lcp = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1) as PerformanceEntry & { element?: Element | null };
          resolve(last?.element?.tagName ?? "");
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve("timeout"), 3000);
      }),
  );
  expect(["H1", "VIDEO", "IMG", "SPAN", "P"]).toContain(lcp);
});

test("scrolling the whole page never runs more than 3 videos at once", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  let most = 0;
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(450);
    most = Math.max(most, await playingVideos(page));
  }
  expect(most).toBeGreaterThan(0);
  expect(most).toBeLessThanOrEqual(3);
});

test("with reduce motion nothing plays by itself; a play button starts a preview", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  expect(await playingVideos(page)).toBe(0);
  await page.getByRole("button", { name: /^Play preview: Editing in ViPlay Studio/ }).click();
  await expect.poll(() => playingVideos(page)).toBe(1);
  await context.close();
});

test("phone: the menu opens and the calls to action go to sign-up", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Site" });
  await expect(menu.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/#pricing");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Try ViPlay Free/ }).first()).toHaveAttribute("href", "/signup?next=/editor");
  await page.locator("#pricing").scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: /Get Started with Monthly Pro/ })).toHaveAttribute("href", /\/signup\?next=%2Faccount%2Fbilling%3Fplan%3D/);
});
