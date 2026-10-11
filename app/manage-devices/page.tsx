"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/lib/editor/theme";
import { AccountHeader } from "@/components/layout/AccountHeader";

type Device = {
  id: string;
  user_id: string;
  session_token: string;
  device_name: string;
  device_type: "desktop" | "tablet" | "mobile";
  os: string;
  browser: string;
  ip_address: string | null;
  last_active_at: number;
  created_at: number;
};

export default function ManageDevicesPage() {
  const theme = useTheme();
  const isLight = theme === "light";

  const [devices, setDevices] = useState<Device[]>([]);
  const [currentToken, setCurrentToken] = useState<string>("");
  const [deviceLimit, setDeviceLimit] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/user/devices");
      const data = await res.json();
      if (data.ok) {
        setDevices(data.devices || []);
        setCurrentToken(data.currentToken || "");
        setDeviceLimit(data.deviceLimit || 2);
      } else if (res.status === 401) {
        // Not logged in
        window.location.href = "/login";
      }
    } catch (err) {
      console.error("Failed to load devices", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRevoke = async (deviceId: string) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", deviceId }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("Device session terminated successfully.");
        await fetchDevices();
      } else {
        setMessage(data.message || "Failed to revoke device.");
      }
    } catch {
      setMessage("Error communicating with server.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeAllOther = async () => {
    if (!confirm("Are you sure you want to log out from all other devices?")) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_other" }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`Revoked ${data.revokedCount} other session(s).`);
        await fetchDevices();
      } else {
        setMessage(data.message || "Failed to revoke sessions.");
      }
    } catch {
      setMessage("Error communicating with server.");
    } finally {
      setActionLoading(false);
    }
  };

  const isAtOrExceeded = devices.length >= deviceLimit;

  return (
    <div className={`min-h-screen ${isLight ? "bg-slate-50 text-slate-900" : "bg-slate-950 text-white"}`}>
      <AccountHeader />
      <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line/40">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono mb-2">
              <Icon name="monitor" className="size-3.5" />
              <span>ACTIVE SESSIONS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Manage Connected Devices</h1>
            <p className="text-xs sm:text-sm text-muted mt-1">
              Review and revoke sessions across your desktop, laptop, tablet, and mobile devices.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/editor"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition shadow-md shadow-cyan-500/20"
            >
              Back to Studio
            </Link>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center justify-between">
            <span>{message}</span>
            <button onClick={() => setMessage(null)} className="text-muted hover:text-white">✕</button>
          </div>
        )}

        {/* Device Limit Progress Card */}
        <div className={`p-6 rounded-2xl border shadow-lg ${
          isLight ? "bg-white border-slate-200" : "bg-slate-900/80 border-slate-800"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted font-mono">
              Simultaneous Concurrency
            </span>
            <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full ${
              isAtOrExceeded ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            }`}>
              {devices.length} of {deviceLimit} Devices Active
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isAtOrExceeded ? "bg-amber-500" : "bg-cyan-500"
              }`}
              style={{ width: `${Math.min(100, (devices.length / deviceLimit) * 100)}%` }}
            />
          </div>

          {isAtOrExceeded && (
            <p className="text-xs text-amber-400/90 mt-3 flex items-center gap-2">
              <Icon name="info" className="size-4 shrink-0" />
              <span>You have reached your simultaneous session limit. To log in on a new device, revoke one of your sessions below.</span>
            </p>
          )}
        </div>

        {/* Devices List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Your Active Sessions</h2>
            {devices.length > 1 && (
              <button
                onClick={handleRevokeAllOther}
                disabled={actionLoading}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold underline underline-offset-4 disabled:opacity-50"
              >
                Log Out All Other Devices
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted">Loading active devices...</div>
          ) : devices.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No active devices found.</div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const isCurrent = device.session_token === currentToken;
                const formattedTime = new Date(device.last_active_at).toLocaleString();

                return (
                  <div
                    key={device.id}
                    className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition shadow-sm ${
                      isCurrent
                        ? isLight
                          ? "bg-cyan-50/70 border-cyan-300"
                          : "bg-cyan-950/20 border-cyan-500/40"
                        : isLight
                        ? "bg-white border-slate-200"
                        : "bg-slate-900/60 border-slate-800"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isCurrent ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-800 text-slate-400"
                      }`}>
                        <Icon name="monitor" className="size-5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{device.device_name}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500 text-slate-950 uppercase tracking-wider">
                              This Device
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-muted space-x-2 font-mono">
                          <span>OS: {device.os}</span>
                          <span>•</span>
                          <span>Browser: {device.browser}</span>
                          {device.ip_address && (
                            <>
                              <span>•</span>
                              <span>IP: {device.ip_address}</span>
                            </>
                          )}
                        </div>

                        <div className="text-[11px] text-muted">
                          Last active: {formattedTime}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isCurrent ? (
                        <span className="text-xs text-cyan-400 font-semibold px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                          Active Session
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRevoke(device.id)}
                          disabled={actionLoading}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition disabled:opacity-50"
                        >
                          Revoke Device
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
