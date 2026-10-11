/** The preview's sound: on by default; the user's mute choice is remembered in this browser. */
const KEY = "VDO:v1:previewMuted";

export function readPreviewMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writePreviewMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* private window */
  }
}
