"use client";

import { Icon } from "@/components/ui/Icon";
import { setTheme, THEMES, useTheme } from "@/lib/editor/theme";

/** Top bar: one icon that steps through the themes, Dark → Light → Match my computer. */
export function ThemeMenu({ className }: { className: string }) {
  const theme = useTheme();
  const i = Math.max(0, THEMES.findIndex((t) => t.id === theme));
  const cur = THEMES[i];
  const next = THEMES[(i + 1) % THEMES.length];
  return (
    <button type="button" className={className} onClick={() => setTheme(next.id)} aria-label={`Theme: ${cur.label}. Click for ${next.label}`} title={`Theme: ${cur.label} (click for ${next.label})`} data-testid="theme-cycle">
      <Icon name={cur.icon} className="size-5" />
    </button>
  );
}
