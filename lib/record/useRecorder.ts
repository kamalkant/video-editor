"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Recording in the browser: camera, screen, screen + camera, or voice only.
 *
 *   camera          one video (camera + microphone)
 *   screen          one video (screen + microphone + optional tab/computer sound)
 *   screen+camera   two videos started together: the screen (with all the sound)
 *                   and the camera (picture only) — they become two clips
 *   voice           sound only (a voiceover)
 *
 * Files come out as MP4 where the browser can (Safari, new Chrome), else WebM.
 * The server re-encodes them once (lib/ffmpeg/normalize) for smooth editing.
 */

export type RecordMode = "camera" | "screen" | "screenCamera" | "voice";
export type RecordPhase = "idle" | "preparing" | "ready" | "countdown" | "recording" | "paused" | "review";
export type Take = { mode: RecordMode; main: Blob; camera: Blob | null; seconds: number; mainName: string; cameraName: string | null; /** for playing it back */ url: string };
export type Devices = { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] };
export type RecordOptions = { cameraId?: string; micId?: string; mic: boolean; systemAudio: boolean };

const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const VIDEO_ONLY_TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
const AUDIO_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

export function pickType(list: string[]): string {
  if (typeof MediaRecorder === "undefined") return "";
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}
const extOf = (type: string) => (type.startsWith("audio/mp4") ? "m4a" : type.startsWith("audio/") ? "webm" : type.startsWith("video/mp4") ? "mp4" : "webm");
const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

/** Plain-English message for a failed getUserMedia / getDisplayMedia. */
export function mediaError(e: unknown, what: "camera" | "microphone" | "screen"): string {
  const name = (e as DOMException)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return what === "screen" ? "Screen sharing was canceled or blocked. Click “Choose screen” and pick a screen, window or tab." : `The browser blocked the ${what}. Allow it in the address bar (the camera icon), then try again.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No ${what} was found. Plug one in or pick another one.`;
  if (name === "NotReadableError") return `The ${what} is busy (another app may be using it). Close that app and try again.`;
  return `Couldn't start the ${what}${(e as Error)?.message ? `: ${(e as Error).message}` : ""}.`;
}

export function useRecorder(maxSeconds: number) {
  const [phase, setPhase] = useState<RecordPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<Devices>({ cameras: [], mics: [] });
  const [take, setTake] = useState<Take | null>(null);
  const [streams, setStreams] = useState<{ camera: MediaStream | null; screen: MediaStream | null }>({ camera: null, screen: null });

  const live = useRef<{ camera: MediaStream | null; screen: MediaStream | null; mic: MediaStream | null; mode: RecordMode }>({ camera: null, screen: null, mic: null, mode: "camera" });
  const audioCtx = useRef<AudioContext | null>(null);
  const recorders = useRef<{ main: MediaRecorder | null; camera: MediaRecorder | null }>({ main: null, camera: null });
  const chunks = useRef<{ main: Blob[]; camera: Blob[] }>({ main: [], camera: [] });
  const clock = useRef<{ startedAt: number; pausedAt: number | null; pausedTotal: number }>({ startedAt: 0, pausedAt: null, pausedTotal: 0 });
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; count?: ReturnType<typeof setInterval>; meter?: number }>({});
  const stopRef = useRef<() => void>(() => {});

  const listDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({ cameras: all.filter((d) => d.kind === "videoinput"), mics: all.filter((d) => d.kind === "audioinput") });
    } catch {
      /* no list: the defaults are used */
    }
  }, []);

  /** Stop every camera, microphone and screen track and the level meter. */
  const release = useCallback(() => {
    const l = live.current;
    for (const s of [l.camera, l.screen, l.mic]) s?.getTracks().forEach((t) => t.stop());
    live.current = { camera: null, screen: null, mic: null, mode: l.mode };
    if (timers.current.meter) cancelAnimationFrame(timers.current.meter);
    timers.current.meter = undefined;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    setStreams({ camera: null, screen: null });
    setLevel(0);
  }, []);

  const meter = (mic: MediaStream) => {
    const ctx = audioCtx.current ?? new AudioContext();
    audioCtx.current = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(mic).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let last = 0;
    const loop = (now: number) => {
      if (now - last > 66) {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        last = now;
      }
      timers.current.meter = requestAnimationFrame(loop);
    };
    timers.current.meter = requestAnimationFrame(loop);
  };

  /** Ask for the camera / microphone / screen and show them live. Call from a click (screen sharing needs it). */
  const prepare = useCallback(
    async (mode: RecordMode, o: RecordOptions) => {
      release();
      setError(null);
      setTake(null);
      setPhase("preparing");
      live.current.mode = mode;
      const wantCamera = mode === "camera" || mode === "screenCamera";
      const wantScreen = mode === "screen" || mode === "screenCamera";
      const wantMic = mode === "voice" || o.mic;
      try {
        if (wantScreen) {
          try {
            live.current.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: o.systemAudio });
          } catch (e) {
            throw new Error(mediaError(e, "screen"));
          }
          // "Stop sharing" in the browser bar ends the recording
          live.current.screen.getVideoTracks()[0]?.addEventListener("ended", () => stopRef.current());
        }
        if (wantCamera) {
          try {
            live.current.camera = await navigator.mediaDevices.getUserMedia({ video: { deviceId: o.cameraId ? { exact: o.cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
          } catch (e) {
            throw new Error(mediaError(e, "camera"));
          }
        }
        if (wantMic) {
          try {
            live.current.mic = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.micId ? { exact: o.micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            meter(live.current.mic);
          } catch (e) {
            throw new Error(mediaError(e, "microphone"));
          }
        }
        setStreams({ camera: live.current.camera, screen: live.current.screen });
        void listDevices();
        setPhase("ready");
      } catch (e) {
        release();
        setError((e as Error).message);
        setPhase("idle");
      }
    },
    [listDevices, release],
  );

  /** The stream recorded as the main file: picture (screen or camera) + all the sound, mixed. */
  const mainStream = (): MediaStream => {
    const l = live.current;
    const video = (l.mode === "camera" ? l.camera : l.mode === "voice" ? null : l.screen)?.getVideoTracks() ?? [];
    const sounds = [l.mic, l.mode === "camera" ? null : l.screen].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
    let audio: MediaStreamTrack[] = [];
    if (sounds.length === 1) audio = sounds[0].getAudioTracks();
    else if (sounds.length > 1) {
      const ctx = audioCtx.current ?? new AudioContext();
      audioCtx.current = ctx;
      const out = ctx.createMediaStreamDestination();
      for (const s of sounds) ctx.createMediaStreamSource(s).connect(out);
      audio = out.stream.getAudioTracks();
    }
    return new MediaStream([...video, ...audio]);
  };

  const begin = () => {
    const l = live.current;
    const stream = mainStream();
    const hasVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;
    const type = !hasVideo ? pickType(AUDIO_TYPES) : hasAudio ? pickType(VIDEO_TYPES) : pickType(VIDEO_ONLY_TYPES);
    chunks.current = { main: [], camera: [] };
    const main = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 } : undefined);
    main.ondataavailable = (e) => e.data.size && chunks.current.main.push(e.data);
    let camera: MediaRecorder | null = null;
    if (l.mode === "screenCamera" && l.camera) {
      const ct = pickType(VIDEO_ONLY_TYPES);
      camera = new MediaRecorder(new MediaStream(l.camera.getVideoTracks()), ct ? { mimeType: ct, videoBitsPerSecond: 4_000_000 } : undefined);
      camera.ondataavailable = (e) => e.data.size && chunks.current.camera.push(e.data);
    }
    recorders.current = { main, camera };
    // both start in the same moment, so the camera bubble stays in sync with the screen
    main.start(1000);
    camera?.start(1000);
    clock.current = { startedAt: performance.now(), pausedAt: null, pausedTotal: 0 };
    setSeconds(0);
    setPhase("recording");
    timers.current.tick = setInterval(() => {
      const c = clock.current;
      const s = (performance.now() - c.startedAt - c.pausedTotal - (c.pausedAt ? performance.now() - c.pausedAt : 0)) / 1000;
      setSeconds(s);
      if (s >= maxSeconds) stopRef.current();
    }, 200);
  };

  /** 3-2-1, then record. */
  const start = useCallback(
    (count = 3) => {
      if (phase !== "ready") return;
      if (count <= 0) return begin();
      setCountdown(count);
      setPhase("countdown");
      let n = count;
      timers.current.count = setInterval(() => {
        n -= 1;
        setCountdown(n);
        if (n <= 0) {
          clearInterval(timers.current.count);
          begin();
        }
      }, 1000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase],
  );

  const pause = () => {
    const r = recorders.current;
    if (r.main?.state !== "recording") return;
    r.main.pause();
    r.camera?.pause();
    clock.current.pausedAt = performance.now();
    setPhase("paused");
  };
  const resume = () => {
    const r = recorders.current;
    if (r.main?.state !== "paused") return;
    r.main.resume();
    r.camera?.resume();
    const c = clock.current;
    if (c.pausedAt) c.pausedTotal += performance.now() - c.pausedAt;
    c.pausedAt = null;
    setPhase("recording");
  };

  const stop = () => {
    clearInterval(timers.current.tick);
    clearInterval(timers.current.count);
    const r = recorders.current;
    if (!r.main || r.main.state === "inactive") {
      if (phase === "countdown") setPhase("ready");
      return;
    }
    const done = (rec: MediaRecorder | null) => (rec && rec.state !== "inactive" ? new Promise<void>((res) => rec.addEventListener("stop", () => res(), { once: true })) : Promise.resolve());
    const wait = Promise.all([done(r.main), done(r.camera)]);
    r.main.stop();
    r.camera?.stop();
    const c = clock.current;
    const secs = (performance.now() - c.startedAt - c.pausedTotal - (c.pausedAt ? performance.now() - c.pausedAt : 0)) / 1000;
    const mode = live.current.mode;
    void wait.then(() => {
      const mt = r.main!.mimeType || "video/webm";
      const main = new Blob(chunks.current.main, { type: mt.split(";")[0] });
      const cam = r.camera ? new Blob(chunks.current.camera, { type: (r.camera.mimeType || "video/webm").split(";")[0] }) : null;
      const when = stamp();
      const base = mode === "voice" ? "Voiceover" : mode === "camera" ? "Camera" : "Screen recording";
      setTake({ mode, main, camera: cam, seconds: secs, mainName: `${base} ${when}.${extOf(main.type)}`, cameraName: cam ? `Camera ${when}.${extOf(cam.type)}` : null, url: URL.createObjectURL(main) });
      recorders.current = { main: null, camera: null };
      release();
      setPhase("review");
    });
  };
  useEffect(() => {
    stopRef.current = stop;
  });

  /** Throw the take away and go back to the live view (asks for the devices again). */
  const discard = () => {
    setTake((t) => {
      if (t) URL.revokeObjectURL(t.url);
      return null;
    });
    setPhase("idle");
  };

  // closing the recorder lets go of the camera and microphone
  useEffect(
    () => () => {
      clearInterval(timers.current.tick);
      clearInterval(timers.current.count);
      const r = recorders.current;
      if (r.main && r.main.state !== "inactive") r.main.stop();
      if (r.camera && r.camera.state !== "inactive") r.camera.stop();
      release();
    },
    [release],
  );

  return { phase, error, seconds, countdown, level, devices, take, streams, prepare, start, pause, resume, stop, discard, release, listDevices, setError };
}
