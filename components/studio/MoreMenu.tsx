"use client";

import { ContextMenu, useMenuButton, type MenuItem } from "@/components/ui/ContextMenu";
import { Icon } from "@/components/ui/Icon";
import { setTheme, THEMES, useTheme } from "@/lib/editor/theme";
import { openAiSettings, useGemini, type GeminiUi } from "@/lib/editor/useGemini";

const AI_TEXT: Record<GeminiUi, string> = {
  ready: "Gemini is ready",
  fake: "Gemini test mode",
  "no-key": "No Gemini key yet",
  off: "AI is switched off",
  loading: "Checking AI…",
};

/**
 * ⋯ in the top bar: what isn't needed all the time (versions, focus mode, 720p proxies, API keys, help).
 * Phones and tablets also get Search tools, Add media and the theme here, where there's no room for them.
 */
export function MoreMenu(p: {
  className: string;
  onSearch: () => void;
  onAddMedia: (() => void) | null;
  onVersions: (() => void) | null;
  onHelp: () => void;
  /** focus mode (null: not on this screen) */
  focus?: boolean | null;
  onFocus?: () => void;
  /** 720p proxies while editing (null: not offered) */
  proxyMode?: boolean | null;
  onToggleProxy?: () => void;
}) {
  const { at, close, buttonProps } = useMenuButton();
  const theme = useTheme();
  const gemini = useGemini();
  const items: MenuItem[] = [
    { label: "Search tools", detail: "Type what you want to do", onSelect: p.onSearch },
    { label: "Add media", disabled: !p.onAddMedia, onSelect: () => p.onAddMedia?.() },
    { label: "Versions…", detail: "Save a copy to come back to", disabled: !p.onVersions, onSelect: () => p.onVersions?.() },
    "separator",
    ...(p.focus != null && p.onFocus ? [{ label: "Focus mode", detail: "Hide the side panels (F)", checked: p.focus, onSelect: p.onFocus } satisfies MenuItem] : []),
    ...(p.proxyMode != null && p.onToggleProxy
      ? [{ label: "Fast 720p editing", detail: "Smoother playback; exports stay full quality", checked: p.proxyMode, onSelect: p.onToggleProxy } satisfies MenuItem]
      : []),
    { label: "API keys", detail: AI_TEXT[gemini], onSelect: openAiSettings },
    { label: "Help & keyboard shortcuts", onSelect: p.onHelp },
    "separator",
    { heading: "Theme" },
    ...THEMES.map((t): MenuItem => ({ label: t.label, checked: theme === t.id, onSelect: () => setTheme(t.id) })),
  ];
  return (
    <>
      <button type="button" aria-label="More" {...buttonProps} className={`${p.className} ${at ? "bg-raised text-ink" : ""}`}>
        <Icon name="more" className="size-5" strokeWidth={3.25} />
      </button>
      {at && <ContextMenu x={at.x} y={at.y} width={240} items={items} label="More" onClose={close} />}
    </>
  );
}
