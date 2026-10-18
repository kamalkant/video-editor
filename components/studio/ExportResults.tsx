"use client";

import { useEffect, useState } from "react";
import { DeleteNowButton } from "@/components/results/DeleteNowButton";
import { EmbedCodeBox } from "@/components/results/EmbedCodeBox";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { outputGeometry } from "@/lib/edit/geometry";
import type { EditSpec } from "@/lib/edit/spec";
import type { CropInfo } from "@/lib/editor/useCropBox";
import { useEstimate } from "@/lib/editor/useEstimate";
import { formatBytes } from "@/lib/format";
import type { Job, JobFile } from "@/lib/jobs/queue";
import type { VideoMeta } from "@/lib/videos";
import { Section } from "./Section";

const FILE_TEXT: Record<string, { title: string; note: string }> = {
  webm: { title: "For Chrome, Edge, Firefox, Android (.webm)", note: "VP9 + transparency" },
  mov: { title: "For Safari, iPhone, iPad (.mov)", note: "HEVC + transparency" },
  poster: { title: "Poster image (.png)", note: "Shown before the video starts" },
};

const QUALITY_TEXT = { small: "Small file", balanced: "Balanced", best: "Best quality" } as const;

export function fileUrl(job: Job, f: JobFile, download = false) {
  if ((f as any).blobUrl) return (f as any).blobUrl;
  return `/api/files/${job.id}/${f.name}${download ? "?download=1" : ""}`;
}

function PhoneTest({ jobId }: { jobId: string }) {
  const [share, setShare] = useState<{ phoneUrl: string | null; qrSvg: string | null; testPath: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch(`/api/jobs/${jobId}/share`)
      .then((r) => r.json())
      .then((j) => alive && setShare(j))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [jobId]);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        <a className="text-link underline" href={`/test/${jobId}`} target="_blank" rel="noreferrer">
          Open the test page
        </a>{" "}
        — it runs the exact embed code.
      </p>
      {share?.phoneUrl && share.qrSvg ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded bg-white p-1" aria-hidden="true" dangerouslySetInnerHTML={{ __html: share.qrSvg }} />
          <div className="min-w-0 flex-1">
            <p>Scan to test on your phone:</p>
            <p className="break-all font-mono text-xs">{share.phoneUrl}</p>
            <p className="mt-1 text-muted">Same Wi-Fi, and start the editor with <code>npm run dev:lan</code>.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-3" aria-busy="true">
          <Skeleton className="size-24 shrink-0 rounded" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-56" />
          </span>
        </div>
      ) : (
        <p className="text-muted">Connect to Wi-Fi to test on a phone.</p>
      )}
    </div>
  );
}

/** "You'll get", the output size and the estimated file size. */
export function ExportSummary({ video, spec, crop, estimateOn }: { video: VideoMeta; spec: EditSpec; crop: CropInfo; estimateOn: boolean }) {
  const geo = outputGeometry(spec.output, video.info, spec.output.crop.enabled ? crop.box : null);
  const withSound = spec.output.audio === "keep" && video.info.hasAudio;
  const { estimate, estimating, failed } = useEstimate(video.id, spec, estimateOn);
  return (
    <div className="card flex flex-col gap-2 p-4">
      <h3 className="font-semibold">You&apos;ll get</h3>
      <ul className="flex flex-col gap-1 text-sm">
        <li>✓ {FILE_TEXT.webm.title}</li>
        <li>✓ {FILE_TEXT.mov.title}</li>
        <li>✓ {FILE_TEXT.poster.title}</li>
        {spec.output.master && <li>✓ ProRes 4444 master (large)</li>}
      </ul>
      <p className="text-sm text-muted" data-testid="export-summary">
        {spec.output.crop.enabled && crop.status === "finding" ? "Finding the crop…" : `${geo.outW} × ${geo.outH}`}
        {spec.output.crop.enabled && crop.box ? " (cropped)" : ""} · {Math.round(geo.outFps * 100) / 100} fps · {QUALITY_TEXT[spec.output.quality]} · {withSound ? "with sound" : "no sound"}
      </p>
      <p className="text-sm" aria-live="polite" data-testid="size-estimate">
        {estimate ? (
          <>
            <strong>Estimated size:</strong> WebM ~{formatBytes(estimate.webm)} · Safari MOV ~{formatBytes(estimate.mov)}
            {estimate.master != null && <> · ProRes ~{formatBytes(estimate.master)}</>}
          </>
        ) : estimating ? (
          <span className="text-muted">Estimating the file size…</span>
        ) : failed ? (
          <span className="text-muted">Couldn&apos;t estimate the size.</span>
        ) : null}
      </p>
    </div>
  );
}

/** Downloads, embed code, checklist and test links of a finished export. */
export function ExportResults({ job, spec, onGenerate, onShowFinal, onAgain }: { job: Job; spec: EditSpec; onGenerate: () => void; onShowFinal: () => void; onAgain: () => void }) {
  // anything but the website pack (both see-through files): one file to play and download
  if (!(job.files.some((x) => x.kind === "webm") && job.files.some((x) => x.kind === "mov"))) {
    const main = job.files.find((x) => x.kind !== "poster" && x.kind !== "zip") ?? job.files[0];
    if (main) return <FileResults job={job} file={main} onAgain={onAgain} />;
  }
  const changedSinceExport = !job.doc && JSON.stringify(job.spec) !== JSON.stringify(spec);
  const f = (k: string) => job.files.find((x) => x.kind === k);
  const webm = f("webm")!;
  const mov = f("mov")!;
  const poster = f("poster");
  const zip = f("zip");
  const master = f("master");
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-line pb-3">
        <Notice tone="success" title="Your transparent video is ready" />
        {changedSinceExport && (
          <Notice tone="warning" title="You changed settings after this export">
            <button type="button" className="btn btn-secondary mt-1" onClick={onGenerate}>
              Export again with the new settings
            </button>
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={onShowFinal}>
            ▶ Play the final file in the preview
          </button>
          <button type="button" className="btn btn-secondary" onClick={onAgain}>
            Change export settings
          </button>
        </div>
      </div>
      <Section title="Download">
        {zip && (
          <a className="btn btn-primary" href={fileUrl(job, zip, true)}>
            Download website files · {formatBytes(zip.size)}
          </a>
        )}
        <p className="text-sm text-muted">Your website needs both video files. The embed code picks the right one for each visitor.</p>
        <ul className="flex flex-col gap-2">
          {[webm, mov, poster].filter(Boolean).map((file) => (
            <li key={file!.name} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{FILE_TEXT[file!.kind].title}</span>
                <span className="block text-xs text-muted">
                  {file!.name} · {formatBytes(file!.size)} · {FILE_TEXT[file!.kind].note}
                </span>
              </span>
              <a className="btn btn-secondary shrink-0 px-3" href={fileUrl(job, file!, true)}>
                <span aria-hidden="true">⬇</span>
                <span className="sr-only">Download {file!.name}</span>
              </a>
            </li>
          ))}
        </ul>
        {master && (
          <p className="text-sm">
            <a className="text-link underline" href={fileUrl(job, master, true)}>
              ProRes 4444 master · {formatBytes(master.size)}
            </a>{" "}
            <span className="text-muted">— for video editing only.</span>
          </p>
        )}
      </Section>
      <Section title="Put it on your website">
        <EmbedCodeBox webmName={webm.name} movName={mov.name} posterName={poster?.name} width={job.output.width} height={job.output.height} withSound={job.output.hasAudio} bare />
      </Section>
      <Section title="Hosting checklist" defaultOpen={false}>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Upload both video files (and the poster) to the same folder on your website, e.g. /videos/.</li>
          <li>Paste the code into your page, just before &lt;/body&gt;.</li>
          <li>Your host must allow &quot;range requests&quot;. Most do. Without it, Safari and iPhone show nothing.</li>
          <li>Send the right types: .webm as video/webm, .mov as video/quicktime.</li>
          <li>Videos start muted (browsers only autoplay silent video).{job.output.hasAudio ? " Keep the “Turn sound on” button so visitors can hear the voice." : ""}</li>
          <li>Test in Chrome and on an iPhone before you publish.</li>
        </ol>
      </Section>
      <Section title="Test it">
        <PhoneTest jobId={job.id} />
      </Section>
      <div className="flex flex-wrap gap-2 pt-3">
        <DeleteNowButton jobId={job.id} />
      </div>
    </div>
  );
}

/** What a single-file export is, by its kind. */
const KIND_TEXT: Record<string, { what: string; note: string }> = {
  mp4: { what: "video (MP4)", note: "H.264. Works on YouTube, Instagram, WhatsApp and every player." },
  hevc: { what: "video (MP4, HEVC)", note: "H.265: iPhone, Mac, newer Android and TVs." },
  av1: { what: "video (MP4, AV1)", note: "AV1: Chrome, Firefox and YouTube." },
  vp9: { what: "video (WebM)", note: "VP9. For websites: Chrome, Edge, Firefox, Android." },
  prores: { what: "video (ProRes 422 HQ)", note: "For Premiere, Final Cut and DaVinci. Browsers may not play it." },
  webm: { what: "see-through video (WebM)", note: "VP9 + alpha. Chrome, Edge, Firefox, Android. Safari needs the MOV." },
  mov: { what: "see-through video (MOV)", note: "HEVC + alpha. Safari, iPhone, iPad. Chrome needs the WebM." },
  master: { what: "ProRes 4444 master", note: "See-through, for video editing only (large)." },
  gif: { what: "GIF", note: "Loops forever, no sound." },
  png: { what: "picture (PNG)", note: "The frame at the playhead." },
  jpg: { what: "picture (JPG)", note: "The frame at the playhead." },
  mp3: { what: "sound (MP3)", note: "Sound only." },
  m4a: { what: "sound (M4A)", note: "AAC, sound only." },
  wav: { what: "sound (WAV)", note: "Uncompressed, sound only." },
};

/** A finished export of one file: play or look at it, then download. */
function FileResults({ job, file, onAgain }: { job: Job; file: JobFile; onAgain: () => void }) {
  const poster = job.files.find((x) => x.kind === "poster");
  // a GIF is made at most 640 px wide
  const gw = file.kind === "gif" ? Math.min(640, job.output.width) : job.output.width;
  const gh = file.kind === "gif" ? Math.round((job.output.height * gw) / job.output.width / 2) * 2 : job.output.height;
  const media = file.mime.startsWith("image/") ? (
    // eslint-disable-next-line @next/next/no-img-element -- a finished file, served as is
    <div className="flex items-center justify-center rounded-xl bg-dialog-card/60 p-2.5 border border-dialog-card-border">
      <img
        data-testid="file-result"
        src={src}
        alt={`The exported ${t.what}`}
        style={{ aspectRatio: `${gw} / ${gh}` }}
        className="bg-checker max-h-72 max-w-full rounded-lg object-contain shadow-md ring-1 ring-white/10"
      />
    </div>
  ) : file.mime.startsWith("audio/") ? (
    <audio data-testid="file-result" src={src} controls className="w-full" />
  ) : (
    <div className="flex items-center justify-center rounded-xl bg-dialog-card/60 p-2.5 border border-dialog-card-border">
      <video
        data-testid="mp4-result"
        src={src}
        poster={poster ? fileUrl(job, poster) : undefined}
        controls
        playsInline
        style={{ aspectRatio: `${gw} / ${gh}` }}
        className="max-h-72 max-w-full rounded-lg bg-black object-contain shadow-md ring-1 ring-white/10"
      />
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="success" title={file.mime.startsWith("video/") ? "Your video is ready" : `Your ${t.what} is ready`} />
      {media}
      <a className="btn btn-primary" href={fileUrl(job, file, true)} download={file.name}>
        Download {t.what} · {formatBytes(file.size)}
      </a>
      <p className="text-sm text-muted">
        {cap}: {file.mime.startsWith("audio/") ? "" : `${gw} × ${gh} · `}
        {file.mime.startsWith("video/") ? (job.output.hasAudio ? "with sound · " : "without sound · ") : ""}
        {t.note}
      </p>
      <div className="flex flex-wrap gap-2">
        {poster && (
          <a className="btn btn-secondary" href={fileUrl(job, poster, true)}>
            Poster image (.png)
          </a>
        )}
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          Change export settings
        </button>
        <DeleteNowButton jobId={job.id} />
      </div>
    </div>
  );
}
