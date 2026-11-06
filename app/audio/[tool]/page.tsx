import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AUDIO_TOOLS, audioToolById } from "@/lib/audio/tools/catalog";
import { AudioTool } from "@/components/audio/AudioTool";

export const dynamicParams = false;

export function generateStaticParams() {
  return AUDIO_TOOLS.map((t) => ({ tool: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const t = audioToolById((await params).tool);
  return t ? { title: t.title, description: t.description, alternates: { canonical: `/audio/${t.id}` } } : {};
}

export default async function AudioToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const t = audioToolById((await params).tool);
  if (!t) notFound();
  return <AudioTool id={t.id} />;
}
