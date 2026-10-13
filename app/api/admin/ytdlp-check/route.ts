import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { denoBin, ytDlpBin, ytDlpJsArgs, ytDlpClientArgs, ytDlpCookiesArgs, ytDlpEnv, ytDlpFailureOf, ytDlpProxyArgs, ytDlpTail, ytDlpVersion, type YtAttempt } from "@/lib/import/ytdlp";

export const runtime = "nodejs";

/** A short public clip that downloads anywhere YouTube lets this server download at all. */
const DEFAULT_ID = "jNQXAC9IVRw";

const run = (args: string[], timeout: number) =>
  new Promise<{ ok: boolean; code: string | number | null; killed: boolean; stderr: string }>((resolve) => {
    execFile(ytDlpBin(), args, { timeout, env: ytDlpEnv(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      resolve({ ok: !err, code: e ? (e.code ?? null) : 0, killed: !!e?.killed, stderr: String(stderr ?? "") });
    });
  });

const versionOf = (bin: string, flag: string) =>
  new Promise<string>((resolve) =>
    execFile(bin, [flag], { timeout: 15_000, encoding: "utf8" }, (err, stdout) => resolve(err ? `doesn't run (${(err as NodeJS.ErrnoException).code ?? err.message})` : String(stdout).split("\n")[0]!.trim())),
  );

/**
 * GET /api/admin/ytdlp-check[?id=<video id>] (admins): can this server download online clips, and if not,
 * what YouTube says. Tries the same ways the editor does (with the cookies, without them, the embedded
 * player) without downloading anything (--simulate), and shows each answer.
 */
export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const raw = new URL(request.url).searchParams.get("id") ?? DEFAULT_ID;
  const id = /^[\w-]{6,20}$/.test(raw) ? raw : DEFAULT_ID;
  const url = `https://www.youtube.com/watch?v=${id}`;
  const cookies = ytDlpCookiesArgs();
  const proxy = ytDlpProxyArgs();
  const base = [...ytDlpJsArgs(), ...proxy, "--simulate", "--no-warnings", "-f", "b[ext=mp4]/18/b"];
  const ways: { label: string; args: string[] }[] = [
    ...(cookies.length ? [{ label: "with cookies", args: [...ytDlpClientArgs(cookies), ...cookies] }] : []),
    { label: "without cookies", args: ytDlpClientArgs([]) },
    { label: "embedded player", args: ["--extractor-args", "youtube:player_client=web_embedded,mweb", ...cookies] },
  ];
  const results = [];
  const attempts: YtAttempt[] = [];
  for (const w of ways) {
    const r = await run([...base, ...w.args, "--", url], 45_000);
    results.push({ way: w.label, ok: r.ok, exit: r.code, timedOut: r.killed, said: ytDlpTail(r.stderr, 8) });
    if (!r.ok) attempts.push({ label: w.label, stderr: r.stderr, code: r.code, killed: r.killed });
  }
  let cookiesUpdatedAt: string | null = null;
  try {
    cookiesUpdatedAt = cookies[1] ? new Date(statSync(cookies[1]).mtimeMs).toISOString() : null;
  } catch {
    /* gone meanwhile */
  }
  const works = results.some((r) => r.ok);
  return Response.json({
    video: id,
    works,
    // what people are told when every way fails
    verdict: works ? "Online clips can be downloaded from this server." : ytDlpFailureOf(attempts),
    ytdlp: await ytDlpVersion(),
    // what solves YouTube's JavaScript challenges here
    jsRuntimes: { deno: denoBin() ? await versionOf(denoBin()!, "--version") : "not installed (yt-dlp looks on the PATH)", node: process.version },
    cookies: { active: cookies.length > 0, updatedAt: cookiesUpdatedAt },
    proxy: proxy.length > 0,
    results,
  });
}
