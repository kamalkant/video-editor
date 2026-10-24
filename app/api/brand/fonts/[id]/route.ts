import { readFile } from "node:fs/promises";
import { findFont, FONT_MIME, fontPath, removeFont } from "@/lib/brand";
import { requireUser } from "@/lib/auth/requireUser";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";

/** One of your Brand Kit fonts (for the browser to load), from any of your kits. */
export async function GET(_request: Request, ctx: RouteContext<"/api/brand/fonts/[id]">) {
  const user = await requireUser("Sign in to use your fonts.");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const f = await findFont(user.id, id);
  if (!f) return apiError(404, "not_found", "No such font.");
  try {
    return new Response(new Uint8Array(await readFile(fontPath(user.id, f))), { headers: { "Content-Type": FONT_MIME[f.format], "Cache-Control": "private, max-age=86400" } });
  } catch {
    return apiError(404, "not_found", "The font file is missing.");
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/brand/fonts/[id]">) {
  const user = await requireUser("Sign in to change your fonts.");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  return Response.json(await removeFont(user.id, id));
}
