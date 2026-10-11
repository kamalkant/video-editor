import type { VideoInfo } from "@/lib/ffmpeg/probe";
import { formatFps, formatTime } from "@/lib/format";

export type InfoWarning = { field: "duration" | "fps" | "resolution" | "audio" | "key"; text: string };

export function getInfoWarnings(info: VideoInfo, suggestedKey: string | null): InfoWarning[] {
  const w: InfoWarning[] = [];
  if (!suggestedKey) w.push({ field: "key", text: "We couldn't find a solid green or blue background. You can still pick the color yourself." });
  if (info.duration > 15) w.push({ field: "duration", text: "Long clips make bigger files. Most avatar overlays are 4–10 seconds." });
  if (info.fps > 30) w.push({ field: "fps", text: "High frame rate: files will be bigger. You can lower it in Advanced settings." });
  if (info.width > 1920 || info.height > 1920) w.push({ field: "resolution", text: "Very large video: preview and export take longer. You can make it smaller in Advanced settings." });
  if (info.hasAudio && !info.soundDetected) w.push({ field: "audio", text: "The audio track is silent. It will be removed to keep files small." });
  return w;
}

export function VideoInfoCard({ info, fileName, suggestedKey, headingId }: { info: VideoInfo; fileName: string; suggestedKey: string | null; headingId?: string }) {
  const warnings = getInfoWarnings(info, suggestedKey);
  const warn = (f: InfoWarning["field"]) => warnings.find((w) => w.field === f);
  const rows: { label: string; value: string; field?: InfoWarning["field"] }[] = [
    { label: "File", value: fileName },
    { label: "Format", value: `${info.container.toUpperCase()} (${info.videoCodec.toUpperCase()})` },
    { label: "Resolution", value: `${info.width} × ${info.height}`, field: "resolution" },
    { label: "Frame rate", value: `${formatFps(info.fps)} fps`, field: "fps" },
    { label: "Duration", value: formatTime(info.duration), field: "duration" },
    { label: "Audio", value: !info.hasAudio ? "No" : info.soundDetected ? "Yes (sound detected)" : "Yes (silent)", field: "audio" },
    { label: "Background", value: suggestedKey ? `Detected ${suggestedKey}` : "Not found", field: "key" },
  ];
  return (
    <section className="card" aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold mb-3">
        Video info
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {rows.map((r) => {
          const w = r.field ? warn(r.field) : undefined;
          return (
            <div key={r.label} className={`col-span-2 grid grid-cols-subgrid rounded px-2 py-1 ${w ? "bg-warn-soft border-l-4 border-warn-line" : ""}`}>
              <dt className="text-muted">{r.label}</dt>
              <dd className="break-all">
                {r.label === "Background" && suggestedKey && (
                  <span aria-hidden="true" className="mr-2 inline-block size-4 align-middle rounded border border-control" style={{ background: suggestedKey }} />
                )}
                {r.value}
                {w && <span className="block text-sm text-warn-ink">⚠️ {w.text}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
