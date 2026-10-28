"use client";

import type { TimelineDoc } from "@/lib/edit/doc";
import { downloadNameOf } from "@/lib/export/fileName";
import { toSrt, toVtt } from "@/lib/subtitles/srt";
import { subtitleTracks } from "@/lib/subtitles/sources";

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The timeline's subtitles as files (.srt / .vtt, for YouTube and players), next to the export's downloads. */
export function CaptionDownloads({ doc, projectName }: { doc: TimelineDoc | null | undefined; projectName?: string | null }) {
  const tracks = doc ? subtitleTracks(doc).filter((t) => t.captions.length > 0) : [];
  if (!tracks.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted" data-testid="caption-downloads">
      <span>Captions file:</span>
      {tracks.map((t) =>
        (["srt", "vtt"] as const).map((ext) => (
          <button
            key={`${t.id}-${ext}`}
            type="button"
            className="btn btn-secondary min-h-0 px-2 py-1 text-xs"
            aria-label={`Download ${t.name} as .${ext}`}
            onClick={() =>
              save(downloadNameOf(projectName, `${t.name}.${ext}`), ext === "srt" ? toSrt(t.captions) : toVtt(t.captions), ext === "srt" ? "application/x-subrip" : "text/vtt")
            }
          >
            {tracks.length > 1 ? `${t.name} ` : ""}.{ext}
          </button>
        )),
      )}
    </div>
  );
}
