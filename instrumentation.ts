// Runs once when the server starts (Next.js instrumentation).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  // Linux hosts without FFmpeg: scripts/fetch-ffmpeg.mjs runs at install, but some hosts install in one place and
  // run the site from another; then fetch it here, before the first upload or export (a no-op when it's there)
  if (process.platform === "linux") {
    const { ensureFfmpeg } = await import("./lib/ffmpeg/ensure");
    ensureFfmpeg();
  }
}
