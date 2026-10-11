"use client";

import { useState } from "react";

/** Copies text; on plain-http LAN pages (no clipboard API) it selects the target instead. */
export function CopyButton({ text, label = "Copy", targetId }: { text: string; label?: string; targetId?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      const el = targetId ? document.getElementById(targetId) : null;
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      setState("manual");
    }
    setTimeout(() => setState("idle"), 3000);
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn btn-primary" onClick={copy}>
        {label}
      </button>
      <span role="status" className="text-sm text-muted">
        {state === "copied" ? "Copied ✓" : state === "manual" ? "Selected — press ⌘C to copy" : ""}
      </span>
    </span>
  );
}
