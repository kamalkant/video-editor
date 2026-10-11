"use client";

import type { ReactNode } from "react";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { CROP_PADDING, type OutputSettings as Output } from "@/lib/edit/spec";
import type { CropInfo } from "@/lib/editor/useCropBox";
import type { VideoInfo } from "@/lib/ffmpeg/probe";
import { formatFps } from "@/lib/format";
import { FPS_CHOICES, WIDTH_CHOICES, type Quality } from "@/lib/settings";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

/** The files in the see-through website pack (other formats are picked in the Export dialog's Format list). */
const FILES: { label: string; note: string; state: "always" | "master" }[] = [
  { label: "WebM (VP9 + alpha)", note: "Chrome, Edge, Firefox, Android", state: "always" },
  { label: "MOV (HEVC + alpha)", note: "Safari, iPhone, iPad", state: "always" },
  { label: "Also: MOV (ProRes 4444 + alpha)", note: "Large master for video editing", state: "master" },
];

/** Output Settings (right column / Export dialog). `info` null = no video yet (shown disabled). */
export function OutputSettings({ output: o, info, patch, crop, idPrefix = "out" }: { output: Output; info: VideoInfo | null; patch: (x: Partial<Output>) => void; crop: CropInfo; idPrefix?: string }) {
  const widths = info ? WIDTH_CHOICES.filter((w) => w < info.width) : [];
  const rates = info ? FPS_CHOICES.filter((f) => f < info.fps - 0.01) : [];
  return (
    <div inert={!info} className={`flex flex-col gap-3 ${info ? "" : "opacity-50"}`}>
      <Field label="Output resolution">
        <select aria-label="Size" className="field" value={String(o.resolution)} onChange={(e) => patch({ resolution: e.target.value === "original" ? "original" : Number(e.target.value) })}>
          <option value="original">{info ? `Original (${info.width} × ${info.height})` : "Original"}</option>
          {info &&
            widths.map((w) => (
              <option key={w} value={w}>
                {w} × {Math.round((info.height * w) / info.width / 2) * 2}
              </option>
            ))}
        </select>
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-muted">Files in the pack</legend>
        {FILES.map((f) => {
          const checked = f.state === "always" || (f.state === "master" && o.master);
          const disabled = f.state !== "master";
          return (
            <label key={f.label} className={`flex items-start gap-2 rounded-md px-1 py-1 text-sm ${disabled ? "" : "cursor-pointer hover:bg-raised"}`} title={f.state === "always" ? "Always made: the website needs both files" : undefined}>
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={checked} disabled={disabled} onChange={(e) => f.state === "master" && patch({ master: e.target.checked })} aria-describedby={`${idPrefix}-${f.state}-${f.label.length}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  {f.label}
                </span>
                <span id={`${idPrefix}-${f.state}-${f.label.length}`} className="block text-[0.6875rem] text-muted">
                  {f.state === "always" ? `Always · ${f.note}` : f.note}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Field label="Frame rate">
        <select aria-label="Frame rate" className="field" value={String(o.fps)} onChange={(e) => patch({ fps: e.target.value === "original" ? "original" : Number(e.target.value) })}>
          <option value="original">{info ? `Original (${formatFps(info.fps)} fps)` : "Original"}</option>
          {rates.map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </Field>
      <SegmentedControl<Quality>
        legend="Quality"
        name={`${idPrefix}-quality`}
        size="sm"
        variant="tabs"
        value={o.quality}
        onChange={(v) => patch({ quality: v })}
        options={[
          { value: "best", label: "High" },
          { value: "balanced", label: "Balanced" },
          { value: "small", label: "Small" },
        ]}
      />
      {(!info || info.hasAudio) && (
        <SegmentedControl<"keep" | "remove">
          legend="Audio"
          name={`${idPrefix}-audio`}
          size="sm"
          variant="tabs"
          value={o.audio}
          onChange={(v) => patch({ audio: v })}
          options={[
            { value: "remove", label: "Remove audio" },
            { value: "keep", label: "Keep audio" },
          ]}
        />
      )}
      {info?.soundDetected && <p className="-mt-2 text-[0.6875rem] text-muted">This video has sound. Browsers start it muted; visitors tap to hear it.</p>}
      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <Switch label="Crop empty area around the person" checked={o.crop.enabled} onCheckedChange={(v) => patch({ crop: { ...o.crop, enabled: v } })} describedBy={`${idPrefix}-crop-help`} />
        <p id={`${idPrefix}-crop-help`} className="text-[0.6875rem] text-muted">
          Cuts the empty transparent space. Smaller files; the box shows on the preview.
        </p>
        {o.crop.enabled && (
          <>
            <LabeledSlider
              label="Padding"
              value={o.crop.padding}
              {...CROP_PADDING}
              unit={{ short: "px", spoken: "pixels" }}
              valueText={(v) => `${v} pixels`}
              onChange={(v) => patch({ crop: { ...o.crop, padding: v } })}
            />
            <p className="text-xs" aria-live="polite" data-testid="crop-size">
              {crop.status === "finding" && <span className="text-muted">Finding the empty area…</span>}
              {crop.status === "failed" && <span className="text-danger">Couldn&apos;t find the empty area.</span>}
              {crop.status === "ready" && crop.box && crop.out && info && (
                <>
                  <strong>New size:</strong> {crop.out.w} × {crop.out.h} <span className="text-muted">(was {info.width} × {info.height})</span>
                </>
              )}
              {crop.status === "ready" && !crop.box && <span className="text-muted">No person found to crop around.</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
