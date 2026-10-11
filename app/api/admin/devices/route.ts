import { requireAdmin } from "@/lib/auth/admin-guard";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { revokeDevice, setUserDeviceOverride, removeUserDeviceOverride } from "@/lib/db/devices";
import { logAudit } from "@/lib/db/audit";
import { getUserById } from "@/lib/db/users";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;

    const db = getDb();
    const rows = db.prepare(`
      SELECT d.*, u.email as user_email, u.name as user_name
      FROM devices d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_revoked = 0
      ORDER BY d.last_active_at DESC
      LIMIT 100
    `).all();

    return NextResponse.json({ ok: true, devices: rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch devices" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;
    const user = guard.user;

    const body = await req.json();
    const { action, deviceId, targetUserId, maxDevices, reason } = body || {};

    if (action === "set_override" && targetUserId) {
      const limit = Number(maxDevices);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return NextResponse.json({ ok: false, message: "Device limit must be a whole number from 1 to 100" }, { status: 400 });
      }
      if (!getUserById(targetUserId)) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
      setUserDeviceOverride({
        userId: targetUserId,
        maxDevices: limit,
        reason: reason || null,
        updatedBy: user.id,
      });
      logAudit({
        actorId: user.id,
        action: "device_limit.override_set",
        target: targetUserId,
        details: { maxDevices, reason },
      });
      return NextResponse.json({ ok: true, message: "Device override saved" });
    }

    if (action === "remove_override" && targetUserId) {
      removeUserDeviceOverride(targetUserId);
      logAudit({
        actorId: user.id,
        action: "device_limit.override_removed",
        target: targetUserId,
      });
      return NextResponse.json({ ok: true, message: "Device override removed" });
    }

    if (!deviceId) return NextResponse.json({ ok: false, message: "Device ID or valid action required" }, { status: 400 });

    const ok = revokeDevice(deviceId);
    logAudit({
      actorId: user.id,
      action: "device.force_revoked",
      target: deviceId,
    });

    return NextResponse.json({ ok, message: ok ? "Device revoked" : "Device not found" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Device revocation failed" }, { status: 500 });
  }
}
