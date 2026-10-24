"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Brand, BrandFont, ActiveBrandResult } from "../brand";
import { brandFamily, ensureBrandFont } from "../text/fonts";

export { brandFamily };

/** The Brand Kit for the cards (brand color swatches, your fonts in the font list). */
export const BrandContext = createContext<ActiveBrandResult | null>(null);
export const useBrandKit = () => useContext(BrandContext);

/** Load Brand Kit fonts into the page (so the preview and the exported text use them; lib/text/fonts). */
export async function loadBrandFonts(fonts: BrandFont[]) {
  await Promise.all(fonts.map((f) => ensureBrandFont(f.id)));
}

/** The Brand Kit (logo, colors, fonts, intro / outro), shared by all projects. */
export function useBrand() {
  const [brand, setBrand] = useState<ActiveBrandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/brand", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Couldn't load the Brand Kit.");
      setBrand(j as ActiveBrandResult);
      void loadBrandFonts((j as ActiveBrandResult).fonts);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  const save = async (patch: Partial<Omit<Brand, "fonts">>) => {
    setError(null);
    const r = await fetch("/api/brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json();
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't save.");
    setBrand(j as ActiveBrandResult);
  };
  const createKit = async (name: string) => {
    setError(null);
    const r = await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name }) });
    const j = await r.json();
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't create brand kit.");
    setBrand(j as ActiveBrandResult);
    void loadBrandFonts((j as ActiveBrandResult).fonts);
  };
  const switchKit = async (id: string) => {
    setError(null);
    const r = await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "switch", id }) });
    const j = await r.json();
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't switch brand kit.");
    setBrand(j as ActiveBrandResult);
    void loadBrandFonts((j as ActiveBrandResult).fonts);
  };
  const renameKit = async (id: string, name: string) => {
    setError(null);
    const r = await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", id, name }) });
    const j = await r.json();
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't rename brand kit.");
    setBrand(j as ActiveBrandResult);
  };
  const deleteKit = async (id: string) => {
    setError(null);
    const r = await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    const j = await r.json();
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't delete brand kit.");
    setBrand(j as ActiveBrandResult);
    void loadBrandFonts((j as ActiveBrandResult).fonts);
  };
  const addFont = async (f: File) => {
    setError(null);
    const r = await fetch("/api/brand/fonts", { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) }, body: f });
    const j = await r.json();
    if (!r.ok) return setError(j?.error?.message ?? "Couldn't add the font.");
    setBrand(j.brand as ActiveBrandResult);
    await loadBrandFonts((j.brand as ActiveBrandResult).fonts);
  };
  const removeFont = async (id: string) => {
    const r = await fetch(`/api/brand/fonts/${id}`, { method: "DELETE" });
    if (r.ok) setBrand((await r.json()) as ActiveBrandResult);
  };
  const addVideo = async (v: { id: string; name: string; duration: number; width?: number; height?: number }) => {
    const cur = brand?.videos ?? [];
    if (cur.some((x) => x.id === v.id)) return;
    const next = [...cur, v];
    await save({ videos: next });
  };
  const removeVideo = async (id: string) => {
    const next = (brand?.videos ?? []).filter((x) => x.id !== id);
    await save({ videos: next });
  };
  return { brand, error, save, createKit, switchKit, renameKit, deleteKit, addFont, removeFont, addVideo, removeVideo, refresh };
}
