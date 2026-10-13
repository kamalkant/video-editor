import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getCapabilities } from "@/lib/ffmpeg/capabilities";
import { denoBin, ytDlpCheck, ytDlpCookiesArgs } from "@/lib/import/ytdlp";
import { execFile } from "node:child_process";

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

/** "2.9.7", or why it doesn't run (shared hosting can refuse a program the memory it reserves). */
const denoVersion = (bin: string) =>
  new Promise<string>((resolve) =>
    execFile(bin, ["--version"], { timeout: 15_000, encoding: "utf8" }, (err, stdout, stderr) => {
      if (!err) return resolve(/deno (\S+)/.exec(String(stdout))?.[1] ?? String(stdout).split("\n")[0]!.trim());
      const why = (err as NodeJS.ErrnoException).code ?? String(stderr).trim().split("\n").pop() ?? err.message;
      resolve(`doesn't run: ${String(why).replace(/\/[^\s:'"]+/g, "…").slice(0, 160)}`);
    }),
  );

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.has("refresh");
  const caps = await getCapabilities(refresh);
  // the YouTube downloader (meme search, YouTube import): runs here or why not
  const ytdlp = await ytDlpCheck();
  const cookies = ytDlpCookiesArgs();
  // what solves YouTube's JavaScript challenges for the meme downloader (Deno first; Node is the fallback)
  const deno = denoBin();
  const denoState = deno ? await denoVersion(deno) : "not installed";
  return Response.json(
    {
      build: BUILD,
      ...caps,
      ytdlp,
      jsRuntimes: { deno: denoState, node: process.version },
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
