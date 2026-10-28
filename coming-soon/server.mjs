// viplay.in while the products live on their own subdomains: the bare home page says "coming soon",
// every other address (old bookmarks, /login, /editor, emailed reset and verify links, ?ref= sign-up links)
// moves to the same address on video.viplay.in. No dependencies: Hostinger runs `node server.mjs`.
import { createServer } from "node:http";

const VIDEO = "https://video.viplay.in";
const PHOTO = "https://photo.viplay.in";

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ViPlay — coming soon</title>
<meta name="description" content="Something new is coming to viplay.in. Meanwhile, edit videos at video.viplay.in and photos at photo.viplay.in.">
<meta name="theme-color" content="#070b17">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
    background: radial-gradient(60rem 40rem at 50% -10%, #16264a, #070b17 70%);
    color: #e7ebf3; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 560px; text-align: center; }
  .brand { font-weight: 700; letter-spacing: .02em; color: #8db6ff; }
  h1 { font-size: clamp(2.25rem, 8vw, 3.5rem); line-height: 1.1; margin: .5rem 0 1rem; }
  p { color: #a3adc2; margin: 0 0 2rem; }
  .links:not([hidden]) { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  a {
    display: block; padding: 14px 18px; border-radius: 12px; text-decoration: none;
    background: #111a2e; border: 1px solid #222e48; color: #e7ebf3; font-weight: 600;
  }
  a:hover, a:focus-visible { border-color: #2563eb; outline: none; }
  a.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  a.primary:hover, a.primary:focus-visible { background: #1d4ed8; }
  a small { display: block; font-weight: 400; opacity: .8; }
</style>
</head>
<body>
<main>
  <div class="brand">ViPlay</div>
  <h1>Coming soon</h1>
  <p>Something new is on its way to viplay.in.<span hidden> Our editors are already live:</span></p>
  <!-- hidden for now; remove the hidden attribute to show the links again -->
  <div class="links" hidden>
    <a class="primary" href="${VIDEO}">ViPlay Studio <small>video.viplay.in</small></a>
    <a href="${PHOTO}">Photo Editor <small>photo.viplay.in</small></a>
  </div>
</main>
</body>
</html>`;

const HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export function handle(req, res) {
  const url = new URL(req.url || "/", "http://x");
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" });
    return res.end("User-agent: *\nAllow: /\n");
  }
  if (url.pathname === "/" && !url.search) {
    res.writeHead(200, { ...HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
    return res.end(req.method === "HEAD" ? undefined : PAGE);
  }
  // 308 keeps the method and body (a form post, a payment webhook)
  res.writeHead(308, { ...HEADERS, Location: VIDEO + url.pathname + url.search });
  res.end();
}

// listens however it's started: `node server.mjs`, or loaded by Hostinger's process manager
const port = Number(process.env.PORT) || 3000;
createServer(handle).listen(port, () => console.log(`coming-soon on :${port}`));
