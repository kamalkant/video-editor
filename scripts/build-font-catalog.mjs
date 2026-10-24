#!/usr/bin/env node
/**
 * The Google Fonts library list for the font picker (lib/text/fonts): every family with its kind, scripts
 * and styles, most popular first, written to public/fonts/google-fonts.json. Run it again to pick up new
 * families:
 *
 *   node scripts/build-font-catalog.mjs
 *
 * It reads Google's own list (fonts.google.com/metadata/fonts, no key needed); with GOOGLE_FONTS_API_KEY set
 * it can use the Developer API instead. The fonts themselves load from Google when a project uses them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts", "google-fonts.json");
const NAME = /^[A-Za-z0-9 ]{1,64}$/;
const KIND = { "Sans Serif": "sans", Serif: "serif", Display: "display", Handwriting: "handwriting", Monospace: "mono", "sans-serif": "sans", serif: "serif", display: "display", handwriting: "handwriting", monospace: "mono" };

async function fromMetadata() {
  const res = await fetch("https://fonts.google.com/metadata/fonts", { headers: { "User-Agent": "ViPlay-Studio font list" } });
  if (!res.ok) throw new Error(`fonts.google.com answered ${res.status}`);
  // (Google starts some JSON answers with )]}' so it can't run as a script)
  const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
  const list = JSON.parse(text).familyMetadataList;
  if (!Array.isArray(list)) throw new Error("No family list in the answer.");
  return list.map((f) => ({
    family: f.family,
    category: KIND[f.category] ?? "sans",
    subsets: (f.subsets ?? []).filter((s) => s !== "menu"),
    variants: Object.keys(f.fonts ?? { 400: {} }),
    rank: Number(f.popularity) || 1e9,
  }));
}

async function fromApi(key) {
  const res = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`The Fonts API answered ${res.status}`);
  const { items } = await res.json();
  return items.map((f, i) => ({
    family: f.family,
    category: KIND[f.category] ?? "sans",
    subsets: f.subsets ?? [],
    variants: (f.variants ?? ["regular"]).map((v) => (v === "regular" ? "400" : v === "italic" ? "400i" : v.replace("italic", "i"))),
    rank: i + 1,
  }));
}

const key = process.env.GOOGLE_FONTS_API_KEY;
let fonts;
try {
  fonts = key ? await fromApi(key) : await fromMetadata();
} catch (err) {
  console.error(`Couldn't read the Google Fonts list: ${err.message}`);
  process.exit(1);
}
const rows = fonts
  .filter((f) => typeof f.family === "string" && NAME.test(f.family))
  .sort((a, b) => a.rank - b.rank || a.family.localeCompare(b.family))
  .map((f) => [
    f.family,
    f.category,
    f.subsets.join(","),
    // weights first, then italics, each in order
    [...new Set(f.variants)].sort((a, b) => Number(a.endsWith("i")) - Number(b.endsWith("i")) || parseInt(a) - parseInt(b)).join(","),
  ]);
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ source: key ? "Google Fonts Developer API" : "fonts.google.com/metadata/fonts", families: rows }));
const hindi = rows.filter((r) => r[2].split(",").includes("devanagari")).length;
console.log(`${rows.length} families (${hindi} with Hindi / Devanagari) → ${OUT}`);
