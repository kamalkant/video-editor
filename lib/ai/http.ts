import "server-only";
import { apiError } from "../http/errors";
import { GeminiError } from "./gemini";

/** A Gemini failure as an API error the editor shows as is (never with the key in it). */
export function aiError(err: unknown, fallback = "Something went wrong with Gemini. Try again."): Response {
  if (err instanceof GeminiError) return apiError(err.status, err.code, err.message);
  console.error("gemini feature failed", err instanceof Error ? err.message : err);
  return apiError(500, "server_error", fallback);
}

/** The JSON body, or null. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
