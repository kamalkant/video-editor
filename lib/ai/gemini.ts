import "server-only";
import { aiKey, aiOff, aiSaved } from "./keys";

/**
 * Google Gemini, used only when the user clicks a ✦ Gemini button.
 *
 * - The key comes from GEMINI_API_KEY (.env.local). It stays on this server:
 *   it goes only in the x-goog-api-key header, and it is scrubbed from every
 *   error message. It never reaches the browser, a project or an export.
 * - GEMINI_FAKE=1 (the browser tests) never touches the network: lib/ai/fake.ts.
 * - Model names change often, so the best available one is picked from the
 *   key's own model list (cached for an hour); GEMINI_MODEL_* can override.
 * - The answer is read loosely (base64 blocks by type, text, JSON), so a small
 *   change in the response shape doesn't break the features.
 */

const BASE =
  process.env.GEMINI_BASE_URL?.replace(/\/+$/, "") ||
  "https://generativelanguage.googleapis.com/v1beta";

export type GeminiState = "ready" | "no-key" | "off" | "fake";
export const isFake = () => process.env.GEMINI_FAKE === "1";
/** The key from AI settings (or .env.local); null when switched off. */
const key = () => aiKey("gemini");
/** Off (switched off in AI settings), no key, or ready. The pretend Gemini (tests) still follows the settings. */
export function geminiState(): GeminiState {
  if (aiOff("gemini")) return "off";
  // (a key removed in the settings shows as "no key" with the pretend one too)
  if (isFake()) return aiSaved("gemini") && !key() ? "no-key" : "fake";
  return key() ? "ready" : "no-key";
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "gemini_failed",
  ) {
    super(message);
  }
}

/** Never let the key show up in a message. */
export function scrub(text: string): string {
  const k = key();
  let out = k ? text.split(k).join("•••") : text;
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, "•••");
  return out.slice(0, 400);
}

function fromHttp(status: number, body: unknown): GeminiError {
  const msg = scrub(
    String((body as { error?: { message?: unknown } })?.error?.message ?? ""),
  );
  if (status === 401 || status === 403)
    return new GeminiError(
      `Your Gemini key wasn't accepted. Check GEMINI_API_KEY in .env.local. ${msg}`.trim(),
      401,
      "gemini_key",
    );
  if (status === 429) {
    // a plan without this model (a free key and paid-only models) says "limit: 0": waiting won't help
    if (/limit:\s*0\b|billing|free[_ ]tier/i.test(msg))
      return new GeminiError(
        `Your Gemini plan doesn't include this yet (Google needs billing turned on for it: aistudio.google.com → Billing). ${msg}`.trim(),
        402,
        "gemini_plan",
      );
    return new GeminiError(
      `Gemini is busy, or your quota is used up. Try again in a minute. ${msg}`.trim(),
      429,
      "gemini_busy",
    );
  }
  if (status === 404)
    return new GeminiError(
      `That Gemini model isn't available for your key. ${msg}`.trim(),
      502,
      "gemini_model",
    );
  if (/safety|blocked|policy|prohibited/i.test(msg))
    return new GeminiError(
      "Gemini wouldn't make this. Try other words.",
      400,
      "gemini_blocked",
    );
  return new GeminiError(
    `Gemini said: ${msg || `error ${status}`}`,
    status >= 500 ? 502 : 400,
  );
}

async function call<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
  timeoutMs = 120_000,
  keyOverride?: string,
): Promise<T> {
  if (isFake()) throw new Error("the fake Gemini never calls the network");
  if (!keyOverride && aiOff("gemini"))
    throw new GeminiError(
      "Gemini is switched off in AI Tools → Settings.",
      403,
      "gemini_off",
    );
  const k = keyOverride ?? key();
  if (!k)
    throw new GeminiError(
      "Add your Gemini key first (AI Tools → Settings).",
      400,
      "no_key",
    );
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: init.method ?? "POST",
      headers: {
        "x-goog-api-key": k,
        ...(init.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError")
      throw new GeminiError(
        "Gemini took too long. Try again.",
        504,
        "gemini_timeout",
      );
    throw new GeminiError(
      "Couldn't reach Gemini. Check the internet connection.",
      502,
      "gemini_offline",
    );
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw fromHttp(res.status, json);
  return json as T;
}

// ---------- reading answers loosely ----------

export type Blob64 = { data: string; mime: string };

/** Every base64 block whose type starts with `prefix` ("image/", "audio/", "video/"), anywhere in the answer. */
export function findBlobs(
  x: unknown,
  prefix: string,
  out: Blob64[] = [],
): Blob64[] {
  if (Array.isArray(x)) for (const v of x) findBlobs(v, prefix, out);
  else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const mime = (o.mime_type ?? o.mimeType) as unknown;
    const data = (o.data ?? o.bytesBase64Encoded) as unknown;
    if (
      typeof mime === "string" &&
      typeof data === "string" &&
      mime.startsWith(prefix) &&
      data.length > 16
    )
      out.push({ data, mime });
    for (const [k, v] of Object.entries(o))
      if (k !== "data" && v && typeof v === "object") findBlobs(v, prefix, out);
  }
  return out;
}

/** The model's words: `text` / `output_text` fields (not the ones we sent). */
export function findTexts(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) for (const v of x) findTexts(v, out);
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (k === "input" || k === "contents") continue;
      if ((k === "text" || k === "output_text") && typeof v === "string")
        out.push(v);
      else if (v && typeof v === "object") findTexts(v, out);
    }
  }
  return out;
}

/** The JSON the model answered with (also inside ```json fences, or the first {...} / [...]). */
export function findJson<T = unknown>(x: unknown): T | null {
  for (const t of findTexts(x).reverse()) {
    const s = t
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    for (const candidate of [s, s.slice(s.search(/[[{]/))]) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        /* try the next */
      }
    }
  }
  return null;
}

// ---------- models ----------

export type Task =
  | "text"
  | "image"
  | "image-lite"
  | "tts"
  | "video-lite"
  | "video-fast"
  | "video";

/** Best first. Checked against the key's model list at run time. */
const PREFER: Record<Task, string[]> = {
  text: [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
  ],
  image: [
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-2.5-flash-image",
  ],
  "image-lite": ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"],
  tts: ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"],
  "video-lite": ["veo-3.1-lite-generate-preview"],
  "video-fast": ["veo-3.1-fast-generate-preview"],
  video: ["veo-3.1-generate-preview"],
};
/** When none of the preferred names is there: the newest matching one. */
const PATTERN: Record<Task, RegExp> = {
  text: /^gemini-[\d.]+-flash$/,
  image: /^gemini-[\d.]+-(?:flash|pro)-image$/,
  "image-lite": /image/,
  tts: /tts/,
  "video-lite": /^veo-.*lite/,
  "video-fast": /^veo-.*fast/,
  video: /^veo-[\d.]+-generate/,
};
const ENV: Partial<Record<Task, string>> = {
  text: "GEMINI_MODEL_TEXT",
  image: "GEMINI_MODEL_IMAGE",
  tts: "GEMINI_MODEL_TTS",
  video: "GEMINI_MODEL_VIDEO",
};

const g = globalThis as unknown as {
  __VDOGeminiModels?: { at: number; names: string[] };
};

/** After the key changes: the next call asks Google for the model list again. */
export const forgetModels = () => {
  g.__VDOGeminiModels = undefined;
};

/** Does Google accept this key? (Lists the models: free.) Throws a GeminiError saying why not. */
export async function testGeminiKey(k: string): Promise<number> {
  if (isFake()) return 0;
  const j = await call<{ models?: unknown[] }>(
    "models?pageSize=1000",
    { method: "GET" },
    20_000,
    k,
  );
  return j.models?.length ?? 0;
}

export async function listModels(): Promise<string[]> {
  const c = g.__VDOGeminiModels;
  if (c && Date.now() - c.at < 60 * 60 * 1000) return c.names;
  try {
    const j = await call<{ models?: { name?: string }[] }>(
      "models?pageSize=1000",
      { method: "GET" },
      20_000,
    );
    const names = (j.models ?? [])
      .map((m) => String(m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    g.__VDOGeminiModels = { at: Date.now(), names };
    return names;
  } catch (err) {
    if (err instanceof GeminiError && err.code === "gemini_key") throw err;
    return [];
  }
}

/** Pure part of pickModel (tested): the env override, the first preferred one available, else the newest match. */
export function chooseModel(
  task: Task,
  available: string[],
  override?: string | null,
): string {
  if (override) return override;
  const found = PREFER[task].find((m) => available.includes(m));
  if (found) return found;
  const match = available
    .filter((m) => PATTERN[task].test(m))
    .sort()
    .reverse()[0];
  return match ?? PREFER[task][0];
}

export async function pickModel(task: Task): Promise<string> {
  const env = ENV[task] ? process.env[ENV[task]!]?.trim() : null;
  return chooseModel(task, env ? [] : await listModels(), env);
}

// ---------- calls ----------

/** One request to the Interactions API (text, audio, pictures, voice). */
export function interact(
  body: {
    model: string;
    input: unknown[];
    response_format?: unknown;
    generation_config?: unknown;
  },
  timeoutMs = 180_000,
) {
  return call<unknown>(
    "interactions",
    { body: { ...body, stream: false } },
    timeoutMs,
  );
}

/**
 * JSON answer, with little "thinking" (transcribing and translating don't need
 * it, and it is much faster). If the request form is refused, asks once more plainly.
 */
export async function interactJson<T>(
  model: string,
  input: unknown[],
  schema: unknown,
  timeoutMs?: number,
): Promise<T> {
  let j: unknown;
  try {
    j = await interact(
      {
        model,
        input,
        response_format: schema,
        generation_config: { thinking_level: "low" },
      },
      timeoutMs,
    );
  } catch (err) {
    if (
      !(err instanceof GeminiError) ||
      err.status !== 400 ||
      err.code !== "gemini_failed"
    )
      throw err;
    j = await interact({ model, input }, timeoutMs);
  }
  const out = findJson<T>(j);
  if (out == null)
    throw new GeminiError("Gemini's answer couldn't be read. Try again.");
  return out;
}

// ---------- Veo (long-running) ----------

export async function startVideo(
  model: string,
  instance: Record<string, unknown>,
  parameters: Record<string, unknown>,
): Promise<string> {
  const j = await call<{ name?: string }>(
    `models/${model}:predictLongRunning`,
    { body: { instances: [instance], parameters } },
    60_000,
  );
  if (!j?.name) throw new GeminiError("Veo didn't start. Try again.");
  return j.name;
}

export type VideoPoll =
  | { done: false }
  | { done: true; uri?: string; data?: string; error?: string };

export async function pollVideo(operation: string): Promise<VideoPoll> {
  if (!/^[\w./-]+$/.test(operation)) throw new GeminiError("Bad Veo job name.");
  const j = await call<Record<string, unknown>>(
    operation,
    { method: "GET" },
    30_000,
  );
  if (!j?.done) return { done: false };
  if (j.error)
    return {
      done: true,
      error: scrub(
        String((j.error as { message?: unknown }).message ?? "Veo failed"),
      ),
    };
  const resp = (j.response ?? {}) as Record<string, unknown>;
  const gen = (resp.generateVideoResponse ?? resp) as Record<string, unknown>;
  const reasons = gen.raiMediaFilteredReasons;
  const sample = (
    (gen.generatedSamples ?? gen.generatedVideos ?? gen.videos) as
      | { video?: { uri?: string; bytesBase64Encoded?: string } }[]
      | undefined
  )?.[0];
  const uri = sample?.video?.uri;
  const data =
    sample?.video?.bytesBase64Encoded ?? findBlobs(j, "video/")[0]?.data;
  if (!uri && !data)
    return {
      done: true,
      error:
        Array.isArray(reasons) && reasons.length
          ? "Veo wouldn't make this (its safety filter). Try other words."
          : "Veo finished without a video. Try again.",
    };
  return { done: true, uri, data };
}

/** Download a finished Veo video. The key is only sent to Google's own hosts. */
export async function downloadVideo(uri: string): Promise<Buffer> {
  const trusted = (u: URL) =>
    u.protocol === "https:" &&
    /(^|\.)(googleapis\.com|googleusercontent\.com)$/.test(u.hostname);
  let u = new URL(uri);
  // redirects are followed by hand: the key goes only to the Gemini API host, never along a redirect
  for (let hop = 0; hop < 4; hop++) {
    if (!trusted(u))
      throw new GeminiError(
        "Veo gave a download link this editor doesn't trust.",
      );
    const withKey = u.hostname === new URL(BASE).hostname;
    const res = await fetch(u, {
      headers: withKey ? { "x-goog-api-key": key() ?? "" } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      u = new URL(loc, u);
      continue;
    }
    if (!res.ok) throw fromHttp(res.status, null);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new GeminiError("Veo's download link kept redirecting.");
}
