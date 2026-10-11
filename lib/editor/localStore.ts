/** localStorage that never throws (private mode, quota, blocked storage). */
export function readLocal<T = unknown>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing to remove */
  }
}

export const LAST_SETTINGS_KEY = "VDO:v1:last";
export const UI_KEY = "VDO:v1:ui";
