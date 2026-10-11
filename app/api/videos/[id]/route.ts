import { apiError } from "@/lib/http/errors";
import { projectsUsingVideo } from "@/lib/projects/store";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { deleteVideo, getVideo, hideVideoFromLibrary, restoreUpload, UploadError } from "@/lib/videos";
import { getCurrentUser } from "@/lib/auth/session";
import { templatesUsing } from "@/lib/templates/custom";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return apiError(404, "not_found", "This video is no longer here.");
  return Response.json(video);
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
  if (video.userId) {
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
 * Restore an embedded video/media file (e.g. from an imported portable .VDO package).
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  const existing = await getVideo(id);
  if (existing) return Response.json(existing);

  const fileName = request.headers.get("x-file-name") || `${id}.mp4`;
  const contentType = request.headers.get("content-type");

  try {
    const user = await getCurrentUser();
    const meta = await restoreUpload(
      id,
      request.body as unknown as WebReadableStream<Uint8Array> | null,
      contentType,
      fileName,
      user?.id ?? null,
    );
    return Response.json(meta, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Failed to restore video asset.");
  }
}
