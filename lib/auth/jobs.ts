import { apiError } from "@/lib/http/errors";
import { getJob, type Job } from "@/lib/jobs/queue";
import { getCurrentUser } from "./session";

/**
 * An export job for its owner (and staff): its status, its timeline, cancelling and deleting it. A job from
 * before jobs had owners is open to anyone signed in (it's gone a day later anyway). Its finished files stay
 * public at /api/files/<job>/<name>: the website embed codes link to them.
 */
export async function requireJob(id: string): Promise<Job | Response> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const job = await getJob(id);
  const staff = user.role === "admin" || user.role === "super_admin";
  if (!job || (job.userId && job.userId !== user.id && !staff)) return apiError(404, "not_found", "This job is no longer here.");
  return job;
}
