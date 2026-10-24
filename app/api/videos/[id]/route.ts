import { apiError } from "@/lib/http/errors";
import { projectsUsingVideo } from "@/lib/projects/store";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { deleteVideo, getVideo, hideVideoFromLibrary, restoreUpload, UploadError } from "@/lib/videos";
import { getCurrentUser } from "@/lib/auth/session";
import { templatesUsing } from "@/lib/templates/custom";
import { requireUser } from "@/lib/auth/requireUser";
import { requireMedia } from "@/lib/auth/media";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  // only your own file's details
  const own = await requireMedia(id);
  if (own instanceof Response) return own;
  return Response.json(own.video);
}

/**
 * Delete an uploaded video from My Assets.
 * If projects or custom templates currently use it, it is unlisted from My Assets
 * while leaving the file on disk so existing projects and templates continue working.
 * If not in use anywhere, it is permanently deleted.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");

  const user = await getCurrentUser();
  if (video.userId && video.userId !== "local") {
    if (!user) return apiError(401, "unauthorized", "Sign in to delete assets.");
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (video.userId !== user.id && !isAdmin) {
      return apiError(403, "forbidden", "You cannot delete another user's asset.");
    }
  }

  const [users, tpl] = await Promise.all([projectsUsingVideo(id), templatesUsing(id)]);
  if (users.length > 0 || tpl.length > 0) {
    await hideVideoFromLibrary(id);
    return new Response(null, { status: 204 });
  }
  await deleteVideo(id);
  return new Response(null, { status: 204 });
}


/**
 * An upload under an id the browser chose: the editor's local-first import (the clip is already on the
 * timeline, playing from your own file, while this runs in the background) and portable .vdo packages.
 * Sending the same file again is harmless: the finished upload is returned.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const user = await requireUser("Sign in to upload.");
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const existing = await getVideo(id);
  if (existing) {
    // (someone else's file under that id: not yours to see or replace)
    if (existing.userId && existing.userId !== user.id) return apiError(409, "exists", "A file with this id is already uploaded.");
    return Response.json(existing);
  }

  const fileName = request.headers.get("x-file-name") || `${id}.mp4`;
  const contentType = request.headers.get("content-type");

  try {
    const meta = await restoreUpload(
      id,
      request.body as unknown as WebReadableStream<Uint8Array> | null,
      contentType,
      fileName,
      user.id,
      request.headers.get("content-length") ? Number(request.headers.get("content-length")) : null,
    );
    return Response.json(meta, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Failed to restore video asset.");
  }
}
