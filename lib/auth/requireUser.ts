import { apiError } from "@/lib/http/errors";
import type { SafeUser } from "@/lib/db/schema";
import { getCurrentUser } from "./session";

/**
 * The signed-in user, or the 401 to return. For routes that store files on the server or start heavy
 * work (uploads, imports, renders): anyone could otherwise fill the disk or put files on the website.
 *
 *   const user = await requireUser(); if (user instanceof Response) return user;
 */
export async function requireUser(message = "Sign in first."): Promise<SafeUser | Response> {
  const user = await getCurrentUser();
  return user ?? apiError(401, "unauthorized", message);
}
