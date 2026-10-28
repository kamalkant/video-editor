// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keepsOwnUndo } from "@/lib/editor/keys";

/**
 * ⌘Z / Ctrl+Z while typing undoes the typing (the browser's own undo), never a timeline edit behind it: an
 * AI prompt, a caption, the text box. Elsewhere (a slider, a button, the timeline) it undoes the timeline.
 */
describe("keepsOwnUndo", () => {
  const el = (html: string) => {
    document.body.innerHTML = html;
    return document.body.querySelector("[data-t]")!;
  };

  it("is true where words are typed", () => {
    expect(keepsOwnUndo(el(`<textarea data-t></textarea>`))).toBe(true);
    for (const type of ["text", "search", "number", "email", "url", "tel", "password"]) expect(keepsOwnUndo(el(`<input data-t type="${type}">`))).toBe(true);
    expect(keepsOwnUndo(el(`<input data-t>`))).toBe(true);
    expect(keepsOwnUndo(el(`<div contenteditable="true"><span data-t>word</span></div>`))).toBe(true);
    expect(keepsOwnUndo(el(`<div data-t contenteditable></div>`))).toBe(true);
  });

  it("is false for controls that don't hold typed words, and outside fields", () => {
    for (const type of ["range", "checkbox", "radio", "color", "button", "file"]) expect(keepsOwnUndo(el(`<input data-t type="${type}">`))).toBe(false);
    expect(keepsOwnUndo(el(`<button data-t>Split</button>`))).toBe(false);
    expect(keepsOwnUndo(el(`<div contenteditable="false"><span data-t>x</span></div>`))).toBe(false);
    expect(keepsOwnUndo(el(`<input data-t type="text" readonly>`))).toBe(false);
    expect(keepsOwnUndo(document.body)).toBe(false);
    expect(keepsOwnUndo(null)).toBe(false);
  });
});
