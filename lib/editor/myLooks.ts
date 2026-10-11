import { colorSchema, type ColorAdjust } from "../edit/doc";
import { readLocal, writeLocal } from "./localStore";

/** A colour grade the user saved to reuse ("My looks"): kept in this browser. */
export type MyLook = { id: string; name: string; color: ColorAdjust };

export const MY_LOOKS_KEY = "VDO:v1:my-looks";
export const MY_LOOKS_MAX = 12;

/** The saved looks (broken or old entries are skipped). */
export function readMyLooks(): MyLook[] {
  const raw = readLocal<unknown>(MY_LOOKS_KEY);
  if (!Array.isArray(raw)) return [];
  const out: MyLook[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const color = colorSchema.safeParse(o.color);
    if (typeof o.id === "string" && typeof o.name === "string" && color.success) out.push({ id: o.id, name: o.name.slice(0, 40), color: color.data });
  }
  return out.slice(0, MY_LOOKS_MAX);
}

/** Save a look under a name (newest first; the same name is replaced; at most 12 are kept). */
export function saveMyLook(name: string, color: ColorAdjust): MyLook[] {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40) || "My look";
  const look: MyLook = { id: `ml${Date.now().toString(36)}`, name: clean, color };
  const list = [look, ...readMyLooks().filter((l) => l.name.toLowerCase() !== clean.toLowerCase())].slice(0, MY_LOOKS_MAX);
  writeLocal(MY_LOOKS_KEY, list);
  return list;
}

export function deleteMyLook(id: string): MyLook[] {
  const list = readMyLooks().filter((l) => l.id !== id);
  writeLocal(MY_LOOKS_KEY, list);
  return list;
}
