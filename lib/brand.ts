import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { readJson, storagePath, writeJson } from "./storage";
import { watermarkLookSchema } from "./edit/doc";

/**
 * Brand Kits (for all of a person's projects): their logo, brand colors, their own fonts, and intro and
 * outro clips. Each person has their own: storage/brand/<user id>.json, fonts in storage/brand-fonts/<user
 * id>/. (Before, one storage/brand.json was shared by everyone on the server, and anyone could change it:
 * it moves once to the person whose files it uses, else to the first super admin.)
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
/** How many of your own fonts one Brand Kit holds. */
export const MAX_BRAND_FONTS = 50;
export const brandSchema = z.object({
  logo: uuid.nullable().optional(),
  colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(8),
  fonts: z.array(brandFontSchema).max(MAX_BRAND_FONTS),
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

const USER_ID = /^[\w-]{1,80}$/;
const userOk = (userId: string) => {
  if (!USER_ID.test(userId)) throw new BrandError("Unknown account.");
  return userId;
};
const file = (userId: string) => storagePath("brand", `${userOk(userId)}.json`);
const fontDir = (userId: string) => storagePath("brand-fonts", userOk(userId));
const LEGACY = () => storagePath("brand.json");
const EXT: Record<BrandFont["format"], string> = { truetype: "ttf", opentype: "otf", woff: "woff", woff2: "woff2" };
export const FONT_MIME: Record<BrandFont["format"], string> = { truetype: "font/ttf", opentype: "font/otf", woff: "font/woff", woff2: "font/woff2" };
export const MAX_FONT_BYTES = 8 * 1024 * 1024;

export class BrandError extends Error {}

/** A stored kit file (the multi-kit shape, or the oldest single-kit one) as a store; null when it isn't one. */
function storeOf(raw: unknown): MultiBrandStore | null {
  const multi = multiBrandStoreSchema.safeParse(raw);
  if (multi.success) return multi.data;
  const legacy = brandSchema.safeParse(raw);
  if (legacy.success) return { activeId: "default", kits: [{ id: "default", name: "Default Brand", brand: legacy.data }] };
  return null;
}

/** The uploads a store uses (its logos, intros, outros, brand videos). */
function storeMedia(store: MultiBrandStore): string[] {
  const ids: string[] = [];
  for (const k of store.kits) {
    if (k.brand.logo) ids.push(k.brand.logo);
    if (k.brand.intro) ids.push(k.brand.intro);
    if (k.brand.outro) ids.push(k.brand.outro);
    for (const v of k.brand.videos ?? []) if (v.id) ids.push(v.id);
  }
  return [...new Set(ids)];
}

let migrating: Promise<void> | null = null;
/**
 * The shared storage/brand.json of older versions goes to the person whose uploads it uses (else the first
 * super admin), once; its fonts move into their folder. The old file is kept as brand.legacy.json.
 */
function migrateLegacy(): Promise<void> {
  migrating ??= (async () => {
    const raw = await readJson<unknown>(LEGACY());
    if (raw == null) return;
    const store = storeOf(raw);
    if (!store) return;
    let owner: string | null = null;
    const { getVideo } = await import("./videos");
    for (const id of storeMedia(store)) {
      const m = await getVideo(id).catch(() => null);
      if (m?.userId && m.userId !== "local" && USER_ID.test(m.userId)) {
        owner = m.userId;
        break;
      }
    }
    if (!owner) {
      try {
        const { getDb } = await import("./db/index");
        const row = getDb().prepare("SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
        owner = row?.id && USER_ID.test(row.id) ? row.id : null;
      } catch {
        owner = null;
      }
    }
    if (!owner) return;
    const target = file(owner);
    const exists = await stat(target).then(() => true, () => false);
    if (!exists) {
      await mkdir(dirname(target), { recursive: true });
      await writeJson(target, store);
    }
    // its fonts, into the owner's folder
    await mkdir(fontDir(owner), { recursive: true });
    for (const k of store.kits)
      for (const f of k.brand.fonts) {
        const from = storagePath("brand-fonts", `${f.id}.${EXT[f.format]}`);
        await rename(from, fontPath(owner, f)).catch(() => undefined);
      }
    await rename(LEGACY(), storagePath("brand.legacy.json")).catch(() => undefined);
  })().catch(() => {
    migrating = null;
  });
  return migrating;
}

export async function getStore(userId: string): Promise<MultiBrandStore> {
  await migrateLegacy();
  const store = storeOf(await readJson<unknown>(file(userId)));
  return store ?? { activeId: "default", kits: [{ id: "default", name: "Default Brand", brand: EMPTY_BRAND }] };
}

async function writeStore(userId: string, store: MultiBrandStore): Promise<void> {
  await mkdir(dirname(file(userId)), { recursive: true });
  await writeJson(file(userId), store);
}

export async function getBrand(userId: string): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  const active = store.kits.find((k) => k.id === store.activeId) ?? store.kits[0];
  return {
    ...EMPTY_BRAND,
    ...active.brand,
    activeId: active.id,
    kits: store.kits.map((k) => ({ id: k.id, name: k.name })),
  };
}

const activeOf = (store: MultiBrandStore) => {
  const index = store.kits.findIndex((k) => k.id === store.activeId);
  return index >= 0 ? index : 0;
};

/** Change the logo, colors, intro or outro of the active kit. */
export async function saveBrand(userId: string, patch: Partial<Omit<Brand, "fonts">>): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  const i = activeOf(store);
  const curKit = store.kits[i];
  const nextBrand = brandSchema.parse({ ...curKit.brand, ...patch, fonts: curKit.brand.fonts });
  store.kits[i] = { ...curKit, brand: nextBrand };
  await writeStore(userId, store);
  return getBrand(userId);
}

/** Create a new brand kit and set it as active. */
export async function createKit(userId: string, name: string): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  if (store.kits.length >= 20) throw new BrandError("You have 20 Brand Kits. Delete one first.");
  const trimmed = name.trim().slice(0, 60) || `Brand Kit ${store.kits.length + 1}`;
  const id = `kit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  store.kits.push({ id, name: trimmed, brand: EMPTY_BRAND });
  store.activeId = id;
  await writeStore(userId, store);
  return getBrand(userId);
}

/** Switch active brand kit. */
export async function switchKit(userId: string, id: string): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  if (store.kits.some((k) => k.id === id)) {
    store.activeId = id;
    await writeStore(userId, store);
  }
  return getBrand(userId);
}

/** Rename a brand kit. */
export async function renameKit(userId: string, id: string, name: string): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  const kit = store.kits.find((k) => k.id === id);
  if (kit) {
    kit.name = name.trim().slice(0, 60) || kit.name;
    await writeStore(userId, store);
  }
  return getBrand(userId);
}

/** Delete a brand kit. */
export async function deleteKit(userId: string, id: string): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  if (store.kits.length <= 1) throw new BrandError("Cannot delete the only Brand Kit.");
  store.kits = store.kits.filter((k) => k.id !== id);
  if (store.activeId === id) store.activeId = store.kits[0].id;
  await writeStore(userId, store);
  return getBrand(userId);
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

export async function addFont(userId: string, buf: Buffer, name: string): Promise<{ brand: ActiveBrandResult; font: BrandFont }> {
  if (buf.length > MAX_FONT_BYTES) throw new BrandError("That font file is too big (8 MB at most).");
  const format = fontFormat(buf);
  if (!format) throw new BrandError("That isn't a font file. Use TTF, OTF, WOFF or WOFF2.");
  const store = await getStore(userId);
  const i = activeOf(store);
  const curKit = store.kits[i];
  if (curKit.brand.fonts.length >= MAX_BRAND_FONTS) throw new BrandError(`The Brand Kit holds ${MAX_BRAND_FONTS} fonts. Remove one first.`);
  const id = createHash("sha1").update(buf).digest("hex").slice(0, 12);
  const font: BrandFont = { id, name: name.replace(/\.[^.]+$/, "").replace(/[^\w .\-()]/g, "").slice(0, 60) || "My font", format };
  await mkdir(fontDir(userId), { recursive: true });
  await writeFile(fontPath(userId, font), buf);
  const updatedBrand = brandSchema.parse({ ...curKit.brand, fonts: [...curKit.brand.fonts.filter((f) => f.id !== id), font] });
  store.kits[i] = { ...curKit, brand: updatedBrand };
  await writeStore(userId, store);
  return { brand: await getBrand(userId), font };
}

export async function removeFont(userId: string, id: string): Promise<ActiveBrandResult> {
  const store = await getStore(userId);
  const i = activeOf(store);
  const curKit = store.kits[i];
  const f = curKit.brand.fonts.find((x) => x.id === id);
  store.kits[i] = { ...curKit, brand: { ...curKit.brand, fonts: curKit.brand.fonts.filter((x) => x.id !== id) } };
  // (the file stays while another of your kits still has the font)
  if (f && !store.kits.some((k) => k.brand.fonts.some((x) => x.id === id))) await rm(fontPath(userId, f), { force: true });
  await writeStore(userId, store);
  return getBrand(userId);
}

/** One of your fonts, from any of your kits (a project can use a font of a kit that isn't the active one). */
export async function findFont(userId: string, id: string): Promise<BrandFont | null> {
  const store = await getStore(userId);
  for (const k of store.kits) {
    const f = k.brand.fonts.find((x) => x.id === id);
    if (f) return f;
  }
  return null;
}

export const fontPath = (userId: string, f: BrandFont) => storagePath("brand-fonts", userOk(userId), `${f.id}.${EXT[f.format]}`);

/** The uploads every person's Brand Kits use (kept by the 24-hour cleanup). */
export async function brandMediaIds(): Promise<string[]> {
  await migrateLegacy();
  const ids = new Set<string>();
  let files: string[] = [];
  try {
    files = (await readdir(storagePath("brand"))).filter((n) => n.endsWith(".json"));
  } catch {
    files = [];
  }
  for (const n of files) {
    const store = storeOf(await readJson<unknown>(storagePath("brand", n)));
    if (store) for (const id of storeMedia(store)) ids.add(id);
  }
  return [...ids];
}
