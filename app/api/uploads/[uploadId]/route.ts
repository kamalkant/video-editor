import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { requireUser } from "@/lib/auth/requireUser";
import { appendChunk, cancelSession, statusOf } from "@/lib/uploads/chunked";
import { uploadErrorResponse } from "../errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ uploadId: string }> };

/** How much of the upload arrived (to resume after a dropped chunk). */
export async function GET(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    return Response.json(await statusOf((await ctx.params).uploadId, user.id));
  } catch (err) {
    return uploadErrorResponse(err);
  }
}

/** One chunk, as the raw body: ?offset= where it starts in the file. */
export async function PUT(request: Request, ctx: Ctx) {
  const user = await requireUser("Sign in to upload.");
  if (user instanceof Response) return user;
  const offset = Number(new URL(request.url).searchParams.get("offset"));
  try {
    return Response.json(await appendChunk((await ctx.params).uploadId, user.id, offset, request.body as unknown as WebReadableStream<Uint8Array> | null));
  } catch (err) {
    return uploadErrorResponse(err);
  }
}

/** Stop the upload and forget what arrived. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    await cancelSession((await ctx.params).uploadId, user.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}
