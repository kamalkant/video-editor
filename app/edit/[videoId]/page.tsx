import { redirect } from "next/navigation";

/** Old editor URL → the one-screen studio. */
export default async function Page({ params, searchParams }: PageProps<"/edit/[videoId]">) {
  const { videoId } = await params;
  const { job } = await searchParams;
  redirect(`/?v=${encodeURIComponent(videoId)}${typeof job === "string" ? `&job=${encodeURIComponent(job)}` : ""}`);
}
