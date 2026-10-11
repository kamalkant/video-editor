/**
 * Native File System Access & Location Picker
 *
 * Allows users to choose the exact destination on their Mac (Desktop, Documents,
 * External SSD, USB drive) using the native macOS Finder Save As dialog.
 * Gracefully falls back to browser download if the API is unsupported.
 */

export type SaveFileOptions = {
  description?: string;
  accept?: Record<string, string[]>;
};

export type SaveResult = {
  saved: boolean;
  method: "picker" | "download" | "cancelled";
  fileName?: string;
  error?: string;
};

/**
 * Prompts the user with a native macOS/OS Save As dialog to choose the exact
 * save directory and filename on their device storage.
 */
export async function saveFileWithPicker(
  blob: Blob,
  suggestedName: string,
  options?: SaveFileOptions,
): Promise<SaveResult> {
  // 1. Try modern File System Access API (Chrome, Edge, Opera, Desktop Safari 15.2+)
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const extMatch = suggestedName.match(/\.[a-zA-Z0-9]+$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".vdo";

      const defaultAccept: Record<string, string[]> =
        ext === ".vdo"
          ? { "application/x-vdo": [".vdo"] }
          : ext === ".mp4"
          ? { "video/mp4": [".mp4"] }
          : ext === ".webm"
          ? { "video/webm": [".webm"] }
          : { "application/octet-stream": [ext] };

      const pickerOpts: any = {
        suggestedName,
        types: [
          {
            description: options?.description || "Project File",
            accept: options?.accept || defaultAccept,
          },
        ],
      };

      const handle = await (window as any).showSaveFilePicker(pickerOpts);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      return {
        saved: true,
        method: "picker",
        fileName: handle.name || suggestedName,
      };
    } catch (err: any) {
      // User clicked "Cancel" on the native Save dialog
      if (err?.name === "AbortError") {
        return {
          saved: false,
          method: "cancelled",
        };
      }
      // If permission denied or other picker error, fall through to download fallback
      console.warn("Native file picker failed, falling back to download", err);
    }
  }

  // 2. Standard Browser Download Fallback
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return {
      saved: true,
      method: "download",
      fileName: suggestedName,
    };
  } catch (err: any) {
    return {
      saved: false,
      method: "download",
      error: err?.message || "Failed to download file",
    };
  }
}
