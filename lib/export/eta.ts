/** A moment of an export: when (ms) and how far it was (0–100). */
export type EtaSample = { t: number; pct: number };

/** The speed is measured over the last this many ms (a slower part later on shows soon). */
const WINDOW_MS = 20_000;

/** Seconds left at the speed so far (null: too early to tell). */
export function etaSeconds(samples: EtaSample[]): number | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  if (last.pct >= 100) return 0;
  const first = samples[0];
  if (last.t - first.t < 3000 || last.pct < 3) return null;
  const ref = samples.find((s) => s.t >= last.t - WINDOW_MS && s.t < last.t) ?? first;
  const rate = (last.pct - ref.pct) / (last.t - ref.t);
  if (!(rate > 0)) return null;
  return Math.round((100 - last.pct) / rate / 1000);
}

/** "about 2 min left" ("" when unknown or done). */
export function etaText(s: number | null): string {
  if (s == null || s <= 0) return "";
  if (s < 20) return "a few seconds left";
  if (s < 60) return "less than a minute left";
  const min = Math.round(s / 60);
  if (min < 60) return `about ${min} min left`;
  return `about ${Math.floor(min / 60)} h ${min % 60} min left`;
}
