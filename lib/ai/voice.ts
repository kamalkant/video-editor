import "server-only";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg, SAFE_INPUT } from "../ffmpeg/run";
import { ensureDir, readJson, storagePath, writeJson } from "../storage";
import { getVideo, importAiFile, type VideoMeta } from "../videos";
import { GEMINI_VOICES } from "./voices";
import { fakeSpeech } from "./fake";
import { findBlobs, GeminiError, interact, isFake, pickModel } from "./gemini";

export const MAX_GEMINI_TTS = 5000;

/**
 * Text to speech with Gemini's voices (130 languages, a style you describe).
 * Sends only the text. The same text + voice + style is made once (cached).
 */
export async function geminiSpeak(
  text: string,
  voice: string,
  style: string,
): Promise<VideoMeta> {
  const clean = text.replace(/\s+/g, " ").trim();
  const how = style.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean)
    throw new GeminiError("Type something to read out.", 400, "empty");
  if (clean.length > MAX_GEMINI_TTS)
    throw new GeminiError(
      `That's ${clean.length} characters. The limit is ${MAX_GEMINI_TTS}.`,
      400,
      "too_long",
    );
  if (!GEMINI_VOICES.some((v) => v.name === voice))
    throw new GeminiError("Pick one of the Gemini voices.", 400, "bad_voice");

  const hash = createHash("sha1")
    .update(JSON.stringify([clean, voice, how, isFake()]))
    .digest("hex")
    .slice(0, 20);
  const cacheFile = storagePath("ai-cache", `voice-${hash}.json`);
  const hit = await readJson<{ mediaId: string }>(cacheFile);
  const old = hit ? await getVideo(hit.mediaId) : null;
  if (old) return old;

  const dir = await mkdtemp(join(tmpdir(), "VDO-gtts-"));
  try {
    const raw = join(dir, "speech.wav");
    let model = "fake";
    if (isFake()) await fakeSpeech(raw, clean);
    else {
      model = await pickModel("tts");
      const j = await interact({
        model,
        // one voice (the docs' single-speaker form): the style goes on the text, the voice in speech_config
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text: clean,
                ...(how
                  ? { annotations: [{ type: "speech_metadata", style: how }] }
                  : {}),
              },
            ],
          },
        ],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
      });
      const audio = findBlobs(j, "audio/").pop();
      if (!audio)
        throw new GeminiError("Gemini didn't send the voice back. Try again.");
      const bytes = Buffer.from(audio.data, "base64");
      // a WAV file, or raw 16-bit PCM at 24 kHz (audio/l16)
      if (
        /wav/.test(audio.mime) ||
        bytes.subarray(0, 4).toString("latin1") === "RIFF"
      )
        await writeFile(raw, bytes);
      else {
        const pcm = join(dir, "speech.pcm");
        await writeFile(pcm, bytes);
        await runFfmpeg(
          [
            ...SAFE_INPUT,
            "-f",
            "s16le",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-i",
            pcm,
            "-y",
            raw,
          ],
          { timeoutMs: 60_000 },
        );
      }
    }
    const m4a = join(dir, "speech.m4a");
    await runFfmpeg(
      [
        ...SAFE_INPUT,
        "-i",
        raw,
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
      .replace(/[^\p{L}\p{N}\- ]/gu, "")
      .slice(0, 60);
    const meta = await importAiFile(
      m4a,
      `Voice (${voice}) - ${words || "speech"}.m4a`,
      { by: "gemini", what: "voice", prompt: clean, model },
    );
    await ensureDir(storagePath("ai-cache"));
    await writeJson(cacheFile, { mediaId: meta.id });
    return meta;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
