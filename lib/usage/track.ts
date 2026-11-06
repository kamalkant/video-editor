/**
 * ViPlay usage tracker (browser). One copy in each app (this file is the source; the apps keep it as
 * src/usage/track.ts, unchanged). Reports visits and a few events to viplay.in/api/events:
 *
 *   initUsage({ app: "photo" });          // once, when the app starts: counts the visit, then heartbeats
 *   track("export_done", { format: "png", seconds: 3 });
 *
 * - Anonymous by default: a random id per browser, shared by the *.viplay.in apps through a cookie on the
 *   domain; the website adds the signed-in user from its own cookie. No file names, text or IP addresses.
 * - Off for browsers that send Do Not Track or Global Privacy Control, and after "Usage data: off" on
 *   viplay.in/privacy (a cookie every app sees).
 * - Light: events wait in a small queue and go every ten seconds (or when 20 wait), and as the page hides,
 *   by sendBeacon. Failures are dropped silently: tracking never breaks the app.
 */

export type UsageEvent =
  | "app_open"
  | "heartbeat"
  | "project_new"
  | "project_open"
  | "media_import"
  | "tool_use"
  | "ai_use"
  | "export_start"
  | "export_done"
  | "export_fail"
  | "upgrade_click"
  | "signin_click"
  | "error";

type Props = Record<string, string | number | boolean | undefined>;

export interface UsageOptions {
  app: "video" | "photo" | "motion" | "pdf" | "vector" | "hindi" | "website";
  /**
   * default https://viplay.in/api/events, used only on *.viplay.in: elsewhere (localhost, previews, tests)
   * nothing is sent unless an endpoint is given
   */
  endpoint?: string;
  flushMs?: number;
  heartbeatMs?: number;
}

const ANON_COOKIE = "viplay_anon";
const OPT_OUT_COOKIE = "viplay_no_usage";
const SESSION_IDLE_MS = 30 * 60_000;

interface State {
  opts: Required<UsageOptions>;
  anonId: string;
  queue: { name: UsageEvent; at: number; props?: Props }[];
  timers: ReturnType<typeof setInterval>[];
  /** tools reported once per session (the first use is what matters) */
  toolsSeen: Set<string>;
}

let state: State | null = null;

const cookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

/** The shared parent domain (viplay.in) when on it, so every app sees the same cookie. */
const sharedDomain = () => (typeof location !== "undefined" && /(^|\.)viplay\.in$/.test(location.hostname) ? "; domain=.viplay.in" : "");

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

/** Is tracking allowed in this browser? */
export function usageAllowed(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  if (nav.doNotTrack === "1" || nav.msDoNotTrack === "1" || (window as unknown as { doNotTrack?: string }).doNotTrack === "1") return false;
  if (nav.globalPrivacyControl) return false;
  return cookie(OPT_OUT_COOKIE) !== "1";
}

function anonId(): string {
  let id = cookie(ANON_COOKIE);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    try {
      id = localStorage.getItem(ANON_COOKIE);
    } catch {
      id = null;
    }
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) id = randomId();
  }
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ANON_COOKIE}=${id}; path=/; max-age=${400 * 86400}; samesite=lax${sharedDomain()}${secure}`;
  try {
    localStorage.setItem(ANON_COOKIE, id);
  } catch {
    /* private mode */
  }
  return id;
}

/** This tab's visit to this app: a new one after 30 idle minutes. */
function sessionId(app: string): string {
  const key = `viplay_session_${app}`;
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(key);
    const s = raw ? (JSON.parse(raw) as { id: string; last: number }) : null;
    const id = s && now - s.last < SESSION_IDLE_MS ? s.id : randomId();
    sessionStorage.setItem(key, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    return (state as unknown as { fallbackSession?: string })?.fallbackSession ?? randomId();
  }
}

const clean = (props?: Props) => {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined) out[k] = v;
  return out;
};

function flush(useBeacon = false) {
  const s = state;
  if (!s || !s.queue.length) return;
  const events = s.queue.splice(0, 20);
  const body = JSON.stringify({ app: s.opts.app, anonId: s.anonId, sessionId: sessionId(s.opts.app), events });
  try {
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      // text/plain: a "simple" request, so no preflight is needed and the cookies go along
      navigator.sendBeacon(s.opts.endpoint, new Blob([body], { type: "text/plain" }));
    } else {
      void fetch(s.opts.endpoint, { method: "POST", body, keepalive: true, credentials: "include", mode: "cors", headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  } catch {
    /* dropped */
  }
  if (s.queue.length) flush(useBeacon);
}

/** Report an event (does nothing until initUsage has run, or when tracking is off). */
export function track(name: UsageEvent, props?: Props): void {
  const s = state;
  if (!s) return;
  if (name === "tool_use" && typeof props?.tool === "string") {
    if (s.toolsSeen.has(props.tool)) return;
    s.toolsSeen.add(props.tool);
  }
  s.queue.push({ name, at: Date.now(), props: clean(props) });
  if (s.queue.length >= 20) flush();
}

/** Start counting this visit. Safe to call more than once. */
export function initUsage(opts: UsageOptions): void {
  if (state || !usageAllowed()) return;
  if (!opts.endpoint && !/(^|\.)viplay\.in$/.test(location.hostname)) return;
  state = {
    opts: { endpoint: "https://viplay.in/api/events", flushMs: 10_000, heartbeatMs: 60_000, ...opts },
    anonId: anonId(),
    queue: [],
    timers: [],
    toolsSeen: new Set(),
  };
  let ref: string | undefined;
  try {
    const r = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    if (r && r !== location.hostname) ref = r;
  } catch {
    /* no referrer */
  }
  track("app_open", { ref });
  flush();
  const s = state;
  s.timers.push(setInterval(() => flush(), s.opts.flushMs));
  s.timers.push(
    setInterval(() => {
      if (document.visibilityState === "visible") track("heartbeat");
    }, s.opts.heartbeatMs),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      track("heartbeat");
      flush(true);
    }
  });
  window.addEventListener("pagehide", () => flush(true));
}

/** File size as a bucket (the exact size is not sent). */
export function sizeBucket(bytes: number): "<1MB" | "<10MB" | "<100MB" | ">100MB" {
  return bytes < 1 << 20 ? "<1MB" : bytes < 10 << 20 ? "<10MB" : bytes < 100 << 20 ? "<100MB" : ">100MB";
}

/** A one-word reason for a failure: the error's name (AbortError, QuotaExceededError…), never its message. */
export function failReason(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err && typeof err.name === "string" ? err.name : "error";
  return /^[A-Za-z0-9][\w.:+/-]{0,47}$/.test(name) ? name : "error";
}

/** Turn usage data off (or back on) for this browser in every ViPlay app. */
export function setUsageOptOut(off: boolean): void {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = off
    ? `${OPT_OUT_COOKIE}=1; path=/; max-age=${5 * 365 * 86400}; samesite=lax${sharedDomain()}${secure}`
    : `${OPT_OUT_COOKIE}=; path=/; max-age=0; samesite=lax${sharedDomain()}${secure}`;
  if (off && state) {
    state.timers.forEach(clearInterval);
    state = null;
  }
}

export const usageOptedOut = () => cookie(OPT_OUT_COOKIE) === "1";

/** For tests: forget everything. */
export function _resetUsage(): void {
  state?.timers.forEach(clearInterval);
  state = null;
}
