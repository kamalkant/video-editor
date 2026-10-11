"use client";

import { useSyncExternalStore } from "react";

/** A Mac (or iPhone / iPad): shortcuts use ⌘ there, Ctrl elsewhere. */
export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const noop = () => () => {};
/** "⌘" or "Ctrl" (the server draws "Ctrl"; the page switches once it knows). */
export const useModKey = () => useSyncExternalStore(noop, () => (isMac() ? "⌘" : "Ctrl"), () => "Ctrl");
