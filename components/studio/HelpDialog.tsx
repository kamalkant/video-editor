"use client";

import { Dialog } from "@/components/ui/Dialog";
import { isMac } from "@/lib/editor/platform";

/** Help: how ViPlay Studio works and every keyboard shortcut. */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mod = isMac() ? "⌘" : "Ctrl";
  const rows: [React.ReactNode, string][] = [
    [<><kbd>{mod}</kbd> <kbd>K</kbd></>, "Search tools: type what you want to do (split, brand, export, a project…) and press Enter"],
    [<><kbd>{mod}</kbd> <kbd>S</kbd></>, "Save now (the project also saves itself after every change)"],
    [<><kbd>F</kbd></>, "Focus mode: hide the side panels for a big preview (F or Esc brings them back)"],
    [<><kbd>{mod}</kbd> <kbd>Z</kbd></>, "Undo"],
    [<><kbd>{mod}</kbd> <kbd>Shift</kbd> <kbd>Z</kbd></>, "Redo"],
    [<><kbd>Space</kbd></>, "Play / pause"],
    [<><kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd></>, "Back 1 second · pause · play"],
    [<><kbd>←</kbd> <kbd>→</kbd></>, "One frame back / forward (with Shift: 1 second)"],
    [<><kbd>Home</kbd> <kbd>End</kbd></>, "Go to the start / end"],
    [<><kbd>S</kbd></>, "Split the clip at the playhead"],
    [<><kbd>Delete</kbd></>, "Delete the selected clip (on Video 1 the rest joins up)"],
    [<><kbd>Q</kbd> <kbd>W</kbd></>, "Trim the start / end of the clip to the playhead"],
    [<><kbd>{mod}</kbd> <kbd>D</kbd></>, "Duplicate the selected clip"],
    [<><kbd>{mod}</kbd> <kbd>C</kbd> · <kbd>{mod}</kbd> <kbd>X</kbd> · <kbd>{mod}</kbd> <kbd>V</kbd></>, "Copy / cut the selected clip; paste it at the playhead (also in another project)"],
    [<>on the preview: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd> <kbd>+</kbd> <kbd>−</kbd></>, "Move / resize the selected text or picture (with Shift: bigger steps; hold Alt while dragging to turn off snapping)"],
    [<>on the preview: <kbd>[</kbd> <kbd>]</kbd></>, "Turn the selected picture, video or element 1° (with Shift: 15°)"],
    [<>drag just outside a corner</>, "Turn the selected picture, video or element (snaps to 90°; Shift: 15° steps; Alt: free)"],
    [<>a corner dot · <kbd>Shift</kbd> · <kbd>Alt</kbd></>, "Resize keeping the shape (the opposite corner stays) · Shift: free width and height · Alt: from the middle"],
    [<>a side bar</>, "Stretch only the width or the height (the opposite side stays)"],
    [<>Transform · Skew · Perspective</>, "The preview's top row: Skew slants it from a side bar; Perspective moves each corner on its own; Reset shape; Esc: back to Transform"],
    [<>the middle dot · the inner corner dot</>, "Move the pivot (it turns and sizes around it; double-click: back to the middle) · round the corners"],
    [<>drag the middle of a side</>, "Stretch the selected element (a box, line, arrow, bar): the other side stays put (Alt: from the middle)"],
    [<>timeline: <kbd>+</kbd> after the last clip</>, "A blank scene at the end of Video 1: drag it anywhere on Video 1 (or right-click a clip: Add blank before / after). Text and elements added on it start with it and last 3 s"],
    [<>Elements: <kbd>Ctrl</kbd> <kbd>⌘</kbd> <kbd>Space</kbd></>, "Every emoji (in the “Any emoji” box, or an emoji element's box)"],
    [<>◆ Keyframe (timeline tools or the Basic tab)</>, "Save the clip's place, size, angle and opacity at the playhead; with two or more it glides between them. With keyframes, a change at another moment adds one there"],
    [<>◆ on a clip in the timeline</>, "Click: go to that keyframe · drag: move it in time · right-click: remove it"],
    [<><kbd>{mod}</kbd> + scroll on the preview</>, "Zoom the preview in / out (the − Fit + buttons do the same; click the size for a list: 25% to 400%)"],
    [<>click around the picture</>, "Select nothing (shows the Project settings)"],
    [<>hold <kbd>\</kbd></>, "Compare with the original video"],
    [<><kbd>Esc</kbd></>, "Stop picking a color · close a dialog or menu"],
    [<><kbd>?</kbd></>, "Open this help"],
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Help & keyboard shortcuts">
      <div className="flex flex-col gap-5">
        <section aria-labelledby="help-how">
          <h3 id="help-how" className="mb-2 font-semibold">
            How it works
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              <strong>Add media</strong>: videos, pictures and music from this computer, or <strong>Import</strong> free stock videos from Pexels and Pixabay. Videos line up on Video 1; pictures and sound go at the playhead.
            </li>
            <li>
              <strong>Record</strong>: your camera, your screen, both at once, or a voiceover (Record button, or Media).
            </li>
            <li>
              <strong>AI Tools</strong>: remove or blur a background, clean noisy sound, cut silences, text to speech.
            </li>
            <li>
              <strong>Mask, Effects, Transitions</strong>: the Mask tool on the timeline (circle, rounded, camera bubble); looks and vignette in Effects; transitions between clips in Transitions.
            </li>
            <li>
              <strong>Add text</strong>: titles, lower thirds, a breaking-news bar or captions (Text). Type on the right, drag it on the preview.
            </li>
            <li>
              <strong>Remove a background</strong> (green or blue screen, or black): select the video clip; the editor finds the color. If it didn&apos;t, click the background in the preview.
            </li>
            <li>
              <strong>Export</strong>: MP4 is recommended (plays everywhere). Also HEVC, AV1, WebM, ProRes, GIF, a PNG or JPG of the frame, MP3, M4A or WAV. On a transparent project: see-through WebM (VP9 + alpha), MOV (HEVC + alpha), the website pack or ProRes 4444.
            </li>
          </ol>
        </section>
        <section aria-labelledby="help-keys">
          <h3 id="help-keys" className="mb-2 font-semibold">
            Keyboard shortcuts
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([k, what], i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="whitespace-nowrap py-2 pr-4">{k}</td>
                  <td className="py-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section aria-labelledby="help-files">
          <h3 id="help-files" className="mb-2 font-semibold">
            Your work and files
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Projects save automatically. Open them again from Projects.</li>
            <li>Everything stays on this computer. The only exception: features marked Gemini (subtitles, generated pictures, voices and videos) send what you asked for to Google, and only when you click them. Each button says what it sends and what it costs. Add, switch off or remove your API keys in AI Tools → Settings.</li>
            <li>Videos not used in a project are removed after 24 hours.</li>
          </ul>
        </section>
        <section aria-labelledby="help-plan">
          <h3 id="help-plan" className="mb-2 font-semibold">
            What&apos;s coming
          </h3>
          <p className="text-sm">
            Tools marked <span className="soon">Soon</span> are planned.{" "}
            <a href="/roadmap" target="_blank" rel="noreferrer" className="text-link underline">
              See the whole plan
            </a>{" "}
            (a page you can share).
          </p>
        </section>
      </div>
    </Dialog>
  );
}
