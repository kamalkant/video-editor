import { getCapabilities } from "@/lib/ffmpeg/capabilities";

/** Blocking notice when FFmpeg is missing something the editor needs (e.g. HEVC alpha). */
export async function CapabilityBanner() {
  const caps = await getCapabilities();
  if (caps.ok) return null;
  return (
    <div role="alert" className="bg-danger-soft border-b-2 border-danger">
      <div className="mx-auto max-w-7xl px-4 py-3 text-ink">
        <p className="font-semibold">ViPlay Studio can&apos;t work with videos on this server yet.</p>
        <p className="text-sm">{caps.message}</p>
      </div>
    </div>
  );
}
