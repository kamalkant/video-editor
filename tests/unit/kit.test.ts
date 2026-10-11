import { describe, expect, it } from "vitest";
import { fontFormat } from "@/lib/brand";
import { docSchema, sanitizeDoc } from "@/lib/edit/doc";
import { STARTER, starterArgs } from "@/lib/library";
import { TEMPLATES } from "@/lib/templates";
import { STUDIO_SETS } from "@/lib/backdrops";

describe("Brand Kit fonts", () => {
  it("knows a font by its first bytes, not its name", () => {
    const b = (head: number[] | string) => Buffer.concat([typeof head === "string" ? Buffer.from(head, "latin1") : Buffer.from(head), Buffer.alloc(16)]);
    expect(fontFormat(b([0, 1, 0, 0]))).toBe("truetype");
    expect(fontFormat(b("OTTO"))).toBe("opentype");
    expect(fontFormat(b("wOFF"))).toBe("woff");
    expect(fontFormat(b("wOF2"))).toBe("woff2");
    expect(fontFormat(b("<svg"))).toBeNull();
    expect(fontFormat(Buffer.from("x"))).toBeNull();
  });
});

describe("templates", () => {
  it("every template is a valid project with a backdrop and text", () => {
    for (const t of TEMPLATES) {
      const d = t.build();
      expect(docSchema.safeParse(d).success, t.id).toBe(true);
      expect(d.canvas.backdrop, t.id).toBeTruthy();
      if (d.canvas.backdrop?.kind === "set") expect(STUDIO_SETS.some((s) => s.id === (d.canvas.backdrop as { id: string }).id), t.id).toBe(true);
      expect(d.tracks.some((tr) => tr.clips.some((c) => c.type === "text")), t.id).toBe(true);
    }
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });
  it("saving a template's project keeps everything in it (texts, elements, blank scenes)", () => {
    for (const t of TEMPLATES) {
      const d = t.build();
      const count = (x: typeof d) => x.tracks.reduce((n, tr) => n + tr.clips.length, 0);
      const back = sanitizeDoc(docSchema.parse(JSON.parse(JSON.stringify(d))), () => null);
      expect(count(back), t.id).toBe(count(d));
      expect(d.tracks.length, t.id).toBeLessThanOrEqual(24);
    }
  });
  it("has News, YouTube, Social and Business groups, with new ones in each", () => {
    const by = (c: string) => TEMPLATES.filter((t) => t.category === c).length;
    expect(by("News")).toBeGreaterThanOrEqual(5);
    expect(by("YouTube")).toBeGreaterThanOrEqual(5);
    expect(by("Social Media")).toBeGreaterThanOrEqual(5);
    expect(by("Business")).toBeGreaterThanOrEqual(4);
    // some start with blank scenes and use elements
    expect(TEMPLATES.some((t) => t.build().tracks.some((tr) => tr.clips.some((c) => c.type === "blank")))).toBe(true);
    expect(TEMPLATES.some((t) => t.build().tracks.some((tr) => tr.clips.some((c) => c.type === "element")))).toBe(true);
  });
});

describe("music library starter set", () => {
  it("has music and sound effects, each made from a recipe (no files downloaded)", () => {
    expect(STARTER.filter((r) => r.kind === "music").length).toBeGreaterThanOrEqual(5);
    expect(STARTER.filter((r) => r.kind === "sfx").length).toBeGreaterThanOrEqual(8);
    for (const r of STARTER) {
      const a = starterArgs(r, "out.m4a");
      expect(a[0]).toBe("-f");
      expect(a[1]).toBe("lavfi");
      expect(a.join(" ")).not.toMatch(/https?:/);
    }
  });
});
