"use client";

import { Icon } from "@/components/ui/Icon";
import { Tip } from "@/components/ui/Tip";
import { openAiSettings, useGemini, type GeminiUi } from "@/lib/editor/useGemini";

const LOOK: Record<GeminiUi, { dot: string; text: string }> = {
  ready: { dot: "bg-success", text: "Gemini is ready" },
  fake: { dot: "bg-link", text: "Gemini test mode (no real calls)" },
  "no-key": { dot: "bg-warn-line", text: "No Gemini key: add one to use the AI tools" },
  off: { dot: "bg-muted", text: "AI is switched off" },
  loading: { dot: "bg-muted animate-pulse", text: "Checking AI…" },
};

/**
 * Top bar: is Gemini set up? A dot (green ready, amber no key…); a click opens
 * API keys. Only the state is known here, never the key.
 */
export function AiStatus({ className }: { className: string }) {
  const g = useGemini();
  const l = LOOK[g];
  return (
    <Tip
      side="bottom"
      text={
        <>
          {l.text}
          <span className="block text-muted">Click for API keys</span>
        </>
      }
    >
      <button type="button" className={`relative ${className}`} onClick={openAiSettings} aria-label={`AI: ${l.text}. Open API keys`} data-testid="gemini-status" data-state={g}>
        <Icon name="ai" className="size-5" />
        <span aria-hidden="true" className={`absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-surface ${l.dot}`} />
      </button>
    </Tip>
  );
}
