import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssUrlFor, familyOf, fontCssOf, fontLabel, fontNeeds, fontStack, parseCatalog } from "@/lib/text/fonts";
import { emptyDoc } from "@/lib/edit/doc";
import { addElement, addText } from "@/lib/edit/docEdit";
import { textClipOf } from "@/lib/text/layout";

describe("fonts", () => {
  it("font ids: built in, Google, Brand Kit", () => {
    expect(familyOf("sans")).toBeNull();
    expect(familyOf("gf:Noto Sans Devanagari")).toBe("Noto Sans Devanagari");
    expect(familyOf("brand:0123456789ab")).toBe("VDO Brand 0123456789ab");
    expect(fontStack("gf:Poppins")).toMatch(/^"Poppins", ui-sans-serif/);
    expect(fontCssOf("gf:Mukta", 40, true, true)).toBe('italic 700 40px "Mukta", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    expect(fontLabel("gf:Mukta")).toBe("Mukta");
  });

  it("the stylesheet asks only for styles the family has (Google's API refuses others)", () => {
    expect(cssUrlFor("Lobster", { variants: ["400"] })).toBe("https://fonts.googleapis.com/css2?family=Lobster&display=swap");
    expect(cssUrlFor("Mukta", { variants: ["200", "300", "400", "500", "600", "700", "800"] })).toBe("https://fonts.googleapis.com/css2?family=Mukta:wght@400;700&display=swap");
    // no 400 / 700: the nearest ones
    expect(cssUrlFor("Thin Only", { variants: ["100", "300"] })).toBe("https://fonts.googleapis.com/css2?family=Thin+Only:wght@300&display=swap");
    expect(cssUrlFor("Poppins", { variants: ["400", "700", "400i", "700i"] })).toBe("https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,700;1,400;1,700&display=swap");
    expect(cssUrlFor("Unknown", null)).toBe("https://fonts.googleapis.com/css2?family=Unknown&display=swap");
  });

  it("the built library list has the Google families, Hindi ones among them", () => {
    const list = parseCatalog(JSON.parse(readFileSync("public/fonts/google-fonts.json", "utf8")));
    expect(list.length).toBeGreaterThan(1500);
    const hindi = list.filter((f) => f.subsets.includes("devanagari"));
    expect(hindi.length).toBeGreaterThan(40);
    expect(hindi.map((f) => f.family)).toEqual(expect.arrayContaining(["Mukta", "Hind", "Noto Sans Devanagari", "Tiro Devanagari Hindi"]));
    for (const f of list) expect(f.family).toMatch(/^[A-Za-z0-9 ]{1,64}$/);
  });

  it("a timeline's font needs: each face once, with the letters it draws", () => {
    let d = addText(emptyDoc(), { ...textClipOf("plain"), text: "नमस्ते दुनिया", style: { ...textClipOf("plain").style, font: "gf:Mukta" }, marks: [{ from: 0, to: 6, font: "gf:Rozha One" }] }, 0).doc;
    d = addElement(d, { type: "element", el: { kind: "badge", aspect: 3, fill: "#ff0000", stroke: "none", strokeWidth: 0, text: "LIVE", font: "brand:0123456789ab" }, duration: 3, transform: { fit: "fit", x: 0, y: 0, scale: 1 }, anim: { in: "none", out: "none" }, fadeIn: 0, fadeOut: 0 }, 0).doc;
    const needs = fontNeeds(d);
    expect(needs.map((n) => n.font).sort()).toEqual(["brand:0123456789ab", "gf:Mukta", "gf:Rozha One"]);
    expect(needs.find((n) => n.font === "gf:Rozha One")!.text).toBe([...new Set([..."नमस्ते"])].join(""));
  });
});
