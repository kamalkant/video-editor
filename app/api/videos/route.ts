import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { apiError } from "@/lib/http/errors";
import { mediaIdsOf } from "@/lib/edit/doc";
import { listProjects } from "@/lib/projects/store";
import { listVideos, saveUpload, UploadError } from "@/lib/videos";
import { getCurrentUser } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

/** Raw-body upload: the file is the request body; its name is in X-File-Name. */
export async function POST(request: Request) {
  const user = await requireUser("Sign in to upload.");
  if (user instanceof Response) return user;
  const len = request.headers.get("content-length");

  try {
    const meta = await saveUpload(
      request.body as unknown as WebReadableStream<Uint8Array> | null,
      request.headers.get("content-type"),
      request.headers.get("x-file-name"),
      len ? Number(len) : null,
      request.headers.get("x-recording") === "1",
      user.id,
    );
    return Response.json(meta, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Something went wrong while saving the video.");
  }
}

/** My Assets: personalized to the authenticated user. Newest first, with the projects that use it. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ videos: [] });
  }

  const [videos, projects] = await Promise.all([
    listVideos({ userId: user.id }),
    listProjects(user.id),
  ]);

  return Response.json({
    videos: videos.map((v) => ({
      ...v,
      usedIn: projects.filter((p) => mediaIdsOf(p.doc).includes(v.id)).map((p) => ({ id: p.id, name: p.name })),
    })),
  });
}
