import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getCapabilities } from "@/lib/ffmpeg/capabilities";
import { ytDlpCheck, ytDlpCookiesArgs } from "@/lib/import/ytdlp";

export const runtime = "nodejs";

/** Which build is live (Next's build id), to tell a finished deploy apart. */
const BUILD = (() => {
  try {
    return readFileSync(join(/*turbopackIgnore: true*/ process.cwd(), process.env.NEXT_DIST_DIR || ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return null;
  }
})();

const cookieTime = (path: string | undefined): string | null => {
  try {
    return path ? new Date(statSync(path).mtimeMs).toISOString() : null;
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.has("refresh");
  const caps = await getCapabilities(refresh);
  // the YouTube downloader (meme search, YouTube import): runs here or why not
  const ytdlp = await ytDlpCheck();
  const cookies = ytDlpCookiesArgs();
  return Response.json(
    {
      build: BUILD,
      ...caps,
      ytdlp,
      cookies: {
        active: cookies.length > 0,
        path: cookies[1] ?? null,
        // (exported YouTube cookies stop working after a while: when this one was last replaced)
        updatedAt: cookieTime(cookies[1]),
      },
    },
    { status: caps.ok ? 200 : 503 },
  );
}
