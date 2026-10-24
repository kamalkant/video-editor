import { apiError } from "@/lib/http/errors";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import type { SafeUser } from "@/lib/db/schema";
import { getVideo, type VideoMeta } from "@/lib/videos";
import { getCurrentUser } from "./session";

/**
 * Who may use an uploaded file (its picture, sound, frames, working copies): the person who uploaded it, and
 * staff. viplay.in served every file to anyone who had its id, and started FFmpeg work for strangers.
 * A file from before files had owners (no `userId`), or one made on a local install ("local"), is open to
 * anyone signed in.
 */
export function canUseMedia(user: SafeUser, video: Pick<VideoMeta, "userId">): boolean {
  if (user.role === "admin" || user.role === "super_admin") return true;
  return !video.userId || video.userId === "local" || video.userId === user.id;
}

/**
 * The signed-in user and their file, or the response to return (401 signed out, 404 when the file is gone or
 * someone else's: an id of another person's file says nothing about it).
 *
 *   const r = await requireMedia(id); if (r instanceof Response) return r;
 */
export async function requireMedia(id: string, o: { heavy?: boolean } = {}): Promise<{ user: SafeUser; video: VideoMeta } | Response> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const video = await getVideo(id);
  if (!video || !canUseMedia(user, video)) return apiError(404, "not_found", "This file is no longer here.");
  // work that keeps FFmpeg busy (working copies, analysis): a fair share per person
  if (o.heavy && user.role !== "super_admin") {
    const r = checkRateLimit(`media-heavy:${user.id}`, 60, 60_000);
    if (!r.allowed) return apiError(429, "too_many", `Too many requests. Try again in ${r.retryAfterSeconds} s.`);
  }
  return { user, video };
}

/** The same check for a file id inside a request body (AI tools): null when it's fine, else the response. */
export async function mediaDenied(id: unknown): Promise<Response | null> {
  if (typeof id !== "string") return null;
  const r = await requireMedia(id);
  return r instanceof Response ? r : null;
}
