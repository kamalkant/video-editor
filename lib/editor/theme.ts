"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeScript";

/**
 * The editor theme: dark (default), light, or the Mac's setting. Kept in this
 * browser only; app/layout.tsx applies it before the first paint (no flash).
 */
export type Theme = "dark" | "light" | "system";
export const THEMES: { id: Theme; label: string; icon: "moon" | "sun" | "monitor" }[] = [
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "system", label: "Match my computer", icon: "monitor" },
];

export const THEME_COLOR_DARK = "#111a2e";
export const THEME_COLOR_LIGHT = "#ffffff";

const isTheme = (v: unknown): v is Theme => v === "dark" || v === "light" || v === "system";
const listeners = new Set<() => void>();

function current(): Theme {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : "dark";
}

export function getThemeColor(t: Theme = current()): string {
  if (t === "light") return THEME_COLOR_LIGHT;
  if (t === "dark") return THEME_COLOR_DARK;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return THEME_COLOR_LIGHT;
  }
  return THEME_COLOR_DARK;
}

export function updateThemeColorMeta(t: Theme = current()) {
  if (typeof document === "undefined") return;
  const color = getThemeColor(t);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length > 0) {
    metas.forEach((m) => {
      m.removeAttribute("media");
      m.setAttribute("content", color);
    });
  } else {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
  }
}

export function setTheme(t: Theme) {
  if (t === "dark") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === "dark") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    // private window or blocked storage: the theme still changes for this visit
  }
  updateThemeColorMeta(t);
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  updateThemeColorMeta(current());
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener?.("change", () => {
      if (current() === "system") {
        updateThemeColorMeta("system");
        listeners.forEach((l) => l());
      }
    });
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    () => "dark",
  );
}

const prefersLight = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches;

/** The theme actually showing: "system" resolved to the computer's light or dark (the website's look). */
export function useResolvedTheme(): "dark" | "light" {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      const t = current();
      return t === "system" ? (prefersLight() ? "light" : "dark") : t;
    },
    () => "dark",
  );
}
