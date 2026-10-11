import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { runFfmpeg, SAFE_INPUT } from "./ffmpeg/run";
import { importFile, type VideoMeta } from "./videos";

/**
 * Text to speech with the voices built into macOS (`say`): free, private,
 * offline. Indian English (Aman, Rishi…) and Hindi (Lekha) where installed.
 * The speech becomes a normal sound upload (M4A) in My Assets.
 */

export type Voice = { name: string; locale: string; sample: string };
export const MAX_TTS_CHARS = 5000;

// novelty voices ("Bubbles", "Zarvox"…) don't belong in a video
const NOVELTY = new Set([
  "Albert",
  "Bad News",
  "Bahh",
  "Bells",
  "Boing",
  "Bubbles",
  "Cellos",
  "Good News",
  "Jester",
  "Organ",
  "Superstar",
  "Trinoids",
  "Whisper",
  "Wobble",
  "Zarvox",
  "Fred",
  "Junior",
  "Kathy",
  "Ralph",
]);

export class TtsError extends Error {}

function sayRun(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("say", args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", () => {
      clearTimeout(t);
      reject(new TtsError("Text to speech needs macOS (the “say” voices)."));
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve(out);
      else
        reject(
          new TtsError(err.trim() || "The voice couldn't read this text."),
        );
    });
  });
}

/** Parse `say -v ?` lines: "Aman               en_IN    # Hello! My name is Aman." */
export function parseVoices(list: string): Voice[] {
  const out: Voice[] = [];
  for (const line of list.split("\n")) {
    // long names have a single space before the locale: "Eddy (English (UK)) en_GB    # Hello!"
    const m = /^(.+?)\s+([a-z]{2,3}_[A-Z0-9]{2,3})\s+#\s?(.*)$/.exec(
      line.trimEnd(),
    );
    if (!m) continue;
    const name = m[1].trim();
    if (NOVELTY.has(name) || out.some((v) => v.name === name)) continue;
    out.push({ name, locale: m[2], sample: m[3] });
  }
  // Indian English and Hindi first, then other English, then the rest
  const rank = (v: Voice) =>
    v.locale === "en_IN"
      ? 0
      : v.locale === "hi_IN"
        ? 1
        : v.locale.startsWith("en_")
          ? 2
          : 3;
  return out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.locale.localeCompare(b.locale) ||
      a.name.localeCompare(b.name),
  );
}

let cache: Voice[] | null = null;
export async function listVoices(): Promise<Voice[]> {
  if (cache) return cache;
  cache = parseVoices(await sayRun(["-v", "?"], 15_000));
  return cache;
}

/** Speak `text` with `voice` at `rate` words per minute; returns the new sound upload. */
export async function speak(
  text: string,
  voice: string,
  rate: number,
): Promise<VideoMeta> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new TtsError("Type something to read out.");
  if (clean.length > MAX_TTS_CHARS)
    throw new TtsError(
      `That's ${clean.length} characters. The limit is ${MAX_TTS_CHARS}.`,
    );
  const voices = await listVoices();
  if (!voices.some((v) => v.name === voice))
    throw new TtsError("That voice isn't on this Mac.");
  const wpm = Math.round(Math.min(320, Math.max(90, rate)));
  const dir = await mkdtemp(join(tmpdir(), "VDO-tts-"));
  try {
    const txt = join(dir, "script.txt");
    const aiff = join(dir, "speech.aiff");
    const m4a = join(dir, "speech.m4a");
    // the text goes in a file (never on the command line)
    await writeFile(txt, clean, "utf8");
    await sayRun(["-v", voice, "-r", String(wpm), "-f", txt, "-o", aiff]);
    await runFfmpeg(
      [
        ...SAFE_INPUT,
        "-i",
        aiff,
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-y",
        m4a,
      ],
      { timeoutMs: 120_000 },
    );
    const words = clean
      .split(" ")
      .slice(0, 6)
      .join(" ")
      .replace(/[^\w\- ]/g, "")
      .slice(0, 60);
    return await importFile(m4a, `Voice - ${words || voice}.m4a`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
