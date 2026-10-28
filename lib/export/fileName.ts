/** The main file of an export (named after the project alone); the others add what they are ("poster"). */
const MAIN = new Set(["video", "frame", "audio", "sound", "animation"]);

/** A project name as part of a file name: no characters a file name can't hold, at most 80 long. */
function safeBase(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 80)
    .trim();
}

/** The name a downloaded export file gets: "Goa trip.mp4", "Goa trip - poster.png" (the file's own name without a project name). */
export function downloadNameOf(projectName: string | null | undefined, fileName: string): string {
  const base = safeBase(projectName);
  if (!base) return fileName;
  const dot = fileName.lastIndexOf(".");
  // ("video-hevc" → "hevc": the kind of video is what's worth keeping)
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/^video-(?=.)/, "");
  const ext = dot > 0 ? fileName.slice(dot) : "";
  return MAIN.has(stem) ? `${base}${ext}` : `${base} - ${stem}${ext}`;
}
