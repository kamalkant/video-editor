import { getDb } from "../db/index";
import { decryptString } from "../crypto/encryption";
import "server-only";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { storagePath } from "../storage";
import { PROVIDERS, type ProviderId, type ProviderStatus } from "./providers";

/**
 * The user's own API keys (AI Tools → Settings), in storage/settings/ai-keys.json,
 * readable by this user only. A provider saved here (even switched off or with
 * its key removed) no longer falls back to the .env.local key, so "Remove" and
 * "Off" really stop it. The keys never leave this server except to their own service.
 */

type Rec = { key?: string; enabled: boolean };
type Store = Partial<Record<ProviderId, Rec>>;

const ENV: Record<ProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
  openai: "OPENAI_API_KEY",
  pexels: "PEXELS_API_KEY",
  pixabay: "PIXABAY_API_KEY",
  youtube: "YOUTUBE_API_KEY",
};
const file = () => storagePath("settings", "ai-keys.json");

const g = globalThis as unknown as {
  __VDOKeys?: { path: string; mtime: number; store: Store };
};
const mtimeOf = (path: string) => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
};

/** The saved keys (read again whenever the file changes or is gone, e.g. a cleared storage folder). */
function load(): Store {
  const path = file();
  const mtime = mtimeOf(path);
  if (g.__VDOKeys?.path === path && g.__VDOKeys.mtime === mtime)
    return g.__VDOKeys.store;
  let store: Store = {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Store;
    for (const p of PROVIDERS) {
      const r = raw?.[p.id];
      if (r && typeof r === "object")
        store[p.id] = {
          enabled: r.enabled !== false,
          ...(typeof r.key === "string" && r.key ? { key: r.key } : {}),
        };
    }
  } catch {
    store = {};
  }
  g.__VDOKeys = { path, mtime, store };
  return store;
}

function save(store: Store) {
  const path = file();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
  g.__VDOKeys = { path, mtime: mtimeOf(path), store };
}

/** The key to use for a provider now: null when it is switched off or has none. */
/**
 * The key one AI request uses, chosen per user by lib/ai/meter (their own key, or a pool an
 * admin assigned them). Code deeper down (gemini.ts, grok.ts) just calls aiKey(id) and gets it.
 */
export const aiKeyScope = new AsyncLocalStorage<{ keys: Partial<Record<ProviderId, string>> }>();

export function aiKey(id: ProviderId, userId?: string | null): string | null {
  const scoped = aiKeyScope.getStore()?.keys[id];
  if (scoped) return scoped;
  if (userId) {
    try {
      const db = getDb();
      // 1. Check user personal encrypted credentials
      const cred = db.prepare("SELECT encrypted_key, is_enabled FROM user_api_credentials WHERE user_id = ? AND provider = ?").get(userId, id);
      if (cred && (cred as any).is_enabled === 1) {
        const decrypted = decryptString((cred as any).encrypted_key);
        if (decrypted) return decrypted;
      }

      // 2. Check assigned admin pool
      const assigned = db.prepare(`
        SELECT p.encrypted_key FROM user_api_assignments a
        JOIN admin_api_pools p ON a.pool_id = p.id
        WHERE a.user_id = ? AND p.provider = ? AND a.status = 'active' AND p.is_active = 1
        AND (a.expires_at IS NULL OR a.expires_at > ?)
      `).get(userId, id, Date.now());
      if (assigned && (assigned as any).encrypted_key) {
        const decrypted = decryptString((assigned as any).encrypted_key);
        if (decrypted) return decrypted;
      }

      // 3. Super Admin isolation check
      const u = db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
      if (u && (u as any).role === "super_admin") {
        return process.env[ENV[id]]?.trim() || null;
      }

      // Standard users NEVER get Super Admin .env.local fallback
      return null;
    } catch (err) {
      console.error("Failed to resolve user AI key:", err);
      return null;
    }
  }

  const rec = load()[id];
  if (rec) return rec.enabled && rec.key ? rec.key : null;
  return process.env[ENV[id]]?.trim() || null;
}

/** The provider has an entry in AI settings (then .env.local is not used for it). */
export const aiSaved = (id: ProviderId) => !!load()[id];

/** Switched off in AI settings (a key may still be saved). */
export const aiOff = (id: ProviderId) => load()[id]?.enabled === false;

export function aiStatus(): ProviderStatus[] {
  const store = load();
  return PROVIDERS.map((p) => {
    const rec = store[p.id];
    const env = rec ? null : process.env[ENV[p.id]]?.trim() || null;
    const key = rec?.key ?? env;
    return {
      id: p.id,
      enabled: rec?.enabled !== false,
      hasKey: !!key,
      source: rec?.key ? "settings" : env ? "env" : null,
      last4: key ? key.slice(-4) : null,
    };
  });
}

/** Save a key (keeps the provider's on/off). */
export function setAiKey(id: ProviderId, key: string) {
  const store = { ...load() };
  store[id] = { enabled: store[id]?.enabled ?? true, key };
  save(store);
}

/** Forget the key (the .env.local key is not used either from now on). */
export function removeAiKey(id: ProviderId) {
  const store = { ...load() };
  store[id] = { enabled: store[id]?.enabled ?? true };
  save(store);
}

/** Switch a provider's features on or off without losing its key (an .env.local key is kept as the saved one). */
export function setAiEnabled(id: ProviderId, enabled: boolean) {
  const store = { ...load() };
  const cur = store[id] ?? {
    enabled: true,
    ...(process.env[ENV[id]]?.trim()
      ? { key: process.env[ENV[id]]!.trim() }
      : {}),
  };
  store[id] = { ...cur, enabled };
  save(store);
}
