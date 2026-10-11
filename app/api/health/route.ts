import { getCapabilities } from "@/lib/ffmpeg/capabilities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.has("refresh");
  const caps = await getCapabilities(refresh);
  return Response.json(caps, { status: caps.ok ? 200 : 503 });
}
