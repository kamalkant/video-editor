import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getJob } from "@/lib/jobs/queue";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

/** Old results URL → direct redirect to /editor with the export open. */
export default async function Page({ params }: PageProps<"/results/[jobId]">) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) notFound();
  // (a timeline of only text and elements has no video)
  redirect(job.videoId ? `/editor?v=${job.videoId}&job=${job.id}` : `/editor?job=${job.id}`);
}
