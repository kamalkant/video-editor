import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The editor's look comes from the tokens in app/globals.css (docs/design/editor-audit.md). */
const root = join(__dirname, "../..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const sources = ["components", "app"].flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tsx") && !f.includes("website"))
    .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(root, dir, f), "utf8") })),
);

describe("design tokens", () => {
  it("UI text uses the type scale (text-2xs is 11px), not one-off sizes of 9–12px", () => {
    const bad = sources.filter((s) => /text-\[(?:0\.5625rem|0\.625rem|0\.6875rem|0\.75rem|9px|10px|11px|12px)\]/.test(s.text)).map((s) => s.file);
    expect(bad).toEqual([]);
  });

  it("every theme colour a component names is defined", () => {
    const names = new Set<string>();
    for (const s of sources)
      for (const m of s.text.matchAll(/(?<![\w-])(?:bg|text|border|ring)-(surface-raised|ink-muted|muted-strong|ai|ai-soft|overlay|primary-soft|dialog-[a-z-]+)(?![\w-])/g)) names.add(m[1]);
    const missing = [...names].filter((n) => !new RegExp(`--color-${n}:`).test(css));
    expect(missing).toEqual([]);
  });
});
