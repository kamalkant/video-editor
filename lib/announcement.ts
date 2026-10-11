import "server-only";
import { createHash } from "node:crypto";
import { getAdminSetting } from "./db/admin-settings";

export const ANNOUNCEMENT_TONES = ["info", "warning"] as const;
export type Announcement = { id: string; message: string; tone: (typeof ANNOUNCEMENT_TONES)[number] };

/**
 * The note admins show at the top of the editor (Admin → Settings → Editor announcement), or null.
 * `id` changes with the text, so a note someone closed comes back when it's edited.
 */
export function getAnnouncement(): Announcement | null {
  const message = getAdminSetting("announcement_message", "").trim();
  if (!message) return null;
  const tone = getAdminSetting("announcement_tone", "info") === "warning" ? "warning" : "info";
  const id = createHash("sha256").update(`${tone}:${message}`).digest("hex").slice(0, 12);
  return { id, message, tone };
}
