import { ZodError } from "zod";
import { coverMediaIdOrNull, docFromSpec, docSchema, mediaLiteOf, type TimelineDoc } from "@/lib/edit/doc";
import { parseSpec } from "@/lib/edit/spec";
import { apiError } from "@/lib/http/errors";
import { getJob } from "@/lib/jobs/queue";
import { nameFromFile } from "@/lib/projects/model";
import { createProject, listProjects, ProjectError, summarize } from "@/lib/projects/store";
import { getCurrentUser } from "@/lib/auth/session";
import { limitsOf } from "@/lib/settings";
import { getVideo } from "@/lib/videos";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to view projects.");
  }
  const projects = await listProjects(user.id);
  return Response.json({ projects: await Promise.all(projects.map(summarize)) });
}

/**
 * New project: { id?, doc, name?, jobId? } with a timeline, or the older
 * { videoId, spec } for one video. The name defaults to the first upload's file name.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to create projects.");
  }
  let body: { id?: unknown; doc?: unknown; videoId?: unknown; spec?: unknown; name?: unknown; jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    let doc: TimelineDoc;
    if (body.doc !== undefined) doc = docSchema.parse(body.doc);
    else {
      const video = typeof body.videoId === "string" ? await getVideo(body.videoId) : null;
      if (!video) return apiError(404, "not_found", "This video is no longer here. Upload it again.");
      doc = docFromSpec(parseSpec(body.spec, limitsOf(video.info)), mediaLiteOf(video));
    }
    const cover = coverMediaIdOrNull(doc);
    const coverMeta = cover ? await getVideo(cover) : null;
    const name = typeof body.name === "string" && body.name.trim() ? body.name : coverMeta ? nameFromFile(coverMeta.fileName) : "Untitled project";
    // an older link with an export: keep showing that export in the new project
    const job = typeof body.jobId === "string" ? await getJob(body.jobId) : null;
    const id = typeof body.id === "string" ? body.id : undefined;
    const p = await createProject({ id, name, doc, jobId: job?.id ?? null, userId: user.id });
    return Response.json(p, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return apiError(400, "bad_settings", err.issues[0]?.message ?? "Invalid project");
    if (err instanceof ProjectError) return apiError(err.status, err.code, err.message);
    return apiError(500, "server_error", "Couldn't create the project.");
  }
}
