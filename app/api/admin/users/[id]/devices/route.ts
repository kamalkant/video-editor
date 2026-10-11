import { requireAdmin } from "@/lib/auth/admin-guard";
import { NextResponse } from "next/server";
import { canManageUser } from "@/lib/auth/admin-policy";
import {
  listUserDevices,
  revokeDevice,
  revokeAllUserDevices,
  getUserDeviceLimit,
  setUserDeviceOverride,
  removeUserDeviceOverride,
} from "@/lib/db/devices";
import { getUserById } from "@/lib/db/users";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;
    const user = guard.user;

    const { id } = await params;
    const targetUser = getUserById(id);
    if (!targetUser) {
      return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    }

    const devices = listUserDevices(id, true);
    const activeCount = devices.filter((d) => d.is_revoked === 0).length;
    const deviceLimit = getUserDeviceLimit(id);

    const db = getDb();
    const override = db
      .prepare("SELECT max_devices_override FROM user_device_overrides WHERE user_id = ?")
      .get(id) as { max_devices_override: number } | undefined;

    return NextResponse.json({
      ok: true,
      devices,
      activeCount,
      deviceLimit,
      hasOverride: !!override,
      overrideLimit: override?.max_devices_override ?? null,
      user: { id: targetUser.id, email: targetUser.email, name: targetUser.name },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to fetch user devices" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin();
    if (guard.denied) return guard.denied;
    const user = guard.user;

    const { id } = await params;
    const targetUser = getUserById(id);
    if (!targetUser) return NextResponse.json({ ok: false, message: "User not found" }, { status: 404 });
    if (!canManageUser(user, targetUser)) {
      return NextResponse.json({ ok: false, message: "Only a Super Admin can manage devices of admin accounts" }, { status: 403 });
    }
    const body = await req.json();
    const { action, deviceId, maxDevices, reason } = body || {};

    if (action === "set_limit" || action === "set_override") {
      const num = Number(maxDevices);
      if (!Number.isInteger(num) || num < 1 || num > 100) {
        return NextResponse.json({ ok: false, message: "Device limit must be a whole number from 1 to 100" }, { status: 400 });
      }
      setUserDeviceOverride({
        userId: id,
        maxDevices: num,
        reason: reason || "Admin UI Override",
        updatedBy: user.id,
      });
      logAudit({
        actorId: user.id,
        action: "device_limit.override_set",
        target: id,
        details: { maxDevices: num, reason },
      });
      const updatedLimit = getUserDeviceLimit(id);
      return NextResponse.json({
        ok: true,
        message: `Device limit set to ${updatedLimit} concurrent device(s)`,
        deviceLimit: updatedLimit,
        hasOverride: true,
      });
    }

    if (action === "remove_override") {
      removeUserDeviceOverride(id);
      logAudit({
        actorId: user.id,
        action: "device_limit.override_removed",
        target: id,
      });
      const updatedLimit = getUserDeviceLimit(id);
      return NextResponse.json({
        ok: true,
        message: `Device limit reset to plan default (${updatedLimit} device(s))`,
        deviceLimit: updatedLimit,
        hasOverride: false,
      });
    }

    if (action === "revoke_all" || deviceId === "all") {
      const count = revokeAllUserDevices(id);
      logAudit({
        actorId: user.id,
        action: "user.all_devices_revoked_by_admin",
        target: id,
        details: { targetUserId: id, revokedCount: count },
      });
      const updatedDevices = listUserDevices(id, true);
      return NextResponse.json({ ok: true, message: `Revoked ${count} active session(s)`, devices: updatedDevices });
    }

    if (!deviceId) return NextResponse.json({ ok: false, message: "Device ID required" }, { status: 400 });

    const ok = revokeDevice(deviceId, id);
    logAudit({
      actorId: user.id,
      action: "user.device_revoked_by_admin",
      target: deviceId,
      details: { targetUserId: id },
    });

    const updatedDevices = listUserDevices(id, true);
    return NextResponse.json({ ok, message: ok ? "Device session revoked" : "Device not found", devices: updatedDevices });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to process device request" }, { status: 500 });
  }
}


