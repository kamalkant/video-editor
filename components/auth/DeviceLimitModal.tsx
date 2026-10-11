"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { Device } from "@/lib/db/schema";

export function DeviceLimitModal({
  isOpen,
  onClose,
  devices,
  deviceLimit,
  onDeviceRevoked,
  onRevoke,
  onRevokeAll,
}: {
  isOpen: boolean;
  onClose: () => void;
  devices: Device[] | any[];
  deviceLimit: number;
  onDeviceRevoked?: () => void;
  onRevoke?: (deviceId: string) => Promise<void>;
  onRevokeAll?: () => Promise<void>;
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRevoke = async (deviceId: string) => {
    setRevokingId(deviceId);
    try {
      if (onRevoke) {
        await onRevoke(deviceId);
      } else {
        const res = await fetch("/api/user/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revoke", deviceId }),
        });
        const data = await res.json();
        if (data.ok && onDeviceRevoked) {
          onDeviceRevoked();
        }
      }
    } catch (err) {
      console.error("Device revoke failed", err);
    } finally {
      setRevokingId(null);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Icon name="laptop" className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">Device Limit Reached</h2>
            <p className="text-xs text-muted">
              Your plan permits <strong className="text-ink">{deviceLimit} concurrent device(s)</strong>.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted">
          To log in on this device, please log out from one of your existing sessions below, or upgrade to a higher tier plan.
        </p>

        <div className="divide-y divide-line/60 max-h-56 overflow-y-auto">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2.5 text-xs">
              <div>
                <div className="font-semibold text-ink">{d.device_name}</div>
                <div className="text-[11px] text-muted">
                  {d.os} &bull; {d.browser} &bull; Last active: {new Date(d.last_active_at).toLocaleDateString()}
                </div>
              </div>

              <button
                onClick={() => handleRevoke(d.id)}
                disabled={revokingId === d.id}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {revokingId === d.id ? "Revoking…" : "Log Out"}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4 text-xs">
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-3.5 py-1.5 font-semibold text-muted hover:bg-raised transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <Link
            href="/account/billing"
            className="rounded-xl bg-primary px-4 py-1.5 font-semibold text-white hover:bg-primary-hover shadow-sm transition-all"
          >
            Upgrade Plan &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
