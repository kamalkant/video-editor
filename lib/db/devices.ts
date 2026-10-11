import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Device, DeviceType } from "./schema";

export function parseUserAgent(uaString = ""): {
  deviceType: DeviceType;
  os: string;
  browser: string;
  deviceName: string;
} {
  const ua = uaString.toLowerCase();
  let deviceType: DeviceType = "desktop";
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = "tablet";
  } else if (/mobile|iphone|ipod|android/i.test(ua)) {
    deviceType = "mobile";
  } else {
    deviceType = "desktop";
  }

  if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";

  if (/chrome|crios/i.test(ua) && !/edg|opr|opera/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/edg/i.test(ua)) browser = "Edge";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  const deviceName = `${os} (${browser})`;

  return { deviceType, os, browser, deviceName };
}

export function listUserDevices(userId: string, includeRevoked = false): Device[] {
  const db = getDb();
  const query = includeRevoked
    ? "SELECT * FROM devices WHERE user_id = ? ORDER BY last_active_at DESC"
    : "SELECT * FROM devices WHERE user_id = ? AND is_revoked = 0 ORDER BY last_active_at DESC";
  const rows = db.prepare(query).all(userId) as Device[];
  return rows;
}


export function getDeviceByToken(token: string): Device | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM devices WHERE session_token = ?").get(token) as Device | undefined;
  return row ?? null;
}

export function registerOrUpdateDevice(params: {
  userId: string;
  sessionToken: string;
  userAgent?: string;
  ipAddress?: string | null;
}): Device {
  const db = getDb();
  const existing = getDeviceByToken(params.sessionToken);
  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE devices 
      SET last_active_at = ?, ip_address = COALESCE(?, ip_address), is_revoked = 0
      WHERE id = ?
    `).run(now, params.ipAddress ?? null, existing.id);
    return { ...existing, last_active_at: now, is_revoked: 0 };
  }

  const { deviceType, os, browser, deviceName } = parseUserAgent(params.userAgent);
  const id = "dev_" + randomUUID().slice(0, 8);

  db.prepare(`
    INSERT INTO devices (
      id, user_id, session_token, device_name, device_type,
      os, browser, ip_address, last_active_at, is_revoked, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    params.userId,
    params.sessionToken,
    deviceName,
    deviceType,
    os,
    browser,
    params.ipAddress ?? null,
    now,
    now
  );

  return {
    id,
    user_id: params.userId,
    session_token: params.sessionToken,
    device_name: deviceName,
    device_type: deviceType,
    os,
    browser,
    ip_address: params.ipAddress ?? null,
    last_active_at: now,
    is_revoked: 0,
    created_at: now,
  };
}

export function revokeDevice(deviceId: string, userId?: string): boolean {
  const db = getDb();
  const query = userId
    ? "SELECT * FROM devices WHERE id = ? AND user_id = ?"
    : "SELECT * FROM devices WHERE id = ?";
  
  const dev = (userId ? db.prepare(query).get(deviceId, userId) : db.prepare(query).get(deviceId)) as Device | undefined;
  if (!dev) return false;

  // Mark device as revoked
  db.prepare("UPDATE devices SET is_revoked = 1 WHERE id = ?").run(deviceId);

  // Terminate associated session
  db.prepare("DELETE FROM sessions WHERE token = ?").run(dev.session_token);
  return true;
}

export function revokeAllOtherDevices(userId: string, currentSessionToken: string): number {
  const db = getDb();
  // Get other active devices
  const otherDevices = db.prepare(`
    SELECT * FROM devices 
    WHERE user_id = ? AND session_token != ? AND is_revoked = 0
  `).all(userId, currentSessionToken) as Device[];

  if (otherDevices.length === 0) return 0;

  for (const d of otherDevices) {
    revokeDevice(d.id, userId);
  }

  return otherDevices.length;
}

export function revokeAllUserDevices(userId: string): number {
  const db = getDb();
  const res = db.prepare("UPDATE devices SET is_revoked = 1 WHERE user_id = ? AND is_revoked = 0").run(userId);
  try {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  } catch {}
  return Number(res.changes || 0);
}


export function checkDeviceLimit(
  userId: string,
  customLimit?: number
): {
  allowed: boolean;
  activeCount: number;
  limit: number;
  devices: Device[];
} {
  const limit = customLimit ?? getUserDeviceLimit(userId);
  const devices = listUserDevices(userId);
  return {
    allowed: devices.length <= limit,
    activeCount: devices.length,
    limit,
    devices,
  };
}


export function getUserDeviceLimit(userId: string): number {
  const db = getDb();
  
  // 1. Check user-specific admin override
  try {
    const override = db.prepare("SELECT max_devices_override FROM user_device_overrides WHERE user_id = ?").get(userId) as { max_devices_override: number } | undefined;
    if (override && typeof override.max_devices_override === "number" && override.max_devices_override > 0) {
      return override.max_devices_override;
    }
  } catch (err) {
    // table might not be ready in early test
  }

  // 2. Check active subscription plan
  try {
    const row = db.prepare(`
      SELECT p.device_limit FROM subscriptions s
      JOIN plans p ON s.plan_id = p.id
      WHERE s.user_id = ? AND s.status IN ('active', 'trialing')
      ORDER BY s.created_at DESC LIMIT 1
    `).get(userId) as { device_limit: number } | undefined;
    if (row && typeof row.device_limit === "number" && row.device_limit > 0) {
      return row.device_limit;
    }
  } catch (err) {
    // subscriptions check fallback
  }

  // 3. Check system-wide default setting
  try {
    const globalDefault = db
      .prepare("SELECT value FROM admin_settings WHERE key = 'default_device_limit'")
      .get() as { value: string } | undefined;
    if (globalDefault && parseInt(globalDefault.value, 10) > 0) {
      return parseInt(globalDefault.value, 10);
    }
  } catch (err) {
    // admin_settings check fallback
  }

  // 4. Fallback: Free tier default is 1 device
  return 1;
}


export function setUserDeviceOverride(params: {
  userId: string;
  maxDevices: number;
  reason?: string | null;
  updatedBy?: string | null;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_device_overrides (user_id, max_devices_override, reason, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      max_devices_override = excluded.max_devices_override,
      reason = excluded.reason,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(params.userId, params.maxDevices, params.reason ?? null, params.updatedBy ?? null, Date.now());
}

export function removeUserDeviceOverride(userId: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM user_device_overrides WHERE user_id = ?").run(userId);
  return res.changes > 0;
}
