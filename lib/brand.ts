import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { readJson, storagePath, writeJson } from "./storage";
import { watermarkLookSchema } from "./edit/doc";

/**
 * Brand Kit (for all projects): your logo, brand colors, your own fonts,
 * and an intro and outro clip. Stored in storage/brand.json; fonts in
 * storage/brand-fonts. Uploads it uses are kept by the cleanup.
 */

const uuid = z.string().uuid();
export const brandFontSchema = z.object({ id: z.string().regex(/^[a-f0-9]{12}$/), name: z.string().max(60), format: z.enum(["truetype", "opentype", "woff", "woff2"]) });
export const brandVideoSchema = z.object({
  id: uuid,
  name: z.string().max(100),
  duration: z.number().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export const brandSchema = z.object({
  logo: uuid.nullable().optional(),
  colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(8),
  fonts: z.array(brandFontSchema).max(12),
  videos: z.array(brandVideoSchema).max(20).optional().default([]),
  intro: uuid.nullable().optional(),
  outro: uuid.nullable().optional(),
  /** How the logo was last shown (corner or place, size, box, animation…): switching it on again brings that back. */
  logoLook: watermarkLookSchema.nullable().optional(),
});
export type Brand = z.infer<typeof brandSchema>;
export type BrandFont = z.infer<typeof brandFontSchema>;
export type BrandVideo = z.infer<typeof brandVideoSchema>;

export const brandKitSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  brand: brandSchema,
});
export type BrandKit = z.infer<typeof brandKitSchema>;

export const multiBrandStoreSchema = z.object({
  activeId: z.string(),
  kits: z.array(brandKitSchema).min(1),
});
export type MultiBrandStore = z.infer<typeof multiBrandStoreSchema>;

export const EMPTY_BRAND: Brand = { logo: null, colors: [], fonts: [], videos: [], intro: null, outro: null };

export type ActiveBrandResult = Brand & {
  activeId: string;
  kits: { id: string; name: string }[];
};

const file = () => storagePath("brand.json");
const fontDir = () => storagePath("brand-fonts");
const EXT: Record<BrandFont["format"], string> = { truetype: "ttf", opentype: "otf", woff: "woff", woff2: "woff2" };
export const FONT_MIME: Record<BrandFont["format"], string> = { truetype: "font/ttf", opentype: "font/otf", woff: "font/woff", woff2: "font/woff2" };
export const MAX_FONT_BYTES = 8 * 1024 * 1024;

export class BrandError extends Error {}

export async function getStore(): Promise<MultiBrandStore> {
  const raw = await readJson<unknown>(file());
  const multi = multiBrandStoreSchema.safeParse(raw);
  if (multi.success) return multi.data;

  const legacy = brandSchema.safeParse(raw);
  if (legacy.success) {
    const migrated: MultiBrandStore = {
      activeId: "default",
      kits: [{ id: "default", name: "Default Brand", brand: legacy.data }],
    };
    await writeStore(migrated).catch(() => undefined);
    return migrated;
  }

  return {
    activeId: "default",
    kits: [{ id: "default", name: "Default Brand", brand: EMPTY_BRAND }],
  };
}

async function writeStore(store: MultiBrandStore): Promise<void> {
  await mkdir(dirname(file()), { recursive: true });
  await writeJson(file(), store);
}

export async function getBrand(): Promise<ActiveBrandResult> {
  const store = await getStore();
  const active = store.kits.find((k) => k.id === store.activeId) ?? store.kits[0];
  return {
    ...EMPTY_BRAND,
    ...active.brand,
    activeId: active.id,
    kits: store.kits.map((k) => ({ id: k.id, name: k.name })),
  };
}

/** Change the logo, colors, intro or outro of the active kit. */
export async function saveBrand(patch: Partial<Omit<Brand, "fonts">>): Promise<ActiveBrandResult> {
  const store = await getStore();
  const index = store.kits.findIndex((k) => k.id === store.activeId);
  const activeIndex = index >= 0 ? index : 0;
  const curKit = store.kits[activeIndex];
  const nextBrand = brandSchema.parse({ ...curKit.brand, ...patch, fonts: curKit.brand.fonts });
  store.kits[activeIndex] = { ...curKit, brand: nextBrand };
  await writeStore(store);
  return getBrand();
}

/** Create a new brand kit and set it as active. */
export async function createKit(name: string): Promise<ActiveBrandResult> {
  const store = await getStore();
  const trimmed = name.trim().slice(0, 60) || `Brand Kit ${store.kits.length + 1}`;
  const id = `kit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  store.kits.push({ id, name: trimmed, brand: EMPTY_BRAND });
  store.activeId = id;
  await writeStore(store);
  return getBrand();
}

/** Switch active brand kit. */
export async function switchKit(id: string): Promise<ActiveBrandResult> {
  const store = await getStore();
  if (store.kits.some((k) => k.id === id)) {
    store.activeId = id;
    await writeStore(store);
  }
  return getBrand();
}

/** Rename a brand kit. */
export async function renameKit(id: string, name: string): Promise<ActiveBrandResult> {
  const store = await getStore();
  const kit = store.kits.find((k) => k.id === id);
  if (kit) {
    kit.name = name.trim().slice(0, 60) || kit.name;
    await writeStore(store);
  }
  return getBrand();
}

/** Delete a brand kit. */
export async function deleteKit(id: string): Promise<ActiveBrandResult> {
  const store = await getStore();
  if (store.kits.length <= 1) {
    throw new BrandError("Cannot delete the only Brand Kit.");
  }
  store.kits = store.kits.filter((k) => k.id !== id);
  if (store.activeId === id) {
    store.activeId = store.kits[0].id;
  }
  await writeStore(store);
  return getBrand();
}

/** What kind of font file this is, by its first bytes (never by its name). */
export function fontFormat(buf: Buffer): BrandFont["format"] | null {
  if (buf.length < 12) return null;
  const tag = buf.toString("latin1", 0, 4);
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "opentype";
  if (tag === "true" || buf.readUInt32BE(0) === 0x00010000) return "truetype";
  return null;
}

export async function addFont(buf: Buffer, name: string): Promise<{ brand: ActiveBrandResult; font: BrandFont }> {
  if (buf.length > MAX_FONT_BYTES) throw new BrandError("That font file is too big (8 MB at most).");
  const format = fontFormat(buf);
  if (!format) throw new BrandError("That isn't a font file. Use TTF, OTF, WOFF or WOFF2.");
  const store = await getStore();
  const index = store.kits.findIndex((k) => k.id === store.activeId);
  const activeIndex = index >= 0 ? index : 0;
  const curKit = store.kits[activeIndex];
  if (curKit.brand.fonts.length >= 12) throw new BrandError("The Brand Kit holds 12 fonts. Remove one first.");
  const id = createHash("sha1").update(buf).digest("hex").slice(0, 12);
  const font: BrandFont = { id, name: name.replace(/\.[^.]+$/, "").replace(/[^\w .\-()]/g, "").slice(0, 60) || "My font", format };
  await mkdir(fontDir(), { recursive: true });
  await writeFile(fontPath(font), buf);
  const updatedBrand = brandSchema.parse({ ...curKit.brand, fonts: [...curKit.brand.fonts.filter((f) => f.id !== id), font] });
  store.kits[activeIndex] = { ...curKit, brand: updatedBrand };
  await writeStore(store);
  const brand = await getBrand();
  return { brand, font };
}

export async function removeFont(id: string): Promise<ActiveBrandResult> {
  const store = await getStore();
  const index = store.kits.findIndex((k) => k.id === store.activeId);
  const activeIndex = index >= 0 ? index : 0;
  const curKit = store.kits[activeIndex];
  const f = curKit.brand.fonts.find((x) => x.id === id);
  if (f) await rm(fontPath(f), { force: true });
  const updatedBrand = { ...curKit.brand, fonts: curKit.brand.fonts.filter((x) => x.id !== id) };
  store.kits[activeIndex] = { ...curKit, brand: updatedBrand };
  await writeStore(store);
  return getBrand();
}

export const fontPath = (f: BrandFont) => storagePath("brand-fonts", `${f.id}.${EXT[f.format]}`);

/** The uploads the Brand Kit uses (kept by the 24-hour cleanup). */
export async function brandMediaIds(): Promise<string[]> {
  const store = await getStore();
  const ids: string[] = [];
  for (const k of store.kits) {
    if (k.brand.logo) ids.push(k.brand.logo);
    if (k.brand.intro) ids.push(k.brand.intro);
    if (k.brand.outro) ids.push(k.brand.outro);
    for (const v of k.brand.videos ?? []) {
      if (v.id) ids.push(v.id);
    }
  }
  return [...new Set(ids)];
}
