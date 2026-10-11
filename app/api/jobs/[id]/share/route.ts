import QRCode from "qrcode";
import { apiError } from "@/lib/http/errors";
import { getJob } from "@/lib/jobs/queue";
import { lanAddress } from "@/lib/lan";

export const runtime = "nodejs";

/** Test-page address on this Wi-Fi network plus a QR code, for checking on a phone. */
export async function GET(request: Request, ctx: RouteContext<"/api/jobs/[id]/share">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return apiError(404, "not_found", "This job is no longer here.");
  const port = (request.headers.get("host") ?? "localhost:3000").split(":")[1] ?? "3000";
  const lan = lanAddress();
  const phoneUrl = lan ? `http://${lan}:${port}/test/${job.id}` : null;
  const qrSvg = phoneUrl ? await QRCode.toString(phoneUrl, { type: "svg", margin: 1, width: 150 }) : null;
  return Response.json({ phoneUrl, qrSvg, testPath: `/test/${job.id}` });
}
