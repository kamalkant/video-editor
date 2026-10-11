import type { Caption } from "./segments";

/** Subtitle files for YouTube, players and other editors (made in the browser, free). */

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
function stamp(t: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function toSrt(captions: Caption[]): string {
  return captions
    .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.start + c.duration, ",")}\n${c.text.trim()}\n`)
    .join("\n");
}

export function toVtt(captions: Caption[]): string {
  return `WEBVTT\n\n${captions.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.start + c.duration, ".")}\n${c.text.trim()}\n`).join("\n")}`;
}
