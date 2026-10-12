"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/ui/Icon";

export function ShareDialog({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  projectId: string;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
              Share
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

        {/* Body */}
        <div className="p-5 max-h-[75vh] overflow-y-auto">
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
        </div>
      </div>
    </div>
  );
}
