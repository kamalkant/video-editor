"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Is Gemini set up on this editor? ("loading" until the server answers; "off": switched off in AI settings.) */
export type GeminiUi = "loading" | "ready" | "no-key" | "off" | "fake";

let state: GeminiUi = "loading";
let asked = false;
const listeners = new Set<() => void>();
const set = (s: GeminiUi) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Ask the server again (after a key is saved, removed or switched). */
export function refreshGemini() {
  asked = true;
  return fetch("/api/ai/status", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) =>
      set(
        ["ready", "fake", "off", "no-key"].includes(j?.gemini)
          ? j.gemini
          : "no-key",
      ),
    )
    .catch(() => set("no-key"));
}

export function useGemini(): GeminiUi {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => "loading" as GeminiUi,
  );
  useEffect(() => {
    if (!asked) void refreshGemini();
  }, []);
  return s;
}

/** Open AI Tools → Settings from anywhere (the studio listens). */
export const openAiSettings = () =>
  window.dispatchEvent(new Event("VDO:ai-settings"));

/** A POST to a Gemini route: the JSON answer, or an Error with the server's plain message. */
export async function geminiPost<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok)
    throw new Error(j?.error?.message ?? "Gemini didn't answer. Try again.");
  return j as T;
}
