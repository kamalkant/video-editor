"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * What this server can do that depends on its machine (GET /api/health, lib/ffmpeg/capabilities).
 * A Mac runs everything; a Linux host (viplay.in on Hostinger) has no Apple encoders, Vision or voices.
 * Until the server answers, everything counts as available (nothing flickers off on a Mac).
 */
export type ServerCaps = { safariAlpha: boolean; aiRemoval: boolean; macVoices: boolean };

const ALL: ServerCaps = { safariAlpha: true, aiRemoval: true, macVoices: true };
let caps: ServerCaps = ALL;
let asked = false;
const listeners = new Set<() => void>();

function ask() {
  asked = true;
  fetch("/api/health")
    .then((r) => r.json())
    .then((j) => {
      caps = { safariAlpha: j?.safariAlpha !== false, aiRemoval: j?.aiRemoval !== false, macVoices: j?.macVoices !== false };
      listeners.forEach((l) => l());
    })
    .catch(() => undefined);
}

export function useServerCaps(): ServerCaps {
  const c = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => caps,
    () => ALL,
  );
  useEffect(() => {
    if (!asked) ask();
  }, []);
  return c;
}
