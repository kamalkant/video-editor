"use client";

import { useEffect, useState, useCallback } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Device, ParsedFeatureFlag, SafeUser, UserRole, UserStatus } from "@/lib/db/schema";
import { apiMessage, useAdminViewer } from "../admin-client";
import { UserDrawer } from "./UserDrawer";
import { ExportCsv } from "../ExportCsv";

const MIN_PASSWORD = 8;

const TOOL_ICONS: Record<string, IconName> = {
  library: "library",
  elements: "elements",
  effects: "effects",
  ai: "ai",
  text: "text",
  transitions: "transitions",
  audio: "audio",
  subtitles: "subtitles",
  templates: "templates",
  brand: "brand",
  background: "background",
  export: "settings",
};

export default function AdminUsersPage() {
  const viewer = useAdminViewer();
  // mirrors the server policy: plain admins manage regular users only
  const canManage = (u: SafeUser) => viewer.isSuperAdmin || u.role === "user";
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<UserRole>("user");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Password Reset Modal State
  const [resetTargetUser, setResetTargetUser] = useState<SafeUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // User Permissions Modal State
  const [permissionsUser, setPermissionsUser] = useState<SafeUser | null>(null);
  const [permissionsData, setPermissionsData] = useState<{
    allTools: ParsedFeatureFlag[];
    overrides: Record<string, boolean>;
    computed: Record<string, boolean>;
  } | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);
  const [permToast, setPermToast] = useState<string | null>(null);

  // User Devices / Sessions Modal State
  // the user 360 side panel
  const [overviewId, setOverviewId] = useState<string | null>(null);
  const [devicesUser, setDevicesUser] = useState<SafeUser | null>(null);
  const [devicesList, setDevicesList] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesRevokingId, setDevicesRevokingId] = useState<string | null>(null);
  const [devicesLimit, setDevicesLimit] = useState<number>(1);
  const [hasDeviceOverride, setHasDeviceOverride] = useState(false);
  const [editDeviceLimit, setEditDeviceLimit] = useState<number>(1);
  const [savingLimit, setSavingLimit] = useState(false);
  const [deviceToast, setDeviceToast] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String(Math.max(0, (page - 1) * pageSize)));

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [];
    if (page <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (page >= totalPages - 3) {
      pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
    }
    return pages;
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const target = users.find((u) => u.id === userId);
    if (!confirm(`Change ${target?.name ?? "this user"}'s role to ${newRole.replace("_", " ")}?`)) return;
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      } else {
        const err = await res.json();
        alert(apiMessage(err, "Failed to update role"));
      }
    } catch {
      alert("Network error");
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: UserStatus) => {
    setBusyId(userId);
    const nextStatus: UserStatus = currentStatus === "active" ? "suspended" : "active";
    if (nextStatus === "suspended" && !confirm("Suspend this account? The user is signed out everywhere immediately.")) {
      setBusyId(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      } else {
        const err = await res.json();
        alert(apiMessage(err, "Failed to update status"));
      }
    } catch {
      alert("Network error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (user: SafeUser) => {
    if (!confirm(`Delete "${user.name}" (${user.email})? They can no longer sign in and their personal details are erased. Payments and audit history are kept.`)) {
      return;
    }
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (res.ok) {
        void fetchUsers();
      } else {
        const err = await res.json();
        alert(apiMessage(err, "Failed to delete user"));
      }
    } catch {
      alert("Network error");
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          email: addEmail,
          password: addPassword,
          role: addRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(apiMessage(data, "Failed to create user"));
      }

      setShowAddModal(false);
      setAddName("");
      setAddEmail("");
      setAddPassword("");
      setAddRole("user");
      setPage(1);
      void fetchUsers();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setAddLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setResetLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${resetTargetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(apiMessage(err, "Failed to reset password"));
      }

      alert(`Password for ${resetTargetUser.name} has been updated.`);
      setResetTargetUser(null);
      setNewPassword("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  const openPermissions = async (user: SafeUser) => {
    setPermissionsUser(user);
    setPermissionsLoading(true);
    setPermissionsData(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/features`);
      if (res.ok) {
        const data = await res.json();
        setPermissionsData({
          allTools: data.allTools || [],
          overrides: data.overrides || {},
          computed: data.computed || {},
        });
      }
    } catch (err) {
      console.error("Failed to load permissions", err);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleOverrideChange = async (toolId: string, enabled: boolean | null) => {
    if (!permissionsUser) return;
    setSavingToolId(toolId);

    // Optimistic override update
    setPermissionsData((prev) => {
      if (!prev) return null;
      const nextOverrides = { ...prev.overrides };
      if (enabled === null) {
        delete nextOverrides[toolId];
      } else {
        nextOverrides[toolId] = enabled;
      }
      return { ...prev, overrides: nextOverrides };
    });

    try {
      const res = await fetch(`/api/admin/users/${permissionsUser.id}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId, enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setPermissionsData((prev) =>
          prev
            ? {
                ...prev,
                overrides: data.overrides ?? prev.overrides,
                computed: data.computed ?? prev.computed,
              }
            : null
        );
        const actionLabel = enabled === null ? "Reset to role default" : enabled ? "Granted" : "Blocked";
        setPermToast(`Tool "${toolId}" is now ${actionLabel}`);
        setTimeout(() => setPermToast(null), 2500);
      } else {
        const err = await res.json();
        alert(apiMessage(err, "Failed to update permission"));
      }
    } catch {
      alert("Network error updating permission");
    } finally {
      setSavingToolId(null);
    }
  };

  const openDevicesModal = async (user: SafeUser) => {
    setDevicesUser(user);
    setDevicesLoading(true);
    setDevicesList([]);
    setDeviceToast(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/devices`);
      if (res.ok) {
        const data = await res.json();
        setDevicesList(data.devices || []);
        setDevicesLimit(data.deviceLimit || 1);
        setEditDeviceLimit(data.deviceLimit || 1);
        setHasDeviceOverride(!!data.hasOverride);
      } else {
        const err = await res.json();
        alert(apiMessage(err, "Failed to load user devices"));
      }
    } catch {
      alert("Network error fetching devices");
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleUpdateDeviceLimit = async (newLimit: number) => {
    if (!devicesUser) return;
    setSavingLimit(true);
    try {
      const res = await fetch(`/api/admin/users/${devicesUser.id}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_limit", maxDevices: newLimit }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDeviceToast(data.message || "Device limit updated.");
        setDevicesLimit(data.deviceLimit);
        setEditDeviceLimit(data.deviceLimit);
        setHasDeviceOverride(true);
        setTimeout(() => setDeviceToast(null), 3000);
      } else {
        alert(apiMessage(data, "Failed to update device limit"));
      }
    } catch {
      alert("Network error updating device limit");
    } finally {
      setSavingLimit(false);
    }
  };

  const handleRemoveDeviceOverride = async () => {
    if (!devicesUser) return;
    setSavingLimit(true);
    try {
      const res = await fetch(`/api/admin/users/${devicesUser.id}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_override" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDeviceToast(data.message || "Reset to plan default.");
        setDevicesLimit(data.deviceLimit);
        setEditDeviceLimit(data.deviceLimit);
        setHasDeviceOverride(false);
        setTimeout(() => setDeviceToast(null), 3000);
      } else {
        alert(apiMessage(data, "Failed to reset device limit"));
      }
    } catch {
      alert("Network error resetting device limit");
    } finally {
      setSavingLimit(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!devicesUser) return;
    setDevicesRevokingId(deviceId);
    try {
      const res = await fetch(`/api/admin/users/${devicesUser.id}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", deviceId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDeviceToast(data.message || "Device session revoked.");
        setDevicesList(data.devices || []);
        setTimeout(() => setDeviceToast(null), 3000);
      } else {
        alert(apiMessage(data, "Failed to revoke device"));
      }
    } catch {
      alert("Network error revoking device");
    } finally {
      setDevicesRevokingId(null);
    }
  };

  const handleRevokeAllDevices = async () => {
    if (!devicesUser) return;
    if (!confirm(`Are you sure you want to revoke ALL active sessions for ${devicesUser.name}? The user will be logged out everywhere immediately.`)) return;
    setDevicesRevokingId("all");
    try {
      const res = await fetch(`/api/admin/users/${devicesUser.id}/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_all" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDeviceToast(data.message || "All sessions revoked.");
        setDevicesList(data.devices || []);
        setTimeout(() => setDeviceToast(null), 3000);
      } else {
        alert(apiMessage(data, "Failed to revoke all sessions"));
      }
    } catch {
      alert("Network error revoking sessions");
    } finally {
      setDevicesRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">User Management</h1>
          <p className="mt-1 text-sm text-muted">
            View accounts, assign roles (Super Admin, Admin, User), and manage permissions. Click a name to see everything about that user.
          </p>
          <div className="mt-2">
            <ExportCsv kind="users" label="Users CSV" />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover transition-colors"
        >
          <Icon name="plus" className="size-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-line bg-raised/50 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="absolute left-3 top-2.5 text-muted pointer-events-none">
            <Icon name="search" className="size-4" />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-raised/40 text-muted uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-6 py-3.5">User</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Created</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isBusy = busyId === u.id;
                  const date = new Date(u.created_at).toLocaleDateString();

                  return (
                    <tr key={u.id} className="hover:bg-raised/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <button type="button" onClick={() => setOverviewId(u.id)} title="Everything about this user" className="text-left">
                            <div className="font-bold text-ink hover:text-primary hover:underline">{u.name}</div>
                            <div className="text-xs text-muted">{u.email}</div>
                          </button>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <select
                          disabled={isBusy || !viewer.isSuperAdmin || u.id === viewer.id}
                          title={!viewer.isSuperAdmin ? "Only a Super Admin can change roles" : u.id === viewer.id ? "You cannot change your own role" : undefined}
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className={`rounded-md border border-line/80 px-2 py-1 font-semibold text-xs focus:border-primary focus:outline-none ${
                            u.role === "super_admin"
                              ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                              : u.role === "admin"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                              : "bg-surface text-ink"
                          }`}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          type="button"
                          disabled={isBusy || !canManage(u) || u.id === viewer.id || u.status === "deleted"}
                          onClick={() => handleStatusToggle(u.id, u.status)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold text-[10px] transition-colors ${
                            u.status === "active"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                              : "bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25"
                          }`}
                        >
                          <span className={`size-1.5 rounded-full ${u.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                          <span>{u.status === "active" ? "Active" : u.status === "deleted" ? "Deleted" : "Suspended"}</span>
                        </button>
                      </td>

                      <td className="px-6 py-4 text-muted whitespace-nowrap">
                        {date}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openDevicesModal(u)}
                            title="Manage Active Sessions & Devices"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors"
                          >
                            <Icon name="laptop" className="size-3.5" />
                            <span>Sessions</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void openPermissions(u)}
                            title="Manage Tool Permissions"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                          >
                            <Icon name="wand" className="size-3.5" />
                            <span>Tools</span>
                          </button>
                          {canManage(u) && (
                          <button
                            type="button"
                            onClick={() => setResetTargetUser(u)}
                            title="Reset Password"
                            className="rounded p-1 text-muted hover:bg-raised hover:text-ink transition-colors"
                          >
                            <Icon name="lock" className="size-4" />
                          </button>
                          )}
                          {viewer.isSuperAdmin && u.id !== viewer.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            title="Delete User"
                            className="rounded p-1 text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                          >
                            <Icon name="trash" className="size-4" />
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-line px-6 py-3 text-xs text-muted flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              {total === 0
                ? "No users found"
                : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} users`}
            </span>
            <div className="flex items-center gap-1.5 text-muted">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-line bg-raised/50 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {total > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-raised/40 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                title="Previous page"
                aria-label="Previous page"
              >
                <Icon name="chevronRight" className="size-3.5 rotate-180" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              <div className="flex items-center gap-1">
                {getPageNumbers().map((p, idx) =>
                  p === "..." ? (
                    <span
                      key={`dots-${idx}`}
                      className="size-7 flex items-center justify-center text-xs text-muted select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === page ? "page" : undefined}
                      className={`size-7 rounded-lg text-xs font-medium flex items-center justify-center transition-colors ${
                        p === page
                          ? "bg-primary text-white font-semibold shadow-xs"
                          : "border border-line bg-raised/30 text-muted hover:bg-raised hover:text-ink"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-raised/40 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                title="Next page"
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <Icon name="chevronRight" className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">Add New User</h2>
            <p className="mt-1 text-xs text-muted">Create an account and assign a system role.</p>

            {addError && (
              <div className="mt-4 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
                {addError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder={`Minimum ${MIN_PASSWORD} characters`}
                  className="w-full rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as UserRole)}
                  disabled={!viewer.isSuperAdmin}
                  className="w-full rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                >
                  <option value="user">User</option>
                  {viewer.isSuperAdmin && <option value="admin">Admin</option>}
                  {viewer.isSuperAdmin && <option value="super_admin">Super Admin</option>}
                </select>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-muted hover:bg-raised transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {addLoading ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ink">Reset Password</h2>
            <p className="mt-1 text-xs text-muted">
              Enter a new password for <span className="font-semibold text-ink">{resetTargetUser.name}</span>.
            </p>

            <form onSubmit={handlePasswordReset} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`Minimum ${MIN_PASSWORD} characters`}
                  className="w-full rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-muted hover:bg-raised transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || newPassword.length < MIN_PASSWORD}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {resetLoading ? "Saving..." : "Set Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* User Permissions Modal */}
      {permissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border border-line bg-surface shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line p-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-ink">Tool & Feature Permissions</h2>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                      permissionsUser.role === "super_admin"
                        ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                        : permissionsUser.role === "admin"
                        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                        : "bg-surface border border-line text-ink"
                    }`}
                  >
                    {permissionsUser.role.toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Customize tool availability for <span className="font-semibold text-ink">{permissionsUser.name}</span> ({permissionsUser.email}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsUser(null)}
                className="rounded-lg p-1 text-muted hover:bg-raised hover:text-ink transition-colors"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>

            {/* Toast inside modal if updated */}
            {permToast && (
              <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                <Icon name="check" className="size-3.5" />
                <span>{permToast}</span>
              </div>
            )}

            {/* Modal Body: Scrollable list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {permissionsLoading ? (
                <div className="p-10 text-center text-muted text-xs">Loading tool permissions...</div>
              ) : !permissionsData ? (
                <div className="p-10 text-center text-red-500 text-xs">Failed to load tool permissions.</div>
              ) : (
                permissionsData.allTools.map((flag) => {
                  const override = permissionsData.overrides[flag.tool_id];
                  const hasOverride = override !== undefined;
                  const isGranted = override === true;
                  const isBlocked = override === false;
                  const isRoleAllowed = flag.allowed_roles.includes(permissionsUser.role);
                  const isGlobalDisabled = !flag.enabled_global;
                  const isSaving = savingToolId === flag.tool_id;
                  const iconName = TOOL_ICONS[flag.tool_id] || "elements";

                  return (
                    <div
                      key={flag.tool_id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        isGranted
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : isBlocked
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-line bg-raised/20"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                            isGranted
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : isBlocked
                              ? "bg-red-500/15 text-red-600 dark:text-red-400"
                              : "bg-surface text-ink border border-line"
                          }`}
                        >
                          <Icon name={iconName} className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink text-xs">{flag.title}</span>
                            {isGlobalDisabled && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                Disabled Globally
                              </span>
                            )}
                            {hasOverride ? (
                              <span
                                className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                                  isGranted
                                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                    : "bg-red-500/20 text-red-700 dark:text-red-300"
                                }`}
                              >
                                {isGranted ? "Custom Granted" : "Custom Blocked"}
                              </span>
                            ) : (
                              <span className="rounded bg-surface border border-line/60 px-1.5 py-0.2 text-[9px] text-muted">
                                Default: {isRoleAllowed ? "Allowed" : "Blocked"}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted truncate mt-0.5">{flag.description}</p>
                        </div>
                      </div>

                      {/* 3-Way Segmented Control */}
                      <div className="flex items-center rounded-lg border border-line bg-surface p-0.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleOverrideChange(flag.tool_id, null)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            !hasOverride
                              ? "bg-raised text-ink font-semibold shadow-xs"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          Default
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleOverrideChange(flag.tool_id, true)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            isGranted
                              ? "bg-emerald-500 text-white font-semibold shadow-xs"
                              : "text-muted hover:text-emerald-600 dark:hover:text-emerald-400"
                          }`}
                        >
                          Grant
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleOverrideChange(flag.tool_id, false)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            isBlocked
                              ? "bg-red-500 text-white font-semibold shadow-xs"
                              : "text-muted hover:text-red-600 dark:hover:text-red-400"
                          }`}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-line px-5 py-3 bg-raised/20">
              <span className="text-[11px] text-muted">
                Overrides take effect immediately on next tool load.
              </span>
              <button
                type="button"
                onClick={() => setPermissionsUser(null)}
                className="rounded-lg bg-surface border border-line px-4 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* User Devices & Sessions Modal */}
      {devicesUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-raised/30">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Icon name="laptop" className="size-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink">Active Devices & Sessions</h2>
                  <p className="text-xs text-muted">
                    Manage login sessions for <strong className="text-ink">{devicesUser.name}</strong> ({devicesUser.email})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {devicesList.some((d) => d.is_revoked === 0) && (
                  <button
                    type="button"
                    disabled={devicesRevokingId !== null}
                    onClick={() => void handleRevokeAllDevices()}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Icon name="trash" className="size-3.5" />
                    <span>{devicesRevokingId === "all" ? "Revoking All..." : "Revoke All Sessions"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDevicesUser(null)}
                  className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink transition-colors cursor-pointer"
                >
                  <Icon name="close" className="size-5" />
                </button>
              </div>
            </div>

            {/* Alert / Toast */}
            {deviceToast && (
              <div className="px-6 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <span>{deviceToast}</span>
                <button type="button" onClick={() => setDeviceToast(null)} className="text-emerald-500 hover:opacity-80">
                  <Icon name="close" className="size-3.5" />
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Device Limit Configuration Bar */}
              <div className="rounded-xl border border-line bg-raised/40 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink">Max Concurrent Devices</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          hasDeviceOverride
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                            : "bg-surface border border-line text-muted"
                        }`}
                      >
                        {hasDeviceOverride ? "Custom Override Active" : "Plan Default"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      Controls how many simultaneous sessions this user is allowed before new logins are blocked.
                    </p>
                  </div>

                  {hasDeviceOverride && (
                    <button
                      type="button"
                      disabled={savingLimit}
                      onClick={() => void handleRemoveDeviceOverride()}
                      className="text-xs text-muted hover:text-red-500 underline transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      Reset to Plan Default
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        disabled={savingLimit}
                        onClick={() => void handleUpdateDeviceLimit(num)}
                        className={`size-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          devicesLimit === num
                            ? "bg-primary text-white shadow-xs"
                            : "border border-line bg-surface text-ink hover:bg-raised"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  <div className="h-4 w-px bg-line/60 mx-1 hidden sm:block" />

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={editDeviceLimit}
                      onChange={(e) => setEditDeviceLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink text-center focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={savingLimit || editDeviceLimit === devicesLimit}
                      onClick={() => void handleUpdateDeviceLimit(editDeviceLimit)}
                      className="rounded-lg bg-surface border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-raised disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {savingLimit ? "Saving..." : "Set Custom"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted pt-1">
                <span>
                  Active Sessions: <strong className="text-cyan-500 font-bold">{devicesList.filter((d) => d.is_revoked === 0).length}</strong> / {devicesLimit}
                </span>
                <span className="text-[11px]">
                  {devicesList.length} total session(s) recorded
                </span>
              </div>


              {devicesLoading ? (
                <div className="p-10 text-center text-muted text-xs">Loading sessions...</div>
              ) : devicesList.length === 0 ? (
                <div className="p-10 text-center text-muted text-xs rounded-xl border border-dashed border-line">
                  No recorded device sessions for this user.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {devicesList.map((d) => {
                    const isActive = d.is_revoked === 0;
                    const isRevoking = devicesRevokingId === d.id;
                    const lastActive = new Date(d.last_active_at).toLocaleString();

                    return (
                      <div
                        key={d.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                          isActive
                            ? "border-line bg-surface hover:border-line/80 shadow-xs"
                            : "border-line/40 bg-raised/20 opacity-60"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${
                              isActive ? "bg-cyan-500/10 text-cyan-500" : "bg-muted/10 text-muted"
                            }`}
                          >
                            <Icon name="laptop" className="size-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-ink">{d.device_name}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  isActive
                                    ? "bg-emerald-500/15 text-emerald-500"
                                    : "bg-muted/15 text-muted"
                                }`}
                              >
                                {isActive ? "Active Session" : "Revoked"}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                              <span>IP: {d.ip_address || "Unknown"}</span>
                              <span>•</span>
                              <span>OS: {d.os}</span>
                              <span>•</span>
                              <span>Browser: {d.browser}</span>
                              <span>•</span>
                              <span>Last active: {lastActive}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {isActive ? (
                            <button
                              type="button"
                              disabled={isRevoking || devicesRevokingId !== null}
                              onClick={() => void handleRevokeDevice(d.id)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {isRevoking ? "Revoking…" : "Revoke Session"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted italic px-2 py-1">Session Terminated</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-line px-6 py-3.5 bg-raised/20">
              <span className="text-xs text-muted">
                Revoking a session immediately terminates access and logs out that device.
              </span>
              <button
                type="button"
                onClick={() => setDevicesUser(null)}
                className="rounded-lg bg-surface border border-line px-4 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {overviewId && <UserDrawer key={overviewId} userId={overviewId} onClose={() => setOverviewId(null)} />}
    </div>
  );
}
