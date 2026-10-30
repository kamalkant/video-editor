"use client";

import { useState } from "react";
import { GoogleAiModal } from "@/components/ui/GoogleAiModal";
import { Icon } from "@/components/ui/Icon";
import type { MainClip } from "@/lib/edit/doc";

/**
 * Remove object (Beta): adds a cover box that blends the pixels around it (lib/player/patches),
 * which you move over the object on the preview. Good for small, still logos; it is not AI inpainting.
 */
export function ObjectRemoverDialog(p: {
  open: boolean;
  onClose: () => void;
  clip: MainClip | null;
  onApplyErase: (objectDescription: string) => void;
}) {
  const [objectPrompt, setObjectPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const applyRemoval = () => {
    if (!objectPrompt.trim()) return;
    setBusy(true);
    setTimeout(() => {
      p.onApplyErase(objectPrompt);
      setBusy(false);
      p.onClose();
    }, 400);
  };

  return (
    <GoogleAiModal
      open={p.open}
      onClose={p.onClose}
      size="md"
      title="Cover an object (Beta)"
      subtitle="Adds a box that blends the pixels around it. Move and resize it over a logo or small object on the preview."
      badge={<span className="rounded bg-amber-500/95 px-1.5 py-px text-2xs font-semibold text-black">Beta · not AI inpainting</span>}
      busy={busy}
      busyLabel="Adding the cover box…"
      testId="object-remover-dialog"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="erase-object-input" className="text-xs font-semibold text-muted">
            Describe the object or element to erase
          </label>
          <input
            id="erase-object-input"
            className="rounded-xl border border-line bg-canvas/80 px-3.5 py-2.5 text-xs text-ink placeholder:text-muted outline-none focus:border-primary"
            value={objectPrompt}
            onChange={(e) => setObjectPrompt(e.target.value)}
            placeholder="e.g. Bystander in background, trash can on street, microphone boom, logo watermark..."
          />
        </div>

        {/* Quick Presets */}
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs text-muted font-medium">Common items to erase:</span>
          <div className="flex flex-wrap gap-1.5">
            {["Bystander in background", "Logo / Watermark", "Power lines in sky", "Microphone boom", "Glares & reflections"].map(
              (item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setObjectPrompt(item)}
                  className="rounded-full border border-line bg-raised px-2.5 py-1 text-xs text-muted hover:border-primary hover:text-ink transition-all"
                >
                  + {item}
                </button>
              ),
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={busy || !objectPrompt.trim()}
          onClick={applyRemoval}
          className="rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          <Icon name="eraser" className="size-3.5" />
          Erase Object & Fill Background
        </button>
      </div>
    </GoogleAiModal>
  );
}
