"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { buildEmbedSnippet } from "@/lib/embed/snippet";

export function EmbedCodeBox({ bare, ...p }: { webmName: string; movName: string; posterName?: string; width: number; height: number; withSound: boolean; bare?: boolean }) {
  const [folder, setFolder] = useState("/videos/");
  const [pauseButton, setPauseButton] = useState(true);
  const [respectReducedMotion, setRespectReducedMotion] = useState(true);
  const id = useId();
  const code = buildEmbedSnippet({ ...p, folder, pauseButton, respectReducedMotion });
  return (
    <section aria-labelledby={bare ? undefined : `${id}-h`} aria-label={bare ? "Embed code" : undefined} className={bare ? "flex flex-col gap-3" : "card flex flex-col gap-3"}>
      {!bare && (
        <h2 id={`${id}-h`} className="text-lg font-semibold">
          Put it on your website
        </h2>
      )}
      <label className="flex flex-col gap-1 max-w-sm">
        <span className="font-medium">Folder on your website where you upload the files</span>
        <input className="field font-mono" value={folder} onChange={(e) => setFolder(e.target.value)} />
      </label>
      <label className="flex min-h-hit items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-5" checked={pauseButton} onChange={(e) => setPauseButton(e.target.checked)} />
        <span>
          Pause button
          <span className="block text-muted">Lets visitors stop the looping video (recommended for accessibility).</span>
        </span>
      </label>
      <label className="flex min-h-hit items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-5" checked={respectReducedMotion} onChange={(e) => setRespectReducedMotion(e.target.checked)} />
        <span>
          Don&apos;t autoplay for visitors who prefer reduced motion
          <span className="block text-muted">They see the poster and can press Play.</span>
        </span>
      </label>
      <pre id={`${id}-code`} tabIndex={0} aria-label="Embed code text" className="max-h-80 overflow-auto rounded-lg bg-[#0F172A] p-3 text-xs text-[#E2E8F0]">
        <code>{code}</code>
      </pre>
      <div>
        <CopyButton text={code} label="Copy embed code" targetId={`${id}-code`} />
      </div>
    </section>
  );
}
