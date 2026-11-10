import { capabilityWarning, peekCapabilities } from "@/lib/ffmpeg/capabilities";

/**
 * Blocking notice when FFmpeg is missing something the editor needs (e.g. HEVC alpha). It never waits for the
 * check (which can take seconds on a busy host): until one has finished, and while the host is only busy for a
 * moment, nothing is shown.
 */
export function CapabilityBanner() {
  const warning = capabilityWarning(peekCapabilities());
  if (!warning) return null;
  return (
    <div role="alert" className="bg-danger-soft border-b-2 border-danger">
      <div className="mx-auto max-w-7xl px-4 py-3 text-ink">
        <p className="font-semibold">ViPlay Studio can&apos;t work with videos on this server yet.</p>
        <p className="text-sm">{warning}</p>
      </div>
    </div>
  );
}
