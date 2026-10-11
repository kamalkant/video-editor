import { buildEmbedSnippet } from "@/lib/embed/snippet";
import { getJob } from "@/lib/jobs/queue";

export const runtime = "nodejs";

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

/**
 * Plain-HTML test page (no React) that runs the exact embed snippet the user
 * copies, so it can be opened on a phone over the LAN.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/test/[jobId]">,
) {
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job || job.state !== "done") {
    return new Response(
      "<!doctype html><title>Not found</title><p>This result is no longer here. Files are deleted after 24 hours.</p>",
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
  const find = (k: string) => job.files.find((f) => f.kind === k)?.name;
  const snippet = buildEmbedSnippet({
    folder: `/api/files/${job.id}/`,
    webmName: find("webm")!,
    movName: find("mov")!,
    posterName: find("poster"),
    width: job.output.width,
    height: job.output.height,
    withSound: job.output.hasAudio,
  });
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ViPlay Studio · test page</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111827; background: #F3F4F6; min-height: 100vh; }
  body.bg-dark { background: #1F2937; color: #F9FAFB; }
  body.bg-checker { background-color: #FFFFFF; background-image: repeating-conic-gradient(#BFC4CC 0 25%, transparent 0 50%); background-size: 24px 24px; }
  main { max-width: 40rem; padding: 1.5rem 1rem 22rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  .card { background: #FFFFFF; color: #111827; border: 1px solid #7C8698; border-radius: .5rem; padding: 1rem; margin: 1rem 0; }
  .using { font-weight: 700; }
  button.bg { min-height: 2.75rem; padding: 0 1rem; margin: .25rem .25rem 0 0; border: 1px solid #7C8698; border-radius: .5rem; background: #FFFFFF; color: #111827; font: inherit; cursor: pointer; }
  button.bg[aria-pressed="true"] { border: 2px solid #1D4ED8; font-weight: 700; }
  :focus-visible { outline: 2px solid #1D4ED8; outline-offset: 2px; }
  p { margin: .5rem 0; }
</style>
</head>
<body class="bg-checker">
<main>
  <h1>ViPlay Studio · test page</h1>
  <p>The avatar in the bottom-right corner uses the same code you copy. If the background shows through around the person, transparency works.</p>
  <div class="card">
    <p>This browser is using: <span class="using" id="using">…</span></p>
    <p id="check" aria-live="polite"></p>
    <div role="group" aria-label="Page background">
      <button class="bg" type="button" data-bg="bg-checker" aria-pressed="true">Checkerboard</button>
      <button class="bg" type="button" data-bg="" aria-pressed="false">Light</button>
      <button class="bg" type="button" data-bg="bg-dark" aria-pressed="false">Dark</button>
    </div>
  </div>
  <div class="card">
    <p><strong>Try it on your phone too.</strong> Open this page in Safari on iPhone and in Chrome on Android. Both should show the person without a box around them.</p>
    <p>File: <code>${esc(find("webm")!)}</code> or <code>${esc(find("mov")!)}</code></p>
  </div>
</main>
${snippet}
<script>
  (function () {
    var v = document.getElementById("VDO-avatar");
    var using = document.getElementById("using");
    function show() { using.textContent = /\\.mov/.test(v.currentSrc || v.src) ? "Safari file (.mov)" : "Chrome file (.webm)"; }
    show();
    v.addEventListener("loadeddata", show);
    v.addEventListener("error", function () { document.getElementById("check").textContent = "This browser could not play the video."; });
    document.querySelectorAll("button.bg").forEach(function (b) {
      b.addEventListener("click", function () {
        document.body.className = b.dataset.bg;
        document.querySelectorAll("button.bg").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      });
    });
  })();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
