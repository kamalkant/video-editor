"use client";

import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { openAiSettings, useGemini } from "@/lib/editor/useGemini";

/** The mark on every feature that uses Google Gemini (the only ones that go online). */
export function GeminiBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded bg-primary-soft px-1.5 py-px text-[0.625rem] font-semibold text-link ${className}`} title="Uses Google Gemini (online)">
      <Icon name="ai" className="size-3" />
      Gemini
    </span>
  );
}

/** "Sends … to Google Gemini · costs …" under a Gemini button, so nothing is sent or paid by surprise. */
export function GeminiNote({ sends, cost, extra }: { sends: string; cost: string; extra?: string }) {
  return (
    <p className="text-[0.6875rem] leading-snug text-muted" data-testid="gemini-note">
      Sends {sends} to Google Gemini · {cost} on your Google account{extra ? ` · ${extra}` : ""}.
    </p>
  );
}

/** Shown instead of a Gemini feature while it has no key, or is switched off in AI settings. */
export function GeminiKeyCard() {
  const g = useGemini();
  const off = g === "off";
  return (
    <div data-testid="gemini-key-card">
      <Notice tone="info" title={off ? "Gemini is switched off" : "Add your Gemini key"}>
        <p className="mt-1 text-xs">{off ? "Switch it on again in AI Tools → Settings to use this." : "Paste your Google Gemini API key in AI Tools → Settings. It stays on this computer; only what you send with a Gemini button goes to Google."}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary min-h-0 px-3 py-1.5 text-xs" onClick={openAiSettings}>
            <Icon name="settings" className="size-3.5" /> Open AI settings
          </button>
          {!off && (
            <a className="text-xs text-link underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Get a free key
            </a>
          )}
        </div>
      </Notice>
    </div>
  );
}
