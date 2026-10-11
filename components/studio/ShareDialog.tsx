"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/ui/Icon";

export function ShareDialog({
  open,
  onClose,
  projectName,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  projectId: string;
}) {
  const [tab, setTab] = useState<"link" | "youtube">("link");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // YouTube publish state
  const [ytTitle, setYtTitle] = useState(projectName || "My Video");
  const [ytDescription, setYtDescription] = useState(
    "Created with ViPlay Studio",
  );
  const [ytTags, setYtTags] = useState("ViPlay, video editor, vdo");
  const [ytPrivacy, setYtPrivacy] = useState<"unlisted" | "public" | "private">(
    "unlisted",
  );
  const [ytBusy, setYtBusy] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytResult, setYtResult] = useState<{
    url: string;
    videoId: string;
    message: string;
  } | null>(null);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?p=${projectId}`
      : `http://localhost:3000/?p=${projectId}`;
  const embedCode = `<iframe src="${shareUrl}" width="854" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

  useEffect(() => {
    if (open) {
      QRCode.toDataURL(shareUrl, {
        width: 180,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    }
  }, [open, shareUrl]);

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    } catch {}
  };

  const handleYtUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytTitle.trim() || ytBusy) return;
    setYtBusy(true);
    setYtError(null);
    setYtResult(null);

    try {
      const res = await fetch("/api/share/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: ytTitle,
          description: ytDescription,
          privacy: ytPrivacy,
          tags: ytTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "YouTube upload failed.");
      }

      setYtResult({
        url: data.url,
        videoId: data.videoId,
        message: data.message,
      });
    } catch (err) {
      setYtError((err as Error).message);
    } finally {
      setYtBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
    >
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-2xl text-ink">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon name="share" className="size-4" />
            </span>
            <h2 id="share-title" className="text-base font-semibold">
              Share & Publish
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" className="size-4" />
          </button>
        </header>

        {/* Tab switch */}
        <div className="flex border-b border-line bg-raised/40 px-5 pt-2">
          <button
            type="button"
            onClick={() => setTab("link")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              tab === "link"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Share Link & Embed
          </button>
          <button
            type="button"
            onClick={() => setTab("youtube")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              tab === "youtube"
                ? "border-red-500 text-red-500"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <span className="text-red-500 font-bold">▶</span> YouTube Upload
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[75vh] overflow-y-auto">
          {tab === "link" ? (
            <div className="flex flex-col gap-5">
              {/* Share link */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted">
                  Direct project preview link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="field min-w-0 flex-1 font-mono text-xs select-all"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="btn btn-primary shrink-0 px-3 text-xs flex items-center gap-1"
                  >
                    <Icon
                      name={copiedLink ? "check" : "share"}
                      className="size-3.5"
                    />
                    {copiedLink ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Embed code */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted">
                  Embed on your website (iframe)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={embedCode}
                    className="field min-w-0 flex-1 font-mono text-xs select-all text-muted"
                  />
                  <button
                    type="button"
                    onClick={copyEmbed}
                    className="btn btn-secondary shrink-0 px-3 text-xs flex items-center gap-1"
                  >
                    <Icon
                      name={copiedEmbed ? "check" : "elements"}
                      className="size-3.5"
                    />
                    {copiedEmbed ? "Copied!" : "Copy Code"}
                  </button>
                </div>
              </div>

              {/* QR Code */}
              {qrDataUrl && (
                <div className="flex items-center gap-4 rounded-lg border border-line p-3 bg-raised/30">
                  <img
                    src={qrDataUrl}
                    alt="Project Share QR Code"
                    className="size-20 rounded border border-line bg-white p-1"
                  />
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-ink">
                      Scan to open on phone
                    </span>
                    <span className="text-muted">
                      Preview on mobile devices instantly without logging in.
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleYtUpload} className="flex flex-col gap-4">
              {ytError && (
                <div className="rounded-lg border border-red-500/50 bg-red-950/20 p-2.5 text-xs text-red-400">
                  {ytError}
                </div>
              )}

              {ytResult ? (
                <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Icon name="check" className="size-4" />
                    {ytResult.message}
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Video link:</span>
                    <a
                      href={ytResult.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-link underline"
                    >
                      {ytResult.url}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setYtResult(null)}
                    className="self-start rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
                  >
                    Upload another
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="yt-title"
                      className="text-xs font-medium text-muted"
                    >
                      Video Title
                    </label>
                    <input
                      id="yt-title"
                      type="text"
                      value={ytTitle}
                      onChange={(e) => setYtTitle(e.target.value)}
                      maxLength={100}
                      className="field text-xs"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="yt-desc"
                      className="text-xs font-medium text-muted"
                    >
                      Description
                    </label>
                    <textarea
                      id="yt-desc"
                      rows={3}
                      value={ytDescription}
                      onChange={(e) => setYtDescription(e.target.value)}
                      maxLength={5000}
                      className="field text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="yt-privacy"
                        className="text-xs font-medium text-muted"
                      >
                        Privacy
                      </label>
                      <select
                        id="yt-privacy"
                        value={ytPrivacy}
                        onChange={(e) =>
                          setYtPrivacy(
                            e.target.value as "unlisted" | "public" | "private",
                          )
                        }
                        className="field text-xs"
                      >
                        <option value="unlisted">Unlisted</option>
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="yt-tags"
                        className="text-xs font-medium text-muted"
                      >
                        Tags (comma separated)
                      </label>
                      <input
                        id="yt-tags"
                        type="text"
                        value={ytTags}
                        onChange={(e) => setYtTags(e.target.value)}
                        placeholder="ViPlay, tutorial"
                        className="field text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={ytBusy || !ytTitle.trim()}
                      className="btn bg-red-600 hover:bg-red-700 text-white font-medium text-xs px-4 py-2 flex items-center gap-1.5 shadow"
                    >
                      {ytBusy ? (
                        <>
                          <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Publishing…
                        </>
                      ) : (
                        <>
                          <Icon name="upload" className="size-3.5" />
                          Publish to YouTube
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
