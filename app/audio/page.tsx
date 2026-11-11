import type { Metadata } from "next";
import Link from "next/link";
import { AUDIO_TOOLS } from "@/lib/audio/tools/catalog";

export const metadata: Metadata = {
  title: "Audio tools",
  description: "Convert, compress, trim, normalize and record sound in your browser. Nothing is uploaded.",
  alternates: { canonical: "/audio" },
};

export default function AudioToolsPage() {
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm text-muted">
        <Link href="/editor" className="text-link hover:underline">
          ViPlay Studio
        </Link>{" "}
        / Audio
      </p>
      <h1 className="mt-2 text-2xl font-bold">Audio tools</h1>
      <p className="mt-1 text-muted">Everything runs in your browser: your sound is not uploaded.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {AUDIO_TOOLS.map((t) => (
          <li key={t.id}>
            <Link href={`/audio/${t.id}`} className="card block h-full transition hover:bg-hover">
              <span className="block font-semibold">{t.title}</span>
              <span className="mt-1 block text-sm text-muted">{t.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
