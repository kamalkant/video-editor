import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { MEME_CATALOG } from "@/lib/library/memeCatalog";
import { generateMemeSvg } from "@/lib/library/memeGenerator";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meme = MEME_CATALOG.find((m) => m.id === id);

  if (!meme) {
    return new Response("Not found", { status: 404 });
  }

  const jpgPath = join(process.cwd(), "public", "library", "memes", `${id}.jpg`);
  if (existsSync(jpgPath)) {
    const data = await readFile(jpgPath);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const svg = generateMemeSvg(meme);
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=60",
    },
  });
}
