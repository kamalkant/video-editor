"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { Icon } from "@/components/ui/Icon";
import type { BrandFont } from "@/lib/brand";
import { BUILTIN_FONTS, brandFamily, ensureFont, fontCatalog, fontLabel, FONTS, fontStack, googleFontId, previewFamily, recentFonts, rememberFont, type CatalogFont, type FontCategory } from "@/lib/text/fonts";

/**
 * Pick a font: the five built-in looks, your Brand Kit fonts, and the whole Google Fonts library (about 1,900
 * families, Hindi ones among them), searchable by name and kind. Each name shows in its own font (a tiny
 * copy with only the letters of the name, loaded only for the rows on screen).
 */

type Tab = "all" | "hindi" | FontCategory;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hindi", label: "हिंदी" },
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Handwriting" },
  { id: "mono", label: "Mono" },
];
const ROW = 32;
const VIEW = 288;

type Row = { kind: "head"; label: string } | { kind: "font"; id: string; label: string; family?: string; brand?: string };

/** A font's name in its own look (Google fonts: a tiny copy with just these letters). */
function FontName({ row }: { row: Extract<Row, { kind: "font" }> }) {
  const [fam, setFam] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (row.family) void previewFamily(row.family).then((f) => alive && setFam(f));
    return () => {
      alive = false;
    };
  }, [row.family]);
  const style = row.brand ? { fontFamily: `"${brandFamily(row.brand)}", sans-serif` } : row.family ? (fam ? { fontFamily: `"${fam}", sans-serif` } : undefined) : { fontFamily: fontStack(row.id) };
  return (
    <span className="min-w-0 truncate text-[0.9375rem]" style={style}>
      {row.label}
    </span>
  );
}

export function FontPicker({
  value,
  onChange,
  brandFonts = [],
  label = "Font",
  className = "",
  size = "md",
}: {
  value: string;
  onChange: (font: string) => void;
  brandFonts?: BrandFont[];
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [catalog, setCatalog] = useState<CatalogFont[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [scroll, setScroll] = useState(0);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const brandName = (id: string) => brandFonts.find((f) => f.id === id)?.name;

  useEffect(() => {
    if (!open || catalog) return;
    let alive = true;
    void fontCatalog().then((c) => {
      if (!alive) return;
      setCatalog(c);
      setFailed(!c.length);
    });
    return () => {
      alive = false;
    };
  }, [open, catalog]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (name: string) => !needle || name.toLowerCase().includes(needle);
    const g = (catalog ?? []).filter((f) => match(f.family) && (tab === "all" || (tab === "hindi" ? f.subsets.includes("devanagari") : f.category === tab)));
    const out: Row[] = [];
    if (!needle && tab === "all") {
      const recent = recentFonts().filter((id) => id !== value || true);
      if (recent.length) {
        out.push({ kind: "head", label: "Recently used" });
        for (const id of recent) out.push({ kind: "font", id, label: fontLabel(id, brandName), ...(id.startsWith("gf:") ? { family: id.slice(3) } : id.startsWith("brand:") ? { brand: id.slice(6) } : {}) });
      }
    }
    const brands = brandFonts.filter((f) => match(f.name));
    if (brands.length && (tab === "all" || tab === "hindi")) {
      out.push({ kind: "head", label: "Brand Kit (your fonts)" });
      for (const f of brands) out.push({ kind: "font", id: `brand:${f.id}`, label: f.name, brand: f.id });
    }
    const builtins = BUILTIN_FONTS.filter((k) => match(FONTS[k].label) && (tab === "all" || (tab === "sans" && (k === "sans" || k === "rounded" || k === "condensed")) || (tab === "serif" && k === "serif") || (tab === "mono" && k === "mono")));
    if (builtins.length) {
      out.push({ kind: "head", label: "Built in" });
      for (const k of builtins) out.push({ kind: "font", id: k, label: FONTS[k].label });
    }
    if (g.length) {
      out.push({ kind: "head", label: tab === "hindi" ? "Google Fonts with Hindi (देवनागरी)" : `Google Fonts (${g.length})` });
      for (const f of g) out.push({ kind: "font", id: googleFontId(f.family), label: f.family, family: f.family });
    }
    return out;
    // (brandName reads brandFonts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, q, tab, brandFonts, value, open]);
  const fonts = rows.map((r, i) => (r.kind === "font" ? i : -1)).filter((i) => i >= 0);


  const pick = (id: string) => {
    rememberFont(id);
    void ensureFont(id);
    onChange(id);
    setOpen(false);
  };
  const first = Math.max(0, Math.floor(scroll / ROW) - 4);
  const last = Math.min(rows.length, Math.ceil((scroll + VIEW) / ROW) + 4);
  const keepVisible = (i: number) => {
    const el = listRef.current;
    if (!el) return;
    if (i * ROW < el.scrollTop) el.scrollTop = i * ROW;
    else if ((i + 1) * ROW > el.scrollTop + VIEW) el.scrollTop = (i + 1) * ROW - VIEW;
  };
  const move = (d: number) => {
    if (!fonts.length) return;
    const at = Math.max(0, fonts.indexOf(fonts.find((i) => i >= active) ?? fonts[0]));
    const next = fonts[Math.min(fonts.length - 1, Math.max(0, at + d))];
    setActive(next);
    keepVisible(next);
  };

  const current = fontLabel(value, brandName);
  return (
    <Popover
      label={label}
      open={open}
      onOpenChange={setOpen}
      size={size}
      className={className}
      buttonLabel={`${label}: ${current}`}
      buttonClassName={`field flex w-full min-w-0 items-center justify-between gap-1 text-left ${size === "sm" ? "h-7 min-h-7 px-2 text-xs" : ""}`}
      panelClassName="w-[19rem] p-2"
      button={
        <>
          <span className="min-w-0 truncate" style={value.startsWith("gf:") || value.startsWith("brand:") ? { fontFamily: fontStack(value) } : undefined}>
            {current}
          </span>
          <Icon name="chevronDown" className="size-3.5 shrink-0 text-muted" />
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <input
          ref={searchRef}
          type="search"
          className="field"
          placeholder="Search fonts (e.g. Poppins, Mukta)"
          aria-label="Search fonts"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            // (a new search starts at the top)
            setActive(0);
            setScroll(0);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const r = rows[active];
              if (r?.kind === "font") pick(r.id);
              else if (fonts.length) pick((rows[fonts[0]] as Extract<Row, { kind: "font" }>).id);
            }
          }}
        />
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Kind of font">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setActive(0);
                setScroll(0);
                if (listRef.current) listRef.current.scrollTop = 0;
              }} className={`rounded-full border px-2 py-0.5 text-2xs ${tab === t.id ? "border-primary bg-primary-soft text-ink" : "border-line text-muted hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div ref={listRef} role="listbox" aria-label={label} className="relative overflow-y-auto rounded-md border border-line" style={{ height: VIEW }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
          <div style={{ height: rows.length * ROW, position: "relative" }}>
            {rows.slice(first, last).map((r, k) => {
              const i = first + k;
              const top = i * ROW;
              if (r.kind === "head")
                return (
                  <div key={`h${i}`} className="absolute inset-x-0 flex items-end px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted" style={{ top, height: ROW }}>
                    {r.label}
                  </div>
                );
              const selected = r.id === value;
              return (
                <button
                  key={`${r.id}:${i}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r.id)}
                  className={`absolute inset-x-0 flex items-center justify-between gap-2 px-2 text-left ${i === active ? "bg-primary-soft" : ""} ${selected ? "text-primary" : ""}`}
                  style={{ top, height: ROW }}
                >
                  <FontName row={r} />
                  {selected && <Icon name="check" className="size-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
          {!catalog && <p className="absolute inset-x-0 bottom-2 text-center text-xs text-muted">Loading the font library…</p>}
        </div>
        {failed && <p className="text-xs text-muted">The Google Fonts list couldn&apos;t load (no internet?). Built-in and Brand Kit fonts still work.</p>}
        <p className="text-2xs text-muted">Google Fonts load when you use them; your own fonts: Brand Kit.</p>
      </div>
    </Popover>
  );
}
