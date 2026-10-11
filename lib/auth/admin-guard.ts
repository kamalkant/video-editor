import type { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin, isSuperAdmin } from "@/lib/auth/permissions";
import type { SafeUser } from "@/lib/db/schema";

/**
 * Admin API error. Carries both shapes the admin pages read: the legacy `{ ok, message }`
 * and the uniform `{ error: { code, message } }` from lib/http/errors.
 */
export function adminError(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, message, error: { code, message } }, { status });
}

// (the seeded admin's password is public: nothing in admin works until it's replaced)
const mustChange = () => adminError(403, "password_change_required", "Change your password first (Admin → the password form).");

export type Guarded = { user: SafeUser; denied?: undefined } | { user?: undefined; denied: Response };

/** Signed-in admin or super admin; otherwise a 401/403 response to return as-is. */
export async function requireAdmin(): Promise<Guarded> {
  const user = await getCurrentUser();
  if (!user) return { denied: adminError(401, "unauthorized", "Sign in required.") };
  if (!isAdmin(user)) return { denied: adminError(403, "forbidden", "Administrator access required.") };
  if (user.must_change_password) return { denied: mustChange() };
  return { user };
}

/** Signed-in super admin; otherwise a 401/403 response to return as-is. */
export async function requireSuperAdmin(): Promise<Guarded> {
  const user = await getCurrentUser();
  if (!user) return { denied: adminError(401, "unauthorized", "Sign in required.") };
  if (!isSuperAdmin(user)) return { denied: adminError(403, "forbidden", "Super Admin access required.") };
  if (user.must_change_password) return { denied: mustChange() };
  return { user };
}

/** Parses the JSON body against a schema; a 400 response names the first bad field. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T>; invalid?: undefined } | { data?: undefined; invalid: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { invalid: adminError(400, "bad_request", "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { invalid: adminError(400, "bad_request", `${field}${issue?.message ?? "Invalid request."}`) };
  }
  return { data: parsed.data };
}

/** limit/offset from the query string, clamped to sane bounds (NaN falls back to defaults). */
export function pageParams(searchParams: URLSearchParams, defaultLimit = 50, maxLimit = 100) {
  const limit = Number(searchParams.get("limit"));
  const offset = Number(searchParams.get("offset"));
  return {
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(Math.floor(limit), maxLimit) : defaultLimit,
    offset: Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0,
  };
}
