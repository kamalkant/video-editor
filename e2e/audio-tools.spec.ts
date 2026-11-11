import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { encodeWav, integratedLoudness, decodeWav } from "../lib/audio/tools/pcm";

/** The audio tools (/audio/…): real files in, files out, checked with ffprobe where it is installed. */

const tone = (seconds: number, amp: number, rate = 44100) => {
  const n = Math.round(seconds * rate);
  const ch = Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / rate));
  return Buffer.from(encodeWav({ sampleRate: rate, channels: [ch, ch.slice()] }));
};

async function saved(page: Page) {
  await expect(page.getByTestId("audio-result")).toBeVisible({ timeout: 60_000 });
  const dl = page.waitForEvent("download");
  await page.getByTestId("download-audio").click();
  const d = await dl;
  const file = path.join(os.tmpdir(), `audio-e2e-${Date.now()}-${d.suggestedFilename()}`);
  fs.copyFileSync((await d.path())!, file);
  return { name: d.suggestedFilename(), file, bytes: fs.readFileSync(file) };
}

const probe = (file: string) => {
  try {
    return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" })) as { streams: { codec_name: string; channels: number; sample_rate: string }[]; format: { duration: string } };
  } catch {
    return null; // no ffprobe here: the byte checks still run
  }
};

test("the audio tools index lists the five tools", async ({ page }) => {
  await page.goto("/audio");
  for (const t of ["Audio Converter", "Audio Compressor", "Audio Trimmer", "Audio Normalizer", "Voice Recorder"]) await expect(page.getByText(t, { exact: true })).toBeVisible();
});

test("Converter: WAV to MP3", async ({ page }) => {
  await page.goto("/audio/convert");
  await page.getByTestId("audio-input").setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: tone(3, 0.4) });
  await expect(page.getByTestId("source-name")).toHaveText("tone.wav");
  await page.getByTestId("format").selectOption("mp3");
  await page.getByTestId("run-audio").click();
  const out = await saved(page);
  expect(out.name).toBe("tone.mp3");
  expect(out.bytes[0]).toBe(0xff);
  const p = probe(out.file);
  if (p) {
    expect(p.streams[0].codec_name).toBe("mp3");
    expect(parseFloat(p.format.duration)).toBeCloseTo(3, 0);
  }
});

test("Converter: WebM (Opus) when the browser can encode it", async ({ page }) => {
  await page.goto("/audio/convert");
  await page.getByTestId("audio-input").setInputFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: tone(2, 0.4) });
  const options = await page.getByTestId("format").locator("option").allTextContents();
  test.skip(!options.some((o) => o.includes("WebM")), "this browser has no Opus encoder");
  await page.getByTestId("format").selectOption("webm");
  await page.getByTestId("run-audio").click();
  const out = await saved(page);
  expect(out.name).toBe("tone.webm");
  const p = probe(out.file);
  if (p) expect(p.streams[0].codec_name).toBe("opus");
});

test("Trimmer: keeps the chosen part, as WAV", async ({ page }) => {
  await page.goto("/audio/trim");
  await page.getByTestId("audio-input").setInputFiles({ name: "long.wav", mimeType: "audio/wav", buffer: tone(6, 0.4) });
  await page.getByLabel("Start (s)").fill("1");
  await page.getByLabel("End (s)").fill("3.5");
  await page.getByLabel("Fade out (s)").fill("0.5");
  await page.getByTestId("format").selectOption("wav");
  await page.getByTestId("run-audio").click();
  const out = await saved(page);
  expect(out.name).toBe("long-trimmed.wav");
  const pcm = decodeWav(new Uint8Array(out.bytes));
  expect(pcm.channels[0].length / pcm.sampleRate).toBeCloseTo(2.5, 2);
  // the fade ends in silence
  expect(Math.abs(pcm.channels[0][pcm.channels[0].length - 1])).toBeLessThan(0.01);
});

test("Normalizer: a quiet file comes out at −14 LUFS", async ({ page }) => {
  await page.goto("/audio/normalize");
  await page.getByTestId("audio-input").setInputFiles({ name: "quiet.wav", mimeType: "audio/wav", buffer: tone(5, 0.02) });
  await expect(page.getByText(/LUFS, loudest peak/)).toBeVisible();
  await page.getByTestId("format").selectOption("wav");
  await page.getByTestId("run-audio").click();
  await expect(page.getByTestId("audio-result")).toContainText(/→ -14\.0 LUFS/);
  const out = await saved(page);
  expect(integratedLoudness(decodeWav(new Uint8Array(out.bytes)))).toBeCloseTo(-14, 0);
});

test("Compressor: smaller, mono", async ({ page }) => {
  await page.goto("/audio/compress");
  const wav = tone(5, 0.4);
  await page.getByTestId("audio-input").setInputFiles({ name: "big.wav", mimeType: "audio/wav", buffer: wav });
  await page.getByTestId("bitrate").selectOption("64");
  await page.getByTestId("run-audio").click();
  await expect(page.getByTestId("audio-result")).toContainText("smaller");
  const out = await saved(page);
  expect(out.name).toBe("big-small.mp3");
  expect(out.bytes.length).toBeLessThan(wav.length / 10);
  const p = probe(out.file);
  if (p) expect(p.streams[0].channels).toBe(1);
});

test("Voice Recorder: records the microphone and saves it", async ({ page }) => {
  await page.goto("/audio/record");
  await page.getByTestId("start-recording").click();
  await page.waitForTimeout(2200);
  await page.getByTestId("stop-recording").click();
  await expect(page.getByTestId("source-name")).toContainText("Recording", { timeout: 30_000 });
  await page.getByTestId("format").selectOption("mp3");
  await page.getByTestId("run-audio").click();
  const out = await saved(page);
  expect(out.name).toMatch(/^Recording .*\.mp3$/);
  const p = probe(out.file);
  if (p) expect(parseFloat(p.format.duration)).toBeGreaterThan(1.5);
});
