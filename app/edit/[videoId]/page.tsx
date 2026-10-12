import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

/** Old editor URL → direct redirect to /editor. */
export default async function Page({ params, searchParams }: PageProps<"/edit/[videoId]">) {
  const { videoId } = await params;
  const { job } = await searchParams;
  redirect(`/editor?v=${encodeURIComponent(videoId)}${typeof job === "string" ? `&job=${encodeURIComponent(job)}` : ""}`);
}
