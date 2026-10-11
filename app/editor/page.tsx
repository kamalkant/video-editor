import { redirect } from "next/navigation";
import { Studio } from "@/components/studio/Studio";
import { AnnouncementBanner } from "@/components/studio/AnnouncementBanner";
import { getAnnouncement } from "@/lib/announcement";
import { getCurrentUser } from "@/lib/auth/session";
import { mediaIdsOf } from "@/lib/edit/doc";
import { getCapabilities } from "@/lib/ffmpeg/capabilities";
import { getJob } from "@/lib/jobs/queue";
import { getProject } from "@/lib/projects/store";
import { getVideo, type VideoMeta } from "@/lib/videos";

export const dynamic = "force-dynamic";

/**
 * ViPlay Studio — Full Multi-Track NLE Video Editor.
 * State lives in ?p=<projectId> (or ?v=<videoId>&job=<jobId>).
 */
export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; v?: string; job?: string; template?: string }>;
}) {
  const { p, v, job, template } = await searchParams;
  const templateId = typeof template === "string" && /^[a-z0-9-]{1,64}$/.test(template) ? template : null;

  const user = await getCurrentUser();
  if (!user) {
    // keep the template picked on the website through sign-in
    redirect(`/login?next=${encodeURIComponent(templateId ? `/editor?template=${templateId}` : "/editor")}`);
  }

  const project = typeof p === "string" ? await getProject(p, user.id) : null;
  let notice: string | null = typeof p === "string" && !project ? "That project was deleted." : null;
  const ids = project ? mediaIdsOf(project.doc) : typeof v === "string" ? [v] : [];
  const media = (await Promise.all(ids.map(getVideo))).filter((m): m is VideoMeta => !!m);
  if (project && media.length < ids.length) {
    notice = `A file used in “${project.name}” is missing. Upload it again to use it.`;
  }
  const jobId = project ? project.jobId : typeof job === "string" ? job : null;
  const j = jobId ? await getJob(jobId) : null;
  const initialJob = j && j.state !== "canceled" && (project || j.videoId === media[0]?.id) ? j : null;
  const caps = await getCapabilities();
  const announcement = getAnnouncement();

  return (
    <>
    <Studio
      key={`${project?.id ?? media[0]?.id ?? "empty"}:${initialJob?.id ?? ""}`}
      initialDoc={project?.doc ?? null}
      initialMedia={media}
      initialJob={initialJob}
      initialProject={project ? { id: project.id, name: project.name } : null}
      notice={notice}
      initialTemplateId={project ? null : templateId}
      capability={{ ok: caps.ok, message: caps.message }}
    />
    {announcement && <AnnouncementBanner {...announcement} />}
    </>
  );
}
