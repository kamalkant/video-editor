/**
 * Whether the editor's preview draws a frame now: while it plays, and for a moment after something changed
 * (`awakeUntil`). Never while an export made in this browser runs (`suspended`): the export needs the computer,
 * and every progress update re-rendered the editor, which kept the preview drawing 60 times a second.
 */
export function previewDraws(o: { playing: boolean; now: number; awakeUntil: number; suspended: boolean }): boolean {
  if (o.suspended) return false;
  return o.playing || o.now <= o.awakeUntil;
}
