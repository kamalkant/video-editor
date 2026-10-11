import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl p-6"><div className="card">
      <h1 className="text-xl font-bold mb-2">This video or result is no longer here</h1>
      <p className="text-muted mb-4">Files are deleted after 24 hours.</p>
      <Link href="/" className="btn btn-primary">
        Upload a video
      </Link>
    </div></main>
  );
}
