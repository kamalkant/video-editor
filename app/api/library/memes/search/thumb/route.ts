import { readFile } from "node:fs/promises";
import { ensureDynamicThumb } from "@/lib/library/dynamicSearch";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  try {
    const thumbPath = await ensureDynamicThumb(id);
    if (!thumbPath) {
      return new Response("Thumbnail not found", { status: 404 });
    }

    const data = await readFile(thumbPath);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("Failed to serve dynamic thumbnail", id, err);
    return new Response("Error", { status: 500 });
  }
}
