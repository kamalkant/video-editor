import { addFont, BrandError, MAX_FONT_BYTES } from "@/lib/brand";
import { requireUser } from "@/lib/auth/requireUser";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";

/** Add a font file to your Brand Kit (the body; its name in X-File-Name). Returns { brand, font }. */
export async function POST(request: Request) {
  const user = await requireUser("Sign in to add fonts.");
  if (user instanceof Response) return user;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_FONT_BYTES) return apiError(413, "too_big", "That font file is too big (8 MB at most).");
  const buf = Buffer.from(await request.arrayBuffer());
  let name = "My font";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? name);
  } catch {
    /* keep the default */
  }
  try {
    return Response.json(await addFont(user.id, buf, name), { status: 201 });
  } catch (err) {
    if (err instanceof BrandError) return apiError(400, "bad_font", err.message);
    return apiError(500, "server_error", "Couldn't add the font.");
  }
}
