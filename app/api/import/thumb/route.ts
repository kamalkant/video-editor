import { apiError } from "@/lib/http/errors";
import { fakeThumb, isImportFake } from "@/lib/import/fake";
import { allowedUrl } from "@/lib/import/stock";

export const runtime = "nodejs";

/**
 * Library thumbnails through our own server (?u=…): the browser never talks to
 * Pexels / Pixabay for pictures, and only their picture hosts are fetched.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const fake = sp.get("fake");
  if (fake && isImportFake()) return new Response(new Uint8Array(await fakeThumb(fake)), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  const u = allowedUrl(sp.get("u") ?? "");
  if (!u) return apiError(400, "bad_request", "Not a library picture.");
  // (no redirects: only the allowed hosts are ever fetched)
  const res = await fetch(u, {
    redirect: "error",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ViPlay-Studio/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res?.ok || !type.startsWith("image/")) return apiError(502, "thumb_failed", "Couldn't load the picture.");
  const body = await res.arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) return apiError(502, "thumb_failed", "Picture too big.");
  return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}
