import "server-only";
import { getDb } from "./index";
import type { AdminSetting } from "./schema";

export function getAdminSetting(key: string, defaultValue = ""): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM admin_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : defaultValue;
}

export function getAllAdminSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM admin_settings").all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

export function setAdminSetting(key: string, value: string, updatedBy?: string | null): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO admin_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(key, value, now, updatedBy ?? null);
}

export function setMultipleAdminSettings(settings: Record<string, string>, updatedBy?: string | null): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO admin_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  for (const [k, v] of Object.entries(settings)) {
    stmt.run(k, v, now, updatedBy ?? null);
  }
}

/** Keys whose values are credentials: never returned by the API or written to audit logs. */
export function isSecretSettingKey(key: string): boolean {
  return /secret|password|token|api_key/i.test(key);
}

/** "••••" plus the last 4 characters, or "" when unset. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  return "••••" + value.slice(-4);
}

/** A copy safe to send to the browser or log: secret values masked. */
export function redactSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) {
    out[k] = isSecretSettingKey(k) ? maskSecret(typeof v === "string" ? v : v == null ? "" : String(v)) : v;
  }
  return out;
}

/** A numeric setting; falls back when unset or not a finite number (0 is a valid value). */
export function getNumberSetting(key: string, fallback: number): number {
  const raw = getAdminSetting(key, "");
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** A comma-separated list of positive integers, e.g. "7,3,1". */
export function getNumberListSetting(key: string, fallback: number[]): number[] {
  const raw = getAdminSetting(key, "");
  if (raw.trim() === "") return fallback;
  const list = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return list.length ? list : fallback;
}
