import { fontSet } from "../render/surface";

/**
 * Fonts of text and elements: the five built-in looks (the computer's own fonts), the whole Google Fonts
 * library ("gf:<Family>", loaded from Google when a project uses it) and your own fonts (Brand Kit,
 * "brand:<id>"). Text is drawn by the browser for the preview and for both exports, so a font only has to
 * be in this page: ensureFont / ensureDocFonts load what a timeline uses before it is drawn.
 */

export type BuiltinFont = "sans" | "serif" | "rounded" | "mono" | "condensed";
export const FONTS: Record<BuiltinFont, { label: string; stack: string }> = {
  sans: { label: "Sans (clean)", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  serif: { label: "Serif (classic)", stack: 'Georgia, "Times New Roman", Times, serif' },
  rounded: { label: "Rounded (friendly)", stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", ui-sans-serif, system-ui, sans-serif' },
  mono: { label: "Mono (code)", stack: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  condensed: { label: "Condensed (news)", stack: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif' },
};
export const BUILTIN_FONTS = Object.keys(FONTS) as BuiltinFont[];

/** A Google font's id in a project ("gf:Poppins"); names are letters, digits and spaces. */
export const GOOGLE_FONT_ID = /^gf:[A-Za-z0-9 ]{1,64}$/;
export const googleFontId = (family: string) => `gf:${family}`;
export const isGoogleFont = (id: string) => GOOGLE_FONT_ID.test(id);

/** The CSS family name of a Brand Kit font (loaded into the page with FontFace). */
export const brandFamily = (id: string) => `VDO Brand ${id}`;

/** The family a font id draws with (null for the built-in stacks). */
export function familyOf(font: string): string | null {
  if (font.startsWith("brand:")) return brandFamily(font.slice(6));
  if (isGoogleFont(font)) return font.slice(3);
  return null;
}

/** The font stack of a font id: a Google or Brand Kit font falls back to Sans until it has loaded. */
export function fontStack(font: string): string {
  const fam = familyOf(font);
  return fam ? `"${fam}", ${FONTS.sans.stack}` : (FONTS[font as BuiltinFont] ?? FONTS.sans).stack;
}

/** A CSS font string for canvas text. */
export const fontCssOf = (font: string, px: number, bold: boolean, italic = false) => `${italic ? "italic " : ""}${bold ? 700 : 400} ${Math.max(1, Math.round(px))}px ${fontStack(font)}`;

/** The pixel size in a CSS font string. */
export const fontPx = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);

/** A short name for a font id (the font lists, the toolbar). */
export function fontLabel(font: string, brandName?: (id: string) => string | undefined): string {
  if (isGoogleFont(font)) return font.slice(3);
  if (font.startsWith("brand:")) return brandName?.(font.slice(6)) ?? "Brand font";
  return FONTS[font as BuiltinFont]?.label ?? FONTS.sans.label;
}

// ---------- the Google Fonts library ----------

export type FontCategory = "sans" | "serif" | "display" | "handwriting" | "mono";
/** One family of the library: its name, kind, scripts (subsets) and styles ("400", "700", "400i"…). */
export type CatalogFont = { family: string; category: FontCategory; subsets: string[]; variants: string[] };

/** The library list is built by scripts/build-font-catalog.mjs (from Google's own list) into public/fonts. */
export const CATALOG_URL = "/fonts/google-fonts.json";
let catalog: Promise<CatalogFont[]> | null = null;

/** Parse the compact list ([family, category, "sub,sets", "400,700,400i"] rows). */
export function parseCatalog(raw: unknown): CatalogFont[] {
  const rows = (raw as { families?: unknown })?.families;
  if (!Array.isArray(rows)) return [];
  const out: CatalogFont[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || typeof r[0] !== "string" || !GOOGLE_FONT_ID.test(`gf:${r[0]}`)) continue;
    out.push({ family: r[0], category: (["sans", "serif", "display", "handwriting", "mono"].includes(r[1]) ? r[1] : "sans") as FontCategory, subsets: String(r[2] ?? "").split(",").filter(Boolean), variants: String(r[3] ?? "400").split(",").filter(Boolean) });
  }
  return out;
}

/** The Google Fonts library (most popular first), fetched once. */
export function fontCatalog(): Promise<CatalogFont[]> {
  if (!catalog) {
    catalog = fetch(CATALOG_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then(parseCatalog)
      .catch(() => {
        catalog = null; // (try again next time)
        return [];
      });
  }
  return catalog;
}

let byFamily: Map<string, CatalogFont> | null = null;
async function catalogEntry(family: string): Promise<CatalogFont | null> {
  if (!byFamily) byFamily = new Map((await fontCatalog()).map((f) => [f.family, f]));
  return byFamily.get(family) ?? null;
}

/** The weight of `want` this family has (the nearest, preferring heavier for bold). */
function nearestWeight(weights: number[], want: number): number | null {
  if (!weights.length) return null;
  return [...weights].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || (want >= 600 ? b - a : a - b))[0];
}

/**
 * The Google Fonts CSS address for a family: its regular and bold (and their italics), only those it really
 * has (the CSS API refuses styles a family lacks). Without the family's details: just its regular style.
 */
export function cssUrlFor(family: string, entry: Pick<CatalogFont, "variants"> | null): string {
  const name = encodeURIComponent(family).replace(/%20/g, "+");
  const base = "https://fonts.googleapis.com/css2?family=";
  if (!entry) return `${base}${name}&display=swap`;
  const upright = entry.variants.filter((v) => /^\d+$/.test(v)).map(Number);
  const italic = entry.variants.filter((v) => /^\d+i$/.test(v)).map((v) => Number(v.slice(0, -1)));
  const pick = (ws: number[]) => [...new Set([nearestWeight(ws, 400), nearestWeight(ws, 700)].filter((w): w is number => w != null))].sort((a, b) => a - b);
  const up = pick(upright);
  const it = pick(italic);
  if (!it.length) {
    if (up.length === 1 && up[0] === 400) return `${base}${name}&display=swap`;
    return `${base}${name}:wght@${up.join(";")}&display=swap`;
  }
  const pairs = [...up.map((w) => `0,${w}`), ...it.map((w) => `1,${w}`)];
  return `${base}${name}:ital,wght@${pairs.join(";")}&display=swap`;
}

const sheets = new Map<string, Promise<void>>();
/** Put a Google family's stylesheet in the page (once). */
function addSheet(family: string): Promise<void> {
  let p = sheets.get(family);
  if (!p) {
    p = (async () => {
      const href = cssUrlFor(family, await catalogEntry(family));
      await new Promise<void>((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.font = family;
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
      });
    })();
    sheets.set(family, p);
  }
  return p;
}

/** One @font-face of a Google Fonts stylesheet: its file and descriptors. */
export type FaceRule = { family: string; url: string; style: string; weight: string; unicodeRange?: string };

/** The @font-face rules of a stylesheet (Google's: one per style and script, each with its letters' range). */
export function parseFontFaces(css: string): FaceRule[] {
  const out: FaceRule[] = [];
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const body = m[1];
    const prop = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body)?.[1].trim();
    const family = prop("font-family")?.replace(/^['"]|['"]$/g, "");
    const url = /src\s*:[^;]*?url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(body)?.[1];
    if (!family || !url) continue;
    const range = prop("unicode-range");
    out.push({ family, url, style: prop("font-style") ?? "normal", weight: prop("font-weight") ?? "400", ...(range ? { unicodeRange: range } : {}) });
  }
  return out;
}

const workerSheets = new Map<string, Promise<void>>();
/**
 * A Google family in a Worker (the export draws there, lib/export/worker): no <link> can be added, so its
 * stylesheet is read and each face added to the Worker's fonts. Only the faces a text needs are downloaded,
 * by their letters, as on the page.
 */
function addFaces(family: string, set: FontFaceSet): Promise<void> {
  let p = workerSheets.get(family);
  if (!p) {
    p = (async () => {
      const css = await fetch(cssUrlFor(family, await catalogEntry(family))).then((r) => (r.ok ? r.text() : ""), () => "");
      for (const f of parseFontFaces(css)) set.add(new FontFace(f.family, `url(${f.url})`, { style: f.style, weight: f.weight, ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}) }));
    })();
    workerSheets.set(family, p);
  }
  return p;
}

const brandFaces = new Set<string>();
/** Load a Brand Kit font into the page (FontFace from /api/brand/fonts/<id>). */
export async function ensureBrandFont(id: string): Promise<boolean> {
  if (brandFaces.has(id)) return true;
  const set = fontSet();
  if (typeof FontFace === "undefined" || !set) return false;
  try {
    const face = new FontFace(brandFamily(id), `url(/api/brand/fonts/${id})`);
    await face.load();
    set.add(face);
    brandFaces.add(id);
    return true;
  } catch {
    return false; // (a broken or removed font: the text falls back to Sans)
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

/**
 * Make sure a font is ready to draw `text` (the letters it needs: a Hindi text loads the Devanagari part
 * of a Google font). Never waits more than a few seconds: without the network the text uses Sans.
 */
export async function ensureFont(font: string, o: { bold?: boolean; italic?: boolean } = {}, text = ""): Promise<void> {
  const set = fontSet();
  if (!set) return;
  if (font.startsWith("brand:")) await ensureBrandFont(font.slice(6));
  // (a Worker has no document: the stylesheet's faces are added one by one)
  else if (isGoogleFont(font)) await withTimeout(typeof document !== "undefined" ? addSheet(font.slice(3)) : addFaces(font.slice(3), set), 8000);
  else return;
  await withTimeout(set.load(fontCssOf(font, 32, !!o.bold, !!o.italic), text || "AaBb").catch(() => undefined), 8000);
}

/** One font a timeline uses: which face, and the letters drawn with it. */
type FontNeed = { font: string; bold: boolean; italic: boolean; text: string };

/** Every font face a timeline's texts and elements use, with their letters (one entry per face). */
export function fontNeeds(doc: { tracks: { clips: unknown[] }[] }): FontNeed[] {
  const map = new Map<string, FontNeed>();
  const add = (font: string | undefined, bold: boolean, italic: boolean, text: string | undefined) => {
    if (!font || (!font.startsWith("brand:") && !isGoogleFont(font)) || !text) return;
    const key = `${font}|${bold}|${italic}`;
    const e = map.get(key);
    if (e) {
      // (the letters only once each, and not too many)
      if (e.text.length < 2000) for (const ch of text) if (!e.text.includes(ch)) e.text += ch;
    } else map.set(key, { font, bold, italic, text: [...new Set([...text])].join("") });
  };
  for (const t of doc.tracks)
    for (const raw of t.clips) {
      const c = raw as { type: string; text?: string; style?: { font: string; bold: boolean; italic?: boolean; preset?: string }; marks?: { from: number; to: number; font?: string; bold?: boolean; italic?: boolean }[]; el?: { font?: string; bold?: boolean; text?: string; subText?: string; label?: string } };
      if (c.type === "text" && c.style && typeof c.text === "string") {
        const text = c.style.preset === "breaking" ? `${c.text.toUpperCase()}BREAKING` : c.text;
        // (a lower third's first line is bold, its other lines regular)
        add(c.style.font, c.style.bold || c.style.preset === "lowerThird" || c.style.preset === "breaking", !!c.style.italic, text);
        if (c.style.preset === "lowerThird") add(c.style.font, false, !!c.style.italic, text);
        for (const m of c.marks ?? []) add(m.font ?? c.style.font, m.bold ?? c.style.bold, m.italic ?? !!c.style.italic, c.text.slice(m.from, m.to));
      }
      if (c.type === "element" && c.el?.font) add(c.el.font, c.el.bold !== false, false, `${c.el.text ?? ""}${c.el.subText ?? ""}${c.el.label ?? ""}`);
    }
  return [...map.values()];
}

/** Load every font a timeline uses (before drawing it for an export; the preview redraws when fonts arrive). */
export async function ensureDocFonts(doc: { tracks: { clips: unknown[] }[] }): Promise<void> {
  const set = fontSet();
  const needs = fontNeeds(doc);
  if (!set || !needs.length) return;
  await Promise.all(needs.map((n) => ensureFont(n.font, n, n.text)));
  // (a Worker's set may never say it's ready; each face's load above already waited for it)
  if (typeof document !== "undefined") await withTimeout(set.ready.then(() => undefined), 8000);
}

// ---------- the font list's previews ----------

const previews = new Map<string, Promise<string | null>>();
/**
 * A tiny copy of a Google font with only the letters of its own name (the font list shows each name in its
 * font). It gets a family of its own, so it never stands in for the real font. Returns that family, or null.
 */
export function previewFamily(family: string): Promise<string | null> {
  let p = previews.get(family);
  if (!p) {
    p = (async () => {
      if (typeof FontFace === "undefined") return null;
      try {
        const name = encodeURIComponent(family).replace(/%20/g, "+");
        const css = await fetch(`https://fonts.googleapis.com/css2?family=${name}&text=${encodeURIComponent(family)}`).then((r) => (r.ok ? r.text() : ""));
        const url = /src:\s*url\(([^)]+)\)/.exec(css)?.[1];
        if (!url) return null;
        const fam = `VDO pv ${family}`;
        const face = new FontFace(fam, `url(${url})`);
        await face.load();
        document.fonts.add(face);
        return fam;
      } catch {
        return null;
      }
    })();
    previews.set(family, p);
  }
  return p;
}

// ---------- recently used ----------

const RECENT_KEY = "VDO:recentFonts";
export function recentFonts(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}
export function rememberFont(font: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([font, ...recentFonts().filter((f) => f !== font)].slice(0, 12)));
  } catch {
    /* private window: not remembered */
  }
}
