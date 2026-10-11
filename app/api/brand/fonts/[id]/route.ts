import { readFile } from "node:fs/promises";
import { FONT_MIME, fontPath, getBrand, removeFont } from "@/lib/brand";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";

/** A Brand Kit font file (for the browser to load). */
export async function GET(_request: Request, ctx: RouteContext<"/api/brand/fonts/[id]">) {
  const { id } = await ctx.params;
  const f = (await getBrand()).fonts.find((x) => x.id === id);
  if (!f) return apiError(404, "not_found", "No such font.");
  try {
    return new Response(new Uint8Array(await readFile(fontPath(f))), { headers: { "Content-Type": FONT_MIME[f.format], "Cache-Control": "private, max-age=86400" } });
  } catch {
    return apiError(404, "not_found", "The font file is missing.");
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/brand/fonts/[id]">) {
  const { id } = await ctx.params;
  return Response.json(await removeFont(id));
}
