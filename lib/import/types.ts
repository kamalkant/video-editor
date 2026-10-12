/** The Import dialog's libraries and what a search result looks like (pure: the dialog and the server share it). */

export type ImportSource = "pexels" | "pixabay";
export const IMPORT_SOURCES: ImportSource[] = ["pexels", "pixabay"];
export const isImportSource = (v: unknown): v is ImportSource => IMPORT_SOURCES.includes(v as ImportSource);
export const SOURCE_NAME: Record<ImportSource, string> = { pexels: "Pexels", pixabay: "Pixabay" };

/** "free": a stock library's own licence (free to use). ("cc" / "youtube": credits of older YouTube imports.) */
export type ImportLicense = "free" | "cc" | "youtube";

export type ImportItem = {
  source: ImportSource;
  id: string;
  title: string;
  /** Our own proxy URL for the thumbnail (the browser never talks to the library directly). */
  thumb: string;
  videoUrl?: string;
  duration: number;
  width: number;
  height: number;
  author: string;
  authorUrl: string | null;
  pageUrl: string;
  license: ImportLicense;
};

export type SearchPage = { items: ImportItem[]; next: string | null };

/** "Wide" / "Tall" / "Any" in the dialog. */
export type Shape = "any" | "landscape" | "portrait";

/** What a finished import remembers, for the credit line in My Assets. */
export type Credit = { source: ImportSource | "youtube"; author: string; url: string; license: ImportLicense };
