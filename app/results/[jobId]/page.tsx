import { notFound, redirect } from "next/navigation";
import { getJob } from "@/lib/jobs/queue";

/** Old results URL → the one-screen studio with the export open. */
export default async function Page({ params }: PageProps<"/results/[jobId]">) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) notFound();
  // (a timeline of only text and elements has no video)
  redirect(job.videoId ? `/?v=${job.videoId}&job=${job.id}` : `/?job=${job.id}`);
}
