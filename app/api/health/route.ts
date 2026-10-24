import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCapabilities } from "@/lib/ffmpeg/capabilities";
import { fetchStatus } from "@/lib/ffmpeg/ensure";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";

export const runtime = "nodejs";

/** Which build is live (Next's build id), to tell a finished deploy apart. */
const BUILD = (() => {
  try {
    return readFileSync(join(/*turbopackIgnore: true*/ process.cwd(), process.env.NEXT_DIST_DIR || ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
})();

export async function GET(request: Request) {
  // (probing FFmpeg again runs it several times: staff only, not for anyone who asks)
  const wantsRefresh = new URL(request.url).searchParams.has("refresh");
  const refresh = wantsRefresh && isAdmin(await getCurrentUser());
  const caps = await getCapabilities(refresh);
  return Response.json(
    {
      build: BUILD,
      ...caps,
      // what the FFmpeg download on this host last did (Linux): why it's still the older one, if it is
      ...(process.platform === "linux" ? { ffmpegFetch: fetchStatus() } : {}),
    },
    { status: caps.ok ? 200 : 503 },
  );
}

