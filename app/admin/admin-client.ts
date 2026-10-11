"use client";

import { createContext, useContext } from "react";

export type AdminViewer = { id: string; name: string; email: string; role: string };

export const AdminViewerContext = createContext<AdminViewer | null>(null);

/** The signed-in admin, for hiding actions the server would refuse (it re-checks every request). */
export function useAdminViewer(): AdminViewer & { isSuperAdmin: boolean } {
  const viewer = useContext(AdminViewerContext);
  return { ...(viewer ?? { id: "", name: "", email: "", role: "admin" }), isSuperAdmin: viewer?.role === "super_admin" };
}

/**
 * The message from an admin API error body. Routes answer either `{ ok, message }` or
 * `{ error: { code, message } }`; this reads both.
 */
export function apiMessage(data: unknown, fallback: string): string {
  const d = (data ?? {}) as { message?: string; error?: { message?: string } };
  return d.error?.message || d.message || fallback;
}
