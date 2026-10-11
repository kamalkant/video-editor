/** Uniform JSON error shape: { error: { code, message } }. */
export function apiError(status: number, code: string, message: string, detail?: string): Response {
  return Response.json({ error: { code, message, ...(detail ? { detail } : {}) } }, { status });
}

export function finiteNumber(v: string | null, fallback: number): number {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? n : fallback;
}
