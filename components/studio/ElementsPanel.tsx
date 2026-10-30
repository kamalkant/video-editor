"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ElementLook } from "@/lib/edit/doc";
import { matchScore } from "@/lib/editor/commands";
import { createDragChip, ELEMENT_DRAG, setElementDrag } from "@/lib/editor/mediaDrag";
import { ELEMENT_GROUPS, searchElements, type ElementGroup, type ElementPreset } from "@/lib/elements/catalog";
import { drawElement } from "@/lib/elements/draw";
import { EMOJI_GROUPS, firstEmoji } from "@/lib/elements/emoji";

/** How a tile shows an element: a long line or bar is shown shorter, so it fits. */
function thumbLook(el: ElementLook): ElementLook {
  if (el.kind === "progress") return { ...el, aspect: 7 };
  if (el.kind === "ticker") return { ...el, aspect: 3.4, text: "Top story · More news" };
  if (el.kind === "line") return { ...el, aspect: Math.min(el.aspect, 12) };
  if (el.kind === "lowerThird") return { ...el, aspect: 3.2 };
  if (el.kind === "locationBug") return { ...el, aspect: 2.8 };
  if (el.kind === "viewfinder") return { ...el, aspect: 16 / 9 };
  if (el.kind === "battery") return { ...el, aspect: 2.2 };
  return el;
}

/** A small picture of a ready-made element, drawn by the same code as the preview and the export. */
function ElementThumb({ el }: { el: ElementLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      const look = thumbLook(el);
      // as big as fits, with room round it
      const pad = cv.width * 0.12;
      const w = Math.min(cv.width - pad * 2, (cv.height - pad * 2) * look.aspect);
      const h = w / look.aspect;
      ctx.save();
      ctx.translate((cv.width - w) / 2, (cv.height - h) / 2);
      drawElement(ctx, look, w, h, { into: 0.6, len: 1 });
      ctx.restore();
    };
    draw();
    // (Brand Kit fonts may still be loading)
    void document.fonts?.ready.then(draw);
  }, [el]);
  return <canvas ref={ref} width={144} height={108} aria-hidden="true" className="block aspect-[4/3] w-full rounded-md bg-[linear-gradient(135deg,#1e293b,#334155)]" />;
}

const TILE = "group flex w-full flex-col gap-1 rounded-lg border border-line bg-raised/40 p-1 text-left hover:border-primary hover:bg-primary-soft focus-visible:border-primary";
const GRID = "grid grid-cols-3 gap-1.5 @sm:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6";
const LOGO_WORDS = { label: "Logo in the corner", keywords: ["brand", "watermark", "bug", "corner", "news"] };

/** Your Brand Kit logo: not set yet, set but not on this video, or on it. */
export type LogoState = "none" | "off" | "on";

/**
 * The Elements panel: shapes, lines and arrows, stickers drawn by the app,
 * emoji and news graphics. A click adds one at the playhead (it stays
 * editable in the inspector).
 */
export function ElementsPanel(p: {
  onAdd: (presetId: string) => void;
  onEmoji: (emoji: string) => void;
  /** The Brand Kit logo tile. */
  logo: LogoState;
  onLogo: () => void;
  /** The search box (Search tools → "Add emoji…" focuses it). */
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const [any, setAny] = useState("");
  const found = useMemo(() => searchElements(q), [q]);
  const anyEmoji = firstEmoji(any);
  const logoShown = !q.trim() || matchScore(LOGO_WORDS, q) > 0;
  const tiles = (group: ElementGroup) => found.presets.filter((x) => x.group === group);
  const nothing = !found.presets.length && !found.emoji.length && !logoShown;

  const section = (id: ElementGroup | "emoji", label: string, body: React.ReactNode) => (
    <section key={id} aria-labelledby={`elements-${id}`} className="flex flex-col gap-1.5">
      <h3 id={`elements-${id}`} className="text-xs font-semibold text-muted">
        {label}
      </h3>
      {body}
    </section>
  );
  const presetTiles = (list: ElementPreset[], extra?: React.ReactNode) => (
    <ul className={GRID}>
      {list.map((x) => (
        <li key={x.id}>
          <button
            type="button"
            className={`${TILE} cursor-grab active:cursor-grabbing`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ELEMENT_DRAG, JSON.stringify({ presetId: x.id }));
              e.dataTransfer.setData("text/plain", x.label);
              e.dataTransfer.effectAllowed = "copy";
              setElementDrag({ presetId: x.id, label: x.label, aspect: x.el.aspect });
              const chip = createDragChip(x.label, "Element");
              if (chip) e.dataTransfer.setDragImage(chip, 45, 18);
            }}
            onDragEnd={() => setElementDrag(null)}
            onClick={() => p.onAdd(x.id)}
            aria-label={`Add ${x.label}`}
            title={`${x.label} · Click or drag onto preview`}
          >
            <ElementThumb el={x.el} />
            <span className="truncate px-0.5 text-2xs font-medium">{x.label}</span>
          </button>
        </li>
      ))}
      {extra}
    </ul>
  );

  return (
    <div className="@container flex flex-col gap-4" data-testid="elements-panel">
      <label className="relative block">
        <span className="sr-only">Search elements</span>
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input ref={p.searchRef} type="search" className="field w-full pl-8" placeholder="Search shapes, stickers, emoji…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!q.trim() && <p className="-mt-2 text-xs text-muted">Click or drag shapes, stickers and emoji directly onto the preview stage.</p>}
      {/* news graphics first, then stickers, shapes, lines and arrows, emoji */}
      {(tiles("news").length > 0 || logoShown) &&
        section(
          "news",
          "News graphics",
          presetTiles(
            tiles("news"),
            logoShown && (
              <li>
                <button
                  type="button"
                  className={TILE}
                  onClick={p.onLogo}
                  aria-label={p.logo === "none" ? "Logo in the corner: add your logo in the Brand Kit first" : p.logo === "on" ? "Logo in the corner: it's on; select it" : "Add Logo in the corner"}
                  title={p.logo === "none" ? "Add your logo in the Brand Kit first" : "Your Brand Kit logo, on the whole video"}
                >
                  <span aria-hidden="true" className="relative block aspect-[4/3] w-full rounded-md bg-[linear-gradient(135deg,#1e293b,#334155)]">
                    <span className="absolute right-[12%] top-[14%] flex size-[28%] items-center justify-center rounded-md bg-white/90 text-slate-800">
                      <Icon name="brand" className="size-[60%]" />
                    </span>
                    {p.logo !== "off" && <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/65 px-1 text-2xs leading-4 text-white">{p.logo === "on" ? "On" : "Brand Kit"}</span>}
                  </span>
                  <span className="truncate px-0.5 text-2xs font-medium">Logo</span>
                </button>
              </li>
            ),
          ),
        )}
      {(["camera", "stickers", "shapes", "lines"] as const).map((g) => {
        const list = tiles(g);
        return list.length ? section(g, ELEMENT_GROUPS.find((x) => x.id === g)!.label, presetTiles(list)) : null;
      })}
      {(found.emoji.length > 0 || !q.trim()) &&
        section(
          "emoji",
          "Emoji",
          <>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!anyEmoji) return;
                p.onEmoji(anyEmoji);
                setAny("");
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Any emoji</span>
                <input className="field w-full" placeholder="Any emoji: type or paste one" value={any} onChange={(e) => setAny(e.target.value)} aria-describedby="any-emoji-hint" />
              </label>
              <button type="submit" className="btn btn-secondary min-h-hit px-3" disabled={!anyEmoji} aria-label={anyEmoji ? `Add emoji ${anyEmoji}` : "Add this emoji"}>
                Add
              </button>
            </form>
            <p id="any-emoji-hint" className="text-2xs text-muted">
              Ctrl ⌘ Space: every emoji. They look like your Mac&apos;s emoji; for paid ads, the app&apos;s own stickers are safer.
            </p>
            {EMOJI_GROUPS.map((g) => {
              const list = found.emoji.filter((x) => x.group === g);
              if (!list.length) return null;
              return (
                <div key={g} role="group" aria-label={g} className="flex flex-col gap-1">
                  {!q.trim() && <span className="text-2xs text-muted">{g}</span>}
                  <ul className="grid grid-cols-7 gap-0.5 @sm:grid-cols-9 @md:grid-cols-11 @lg:grid-cols-12">
                    {list.map((x) => (
                      <li key={x.e}>
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(ELEMENT_DRAG, JSON.stringify({ emoji: x.e }));
                            e.dataTransfer.setData("text/plain", x.e);
                            e.dataTransfer.effectAllowed = "copy";
                            setElementDrag({ emoji: x.e, label: x.name, aspect: 1 });
                            const chip = createDragChip(x.e, x.name);
                            if (chip) e.dataTransfer.setDragImage(chip, 45, 18);
                          }}
                          onDragEnd={() => setElementDrag(null)}
                          onClick={() => p.onEmoji(x.e)}
                          aria-label={`Add emoji: ${x.name}`}
                          title={`${x.name} · Click or drag onto preview`}
                          className="flex aspect-square w-full cursor-grab active:cursor-grabbing items-center justify-center rounded-md text-2xl leading-none hover:bg-primary-soft focus-visible:bg-primary-soft"
                        >
                          {x.e}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>,
        )}
      {nothing && <p className="text-sm text-muted">Nothing matches “{q.trim()}”. Try “arrow”, “heart” or “live”.</p>}
    </div>
  );
}
