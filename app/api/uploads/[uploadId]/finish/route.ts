import { requireUser } from "@/lib/auth/requireUser";
import { finishSession } from "@/lib/uploads/chunked";
import { uploadErrorResponse } from "../../errors";

export const runtime = "nodejs";

/** Every chunk arrived: the file is checked and added to My Assets (the same answer as POST /api/videos). */
export async function POST(_request: Request, ctx: { params: Promise<{ uploadId: string }> }) {
  const user = await requireUser("Sign in to upload.");
  if (user instanceof Response) return user;
  try {
    return Response.json(await finishSession((await ctx.params).uploadId, user.id), { status: 201 });
  } catch (err) {
    return uploadErrorResponse(err, "Something went wrong while saving the video.");
  }
}
