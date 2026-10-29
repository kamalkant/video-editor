/**
 * The encoding rules both exports in this browser share: the one drawn on the page and the one drawn in a
 * Worker (lib/export/videoPass). Kept apart from localExport so the Worker loads only what it needs.
 */

/** The browser couldn't read a file or a frame: the server export makes it instead. */
export class LocalExportUnavailable extends Error {}
/** An encoder stopped (a graphics driver's encoder often does): made again in software, then on the server. */
export class EncoderFailure extends LocalExportUnavailable {}

/** The pictures need the page after all (a clip only a <video> can read): the export is made there instead. */
export class NeedsPage extends Error {}

/** Frames the encoder may hold before the export waits (memory stays flat on long videos). */
const ENCODER_QUEUE = 4;
/** …unless it gave nothing back for this long: it may be waiting for more frames first (Safari's does). */
const ENCODER_LOOKAHEAD_MS = 100;
/** The most frames it may hold all the same. */
const ENCODER_MAX_QUEUE = 32;
/** An encoder that gave nothing back for this long has stopped: made again in software, then on the server. */
export const ENCODER_STALL_MS = 30_000;
/** One that never gave anything back, with its queue full, has stopped after this long. */
const ENCODER_FIRST_OUTPUT_MS = 3_000;

/**
 * Whether the next frame can go to the encoder: "go", "wait" (a moment, for the queue to drain) or "stalled".
 * `queue`: its encodeQueueSize; `sinceOutput`: ms since it last gave a frame back (or was set up). Safari's
 * encoder keeps a few frames before the first comes back: waiting for its queue to drop to 4 stopped the
 * export at 0% for good.
 */
export function encoderRoom(queue: number, sinceOutput: number, anyOutput = true): "go" | "wait" | "stalled" {
  if (queue <= ENCODER_QUEUE) return "go";
  if (sinceOutput > ENCODER_STALL_MS) return "stalled";
  if (!anyOutput && queue >= ENCODER_MAX_QUEUE && sinceOutput > ENCODER_FIRST_OUTPUT_MS) return "stalled";
  return queue <= ENCODER_MAX_QUEUE && sinceOutput >= ENCODER_LOOKAHEAD_MS ? "go" : "wait";
}

/** An encoder's flush, given up (as a stopped encoder) when it doesn't end. */
export function flushed(encoder: { flush(): Promise<void> }, what: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    encoder.flush().finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new EncoderFailure(`The ${what} encoder didn't finish.`)), ENCODER_STALL_MS * 2);
    }),
  ]);
}

/** How often the export says how far it is (each update re-renders the editor). */
export const PROGRESS_EVERY_MS = 250;
/** Whether to report the progress now: `last` the time of the last report; the last frame always is. */
export const progressDue = (now: number, last: number, final: boolean) => final || now - last >= PROGRESS_EVERY_MS;

/** Where the export is, in the browser's console ("[export] …"): a stop that only happens in one browser shows its place. */
export const trace = (what: string, data?: Record<string, unknown>) => console.info(`[export] ${what}`, data ?? "");
