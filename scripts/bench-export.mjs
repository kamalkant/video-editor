// How long an export takes, end to end, in a real browser: opens the editor, adds one video, makes the
// export from the Export dialog and times it to the download link. Prints one JSON line (seconds, browser or
// server, upload) and the export's own stages ("[export] …" in the console); --profile adds where the
// browser's CPU went.
//
//   node scripts/bench-export.mjs --url http://127.0.0.1:3000 --session <viplay_session cookie> --format mp4
//
// --file a.mp4     the video (default: one made with FFmpeg: --seconds 60, 1920x1080 at 30 fps, a tone)
// --silent         the made video has no sound (Chromium on Linux can't encode AAC: MP4 with sound goes to the server)
// --format         mp4 | webm
// --save out.mp4   keep the result
// --profile        sample the CPU for 15 s from 8 s in
//
// Measure a production build (next build && next start): a dev build spends much of the time in React.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values: o } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:3000" },
    session: { type: "string", default: process.env.VIPLAY_SESSION },
    file: { type: "string" },
    seconds: { type: "string", default: "60" },
    silent: { type: "boolean", default: false },
    format: { type: "string", default: "mp4" },
    save: { type: "string" },
    profile: { type: "boolean", default: false },
  },
});
if (!o.session) throw new Error("Give a signed-in session: --session <viplay_session cookie> (or VIPLAY_SESSION).");
if (!["mp4", "webm"].includes(o.format)) throw new Error("--format is mp4 or webm.");

const work = mkdtempSync(join(tmpdir(), "bench-export-"));
let file = o.file ? resolve(o.file) : join(work, `bench${o.seconds}${o.silent ? "-silent" : ""}.mp4`);
if (!o.file) {
  const d = String(Number(o.seconds));
  execFileSync("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=s=1920x1080:r=30:d=${d}`,
    ...(o.silent ? [] : ["-f", "lavfi", "-i", `sine=frequency=440:duration=${d}`]),
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    ...(o.silent ? ["-an"] : ["-c:a", "aac", "-shortest"]),
    file,
  ]);
}
if (!existsSync(file)) throw new Error(`No file ${file}`);

const ctx = await chromium.launchPersistentContext(join(work, "profile"), { viewport: { width: 1600, height: 1000 } });
const origin = new URL(o.url);
await ctx.addCookies([{ name: "viplay_session", value: o.session, domain: origin.hostname, path: "/" }]);
const page = await ctx.newPage();
let t0 = 0;
const stages = [];
const net = { upBytes: 0, upRequests: 0, jobPostAt: 0 };
const since = () => ((Date.now() - t0) / 1000).toFixed(1);
page.on("console", (m) => {
  const s = m.text();
  if (t0 && s.startsWith("[export]")) stages.push(`${since()}s ${s.slice(9, 140)}`);
});
page.on("request", (r) => {
  if (!t0) return;
  if (r.method() !== "GET" && /\/api\/(uploads|videos)/.test(r.url())) {
    net.upRequests++;
    net.upBytes += r.postDataBuffer()?.length ?? 0;
  }
  if (r.method() === "POST" && r.url().endsWith("/api/jobs")) net.jobPostAt = Number(since());
});

try {
  await page.goto(new URL("/editor", o.url).href);
  await page.waitForTimeout(5000);
  if (!page.url().startsWith(o.url)) throw new Error(`Not signed in: the editor went to ${page.url()}`);
  // a new project when one is open
  if (await page.getByTestId("timeline-clip").count()) {
    await page.getByRole("button", { name: /^Projects/ }).first().click();
    await page.getByRole("button", { name: /^New$/ }).first().click();
    await page.waitForTimeout(2000);
  }
  if (await page.getByTestId("search-palette").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.getByTestId("file-input").setInputFiles([file]);
  await page.getByTestId("timeline-clip").first().waitFor();
  await page.waitForTimeout(4000);

  await page.getByRole("button", { name: "Export options" }).click();
  await page.getByRole("menuitem", { name: /All formats/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("export-formats").getByRole("radio", { name: o.format === "webm" ? "WebM (VP9)" : "MP4 (H.264)" }).check();
  t0 = Date.now();
  const cdp = await ctx.newCDPSession(page);
  await dialog.getByRole("button", { name: /^Make / }).click();
  const link = page.locator("a[download]").first();
  // (timed on its own: a profile's sampling never adds to it)
  const finished = link.waitFor({ timeout: 900_000 }).then(() => (Date.now() - t0) / 1000);
  let profile = null;
  if (o.profile) {
    const ended = finished.then(() => true);
    if (!(await Promise.race([ended, page.waitForTimeout(8000).then(() => false)]))) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
      await cdp.send("Profiler.start");
      await Promise.race([ended, page.waitForTimeout(15000)]);
      profile = (await cdp.send("Profiler.stop")).profile;
    }
  }
  const seconds = await finished;
  const href = await link.getAttribute("href");
  console.log(JSON.stringify({ file: file.split("/").pop(), format: o.format, seconds, via: href?.startsWith("blob:") ? "browser" : "server", net }));
  console.log(stages.join("\n"));
  if (profile) console.log(`cpu: ${cpuSplit(profile)}`);
  if (o.save && href) {
    const b64 = await page.evaluate(async (u) => {
      const buf = new Uint8Array(await (await fetch(u)).arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, href);
    writeFileSync(o.save, Buffer.from(b64, "base64"));
  }
} finally {
  await ctx.close();
}

/** Where the sampled CPU went: by the function on top, its caller for drawImage. */
function cpuSplit(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const counts = new Map();
  for (const id of p.samples) {
    const top = byId.get(id).callFrame.functionName;
    const caller = parent.has(id) ? byId.get(parent.get(id)).callFrame.functionName || "(anonymous)" : "";
    const k =
      top === "(idle)" ? "idle"
      : top === "(program)" || top === "(garbage collector)" ? "browser/GC"
      : top === "drawImage" ? `drawImage via ${caller}`
      : top === "VideoFrame" ? "canvas→VideoFrame"
      : "js";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = p.samples.length || 1;
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round((100 * v) / total)}%`).join(" | ");
}
