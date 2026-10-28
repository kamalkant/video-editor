/** Input types that don't hold typed words (⌘Z there is the timeline's). */
const NOT_TYPED = new Set(["range", "checkbox", "radio", "color", "button", "submit", "reset", "file", "image", "hidden"]);

/**
 * Does ⌘Z / Ctrl+Z at this element undo its own typing (the browser's undo), not the timeline? Text boxes,
 * text areas and rich text (contenteditable); sliders, buttons and the rest of the page undo the timeline.
 */
export function keepsOwnUndo(t: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(t instanceof Element)) return false;
  if (t instanceof HTMLTextAreaElement) return !t.readOnly;
  if (t instanceof HTMLInputElement) return !t.readOnly && !NOT_TYPED.has(t.type);
  // (the nearest contenteditable decides: "false" switches it off inside an editable area)
  const editable = t.closest("[contenteditable]");
  return !!editable && editable.getAttribute("contenteditable") !== "false";
}
