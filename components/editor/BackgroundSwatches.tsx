"use client";

import { useId, useRef } from "react";
import { Icon } from "@/components/ui/Icon";

export type Bg = "checker" | "white" | "black" | "custom" | "image" | "video";

/** A picture or video chosen for the preview background. Stays in the browser (object URL); never uploaded or exported. */
export type BgMedia = { kind: "image" | "video"; url: string; name: string };

export const TILES: { value: Bg; label: string; tile: string }[] = [
  { value: "checker", label: "Checkerboard", tile: "bg-checker" },
  { value: "white", label: "White", tile: "bg-white" },
  { value: "black", label: "Black", tile: "bg-black" },
  { value: "custom", label: "Custom", tile: "" },
  { value: "image", label: "Image", tile: "bg-raised" },
  { value: "video", label: "Video", tile: "bg-raised" },
];

/** Picture tiles for the preview background (as in plan.png). */
export function BackgroundSwatches({
  inline,
  value,
  onChange,
  custom,
  onCustomChange,
  media,
  onMedia,
}: {
  value: Bg;
  onChange: (v: Bg) => void;
  custom: string;
  onCustomChange: (c: string) => void;
  media: Partial<Record<"image" | "video", BgMedia>>;
  onMedia: (file: File, kind: "image" | "video") => void;
  /** One row with the legend on the left (under the preview, like the mockup). */
  inline?: boolean;
}) {
  // unique per instance: the tiles appear under the canvas (desktop) and in the inspector (phone)
  const name = `preview-bg-${useId()}`;
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const choose = (kind: "image" | "video") => (kind === "image" ? imageInput : videoInput).current?.click();
  const onFile = (kind: "image" | "video") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onMedia(f, kind);
  };
  return (
    <fieldset className="min-w-0">
      <legend className={inline ? "sr-only" : "mb-1 text-sm font-medium"}>Preview background</legend>
      <div className={`flex flex-wrap gap-1.5 ${inline ? "items-center" : ""}`}>
        {inline && (
          <span aria-hidden="true" className="mr-1 text-xs text-muted">
            Preview background:
          </span>
        )}
        {TILES.map((t) => {
          const selected = t.value === value;
          const m = t.value === "image" || t.value === "video" ? media[t.value] : undefined;
          const needsFile = (t.value === "image" || t.value === "video") && !m;
          return (
            <label
              key={t.value}
              className={`relative flex cursor-pointer flex-col items-center gap-0.5 rounded-[var(--radius-control)] border bg-raised p-1 text-2xs w-[4.75rem] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-link ${
                selected ? "border-primary font-semibold ring-1 ring-primary" : "border-line hover:border-control"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={t.value}
                checked={selected}
                onChange={() => (needsFile ? choose(t.value as "image" | "video") : onChange(t.value))}
                onClick={() => needsFile && choose(t.value as "image" | "video")}
              />
              <span
                aria-hidden="true"
                className={`relative flex w-full items-center justify-center overflow-hidden rounded border border-line text-muted ${inline ? "h-5" : "h-7"} ${t.tile}`}
                style={
                  t.value === "custom"
                    ? { background: value === "custom" ? custom : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }
                    : m?.kind === "image"
                      ? { backgroundImage: `url(${m.url})`, backgroundSize: "cover", backgroundPosition: "center" }
                      : undefined
                }
              >
                {t.value === "image" && !m && <Icon name="image" className="size-4" />}
                {t.value === "video" && <Icon name={m ? "film" : "video"} className="size-4" />}
                {selected && (
                  <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-white">
                    <Icon name="check" className="size-2.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              {t.label}
            </label>
          );
        })}
      </div>
      <input ref={imageInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="bg-image-input" onChange={onFile("image")} />
      <input ref={videoInput} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="bg-video-input" onChange={onFile("video")} />
      {value === "custom" && (
        <label className="flex items-center gap-2 text-xs">
          Custom color
          <input type="color" value={custom} onChange={(e) => onCustomChange(e.target.value)} className="swatch" />
        </label>
      )}
      {(value === "image" || value === "video") && media[value] && (
        <p className="text-xs text-muted">
          <span className="break-all">{media[value]!.name}</span> · preview only, not exported{" "}
          <button type="button" className="text-link underline" onClick={() => choose(value)}>
            Change
          </button>
        </p>
      )}
    </fieldset>
  );
}
