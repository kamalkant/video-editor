"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatAgo } from "@/lib/format";
import {
  type DeviceFolderInfo,
  getDeviceFolderInfo,
  pickDeviceFolder,
  resetDeviceFolder,
  testWriteDeviceFolder,
  requestFolderPermission,
} from "@/lib/storage/deviceFolder";
import type { StorageStats, StoredAsset } from "@/lib/storage/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function StorageManagerModal({ onClose }: { onClose: () => void }) {
  const { user, accountCode, workspace } = useAuth();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [assets, setAssets] = useState<StoredAsset[]>([]);
  const [orphans, setOrphans] = useState<StoredAsset[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "folder" | "assets" | "orphans">("overview");
  const [cleaning, setCleaning] = useState(false);
  const [confirmClean, setConfirmClean] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Device Folder state
  const [folderInfo, setFolderInfo] = useState<DeviceFolderInfo>({
    isSupported: true,
    folderName: "Documents/vdo",
    hasCustomFolder: true,
    hasPermission: true,
    isDefault: true,
  });
  const [isTestingFolder, setIsTestingFolder] = useState(false);

  const loadData = async () => {
    if (!workspace) return;
    try {
      const [s, a, o] = await Promise.all([
        workspace.getStorageStats(),
        workspace.listAssets(),
        workspace.findOrphanAssets(),
      ]);
      setStats(s);
      setAssets(a);
      setOrphans(o);
    } catch {
      // Ignore load error
    }
  };

  const loadFolderInfo = async () => {
    if (!accountCode) return;
    try {
      const info = await getDeviceFolderInfo(accountCode);
      setFolderInfo(info);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    void loadData();
  }, [workspace]);

  useEffect(() => {
    void loadFolderInfo();
  }, [accountCode]);

  const handleAuthorizeFolder = async () => {
    if (!accountCode) return;
    const ok = await requestFolderPermission(accountCode);
    if (ok) {
      setNotice(`Write permission granted for "${folderInfo.folderName}"! Live autosave active.`);
    } else {
      setNotice("Write permission was not granted by your browser.");
    }
    await loadFolderInfo();
  };

  const handlePickFolder = async () => {
    if (!accountCode) return;
    const res = await pickDeviceFolder(accountCode);
    if (res.success && res.folderName) {
      setNotice(`Autosave folder updated to: "${res.folderName}"`);
      await loadFolderInfo();
    } else if (res.error && res.error !== "Selection cancelled") {
      setNotice(`Could not select folder: ${res.error}`);
    }
  };

  const handleResetFolder = async () => {
    if (!accountCode) return;
    await resetDeviceFolder(accountCode);
    setNotice("Autosave location reset to default: Documents/vdo.");
    await loadFolderInfo();
  };

  const handleTestFolderWrite = async () => {
    if (!accountCode) return;
    setIsTestingFolder(true);
    try {
      const res = await testWriteDeviceFolder(accountCode);
      setNotice(res.message);
      await loadFolderInfo();
    } finally {
      setIsTestingFolder(false);
    }
  };

  const handleCleanOrphans = async () => {
    if (!workspace) return;
    setCleaning(true);
    try {
      const count = await workspace.cleanOrphanAssets();
      setNotice(`Successfully cleaned ${count} unused asset(s).`);
      setConfirmClean(false);
      await loadData();
    } catch (e) {
      setNotice(`Failed to clean assets: ${(e as Error).message}`);
    } finally {
      setCleaning(false);
    }
  };

  const percentUsed =
    stats?.quotaBytes && stats.quotaBytes > 0
      ? Math.min(100, (stats.totalBytes / stats.quotaBytes) * 100)
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-manager-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="storage" className="size-5" />
            </div>
            <div>
              <h2 id="storage-manager-title" className="text-sm font-bold text-ink">
                Storage Manager
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span>Account:</span>
                <span className="font-mono font-semibold text-primary">{accountCode || "—"}</span>
                <span>·</span>
                <span className="truncate max-w-[200px]">{user?.email}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-line bg-surface/50 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("folder")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "folder"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon name="folderOpen" className="size-3.5" />
            <span>Autosave Folder</span>
            {folderInfo.hasCustomFolder && (
              <span className="size-1.5 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("assets")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "assets"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Stored Assets ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("orphans")}
            className={`border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
              activeTab === "orphans"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Unused Assets ({orphans.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {notice && (
            <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-primary/20 p-3 text-xs text-primary font-medium">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-primary">
                ✕
              </button>
            </div>
          )}

          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Autosave Folder Location Card */}
              <div className="rounded-xl border border-line bg-raised/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name="folderOpen" className="size-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-ink">Autosave & Drafts Folder Location</h3>
                      <p className="text-[11px] text-muted">
                        Unsaved changes & project drafts automatically save directly to Documents/vdo on your Mac.
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-500 border border-emerald-500/20">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {folderInfo.isDefault ? "Autosaving to Documents/vdo" : "Autosaving to Documents/vdo"}
                  </span>
                </div>

                {/* Folder details & action buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase font-mono tracking-wider text-muted">Current Save Location</div>
                    <div className="text-xs font-semibold text-ink truncate mt-0.5 flex items-center gap-1.5">
                      <span className="text-primary font-bold">📁 {folderInfo.folderName || "Documents/vdo"}</span>
                      <span className="text-[10px] text-muted font-normal">(Visible on your Mac)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!folderInfo.isDefault && !folderInfo.hasPermission && (
                      <button
                        type="button"
                        onClick={() => void handleAuthorizeFolder()}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black shadow-xs hover:bg-amber-400 transition-colors"
                        title="Grant permission to write to your chosen folder"
                      >
                        Grant Permission
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handlePickFolder()}
                      className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                    >
                      Change Folder...
                    </button>
                    <button
                      type="button"
                      disabled={isTestingFolder}
                      onClick={() => void handleTestFolderWrite()}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-raised transition-colors"
                      title="Test write access and save a verification snapshot"
                    >
                      {isTestingFolder ? "Testing…" : "Test Write"}
                    </button>
                    {!folderInfo.isDefault && (
                      <button
                        type="button"
                        onClick={() => void handleResetFolder()}
                        className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:text-danger hover:border-danger/30 transition-colors"
                        title="Revert back to default Documents/vdo"
                      >
                        Reset to Default
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quota Progress */}
              <div className="rounded-xl border border-line bg-raised/30 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">Total Stored</span>
                  <span className="font-medium text-muted">
                    {formatBytes(stats?.totalBytes || 0)}
                    {stats?.quotaBytes ? ` / ${formatBytes(stats.quotaBytes)}` : ""}
                  </span>
                </div>
                {percentUsed !== null && (
                  <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        percentUsed > 85 ? "bg-danger" : percentUsed > 60 ? "bg-amber-500" : "bg-primary"
                      }`}
                      style={{ width: `${Math.max(1, percentUsed)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Category Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                  <div className="text-[11px] text-muted">Projects</div>
                  <div className="text-base font-bold text-ink">{stats?.projectsCount || 0}</div>
                  <div className="text-[10px] text-muted">{formatBytes(stats?.projectsBytes || 0)}</div>
                </div>

                <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                  <div className="text-[11px] text-muted">Video Assets</div>
                  <div className="text-base font-bold text-ink">
                    {formatBytes(stats?.videosBytes || 0)}
                  </div>
                  <div className="text-[10px] text-muted">Originals & proxies</div>
                </div>

                <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                  <div className="text-[11px] text-muted">Audio Assets</div>
                  <div className="text-base font-bold text-ink">
                    {formatBytes(stats?.audioBytes || 0)}
                  </div>
                  <div className="text-[10px] text-muted">Tracks & voiceovers</div>
                </div>

                <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                  <div className="text-[11px] text-muted">Images</div>
                  <div className="text-base font-bold text-ink">
                    {formatBytes(stats?.imagesBytes || 0)}
                  </div>
                  <div className="text-[10px] text-muted">Pictures & logos</div>
                </div>

                <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                  <div className="text-[11px] text-muted">Generated Media</div>
                  <div className="text-base font-bold text-ink">
                    {formatBytes(stats?.generatedBytes || 0)}
                  </div>
                  <div className="text-[10px] text-muted">AI creations</div>
                </div>

                <div className="rounded-xl border border-line bg-surface p-3 space-y-1">
                  <div className="text-[11px] text-muted">Unused Media</div>
                  <div className="text-base font-bold text-ink">{orphans.length} items</div>
                  <div className="text-[10px] text-muted">Safe to clean</div>
                </div>
              </div>

              {/* Maintenance Actions */}
              <div className="rounded-xl border border-line p-4 space-y-3">
                <div className="text-xs font-bold text-ink">Maintenance & Cleanup</div>
                <div className="flex flex-wrap items-center gap-2">
                  {orphans.length > 0 && !confirmClean && (
                    <button
                      type="button"
                      onClick={() => setConfirmClean(true)}
                      className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20 transition-colors"
                    >
                      Clean {orphans.length} Unused Assets
                    </button>
                  )}

                  {confirmClean && (
                    <div className="flex items-center gap-2 rounded-lg bg-danger/10 p-2 border border-danger/30">
                      <span className="text-xs text-danger font-medium">Delete {orphans.length} unused files permanently?</span>
                      <button
                        type="button"
                        disabled={cleaning}
                        onClick={() => void handleCleanOrphans()}
                        className="rounded bg-danger px-2.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-danger/90"
                      >
                        {cleaning ? "Cleaning…" : "Confirm Delete"}
                      </button>
                      <button
                        type="button"
                        disabled={cleaning}
                        onClick={() => setConfirmClean(false)}
                        className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-surface"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "folder" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-line bg-raised/20 p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-ink">Mac Folder for Unsaved Changes & Drafts</h3>
                    <p className="text-xs text-muted leading-relaxed">
                      By default, ViPlay automatically targets <span className="font-semibold text-ink">Documents/vdo</span> on your Mac so all your unsaved edits, drafts, and recovery files are immediately visible in macOS Finder. You can also pick any custom folder or external drive.
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    {folderInfo.isDefault ? "Autosaving to Documents/vdo" : "Autosaving to Documents/vdo"}
                  </span>
                </div>

                <div className="rounded-lg border border-line bg-surface p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted font-medium">Selected Device Folder:</span>
                    <span className="font-mono font-semibold text-ink">
                      📁 {folderInfo.folderName || "Documents/vdo"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
                    <button
                      type="button"
                      onClick={() => void handlePickFolder()}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary/90 transition-colors"
                    >
                      <Icon name="folderOpen" className="size-4" />
                      <span>Change Mac Folder…</span>
                    </button>

                    <button
                      type="button"
                      disabled={isTestingFolder}
                      onClick={() => void handleTestFolderWrite()}
                      className="rounded-lg border border-line bg-raised/50 px-3 py-2 text-xs font-semibold text-ink hover:bg-raised transition-colors"
                    >
                      {isTestingFolder ? "Testing Write…" : "Verify Write Access"}
                    </button>

                    {!folderInfo.isDefault && (
                      <button
                        type="button"
                        onClick={() => void handleResetFolder()}
                        className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-danger hover:border-danger/30 transition-colors"
                      >
                        Reset to Documents/vdo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-ink">How Device Autosave Works</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
                    <div className="font-semibold text-ink flex items-center gap-2">
                      <span className="text-primary font-bold">1.</span>
                      <span>Real-time Draft Saving</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Every edit, trim, and split writes a live <code className="text-primary font-mono text-[10px]">.draft.vdo</code> file directly into your selected Mac folder.
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
                    <div className="font-semibold text-ink flex items-center gap-2">
                      <span className="text-primary font-bold">2.</span>
                      <span>Crash & Power Failure Protection</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      If your Mac runs out of battery or Chrome closes unexpectedly, your latest unsaved state is intact in your folder.
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
                    <div className="font-semibold text-ink flex items-center gap-2">
                      <span className="text-primary font-bold">3.</span>
                      <span>Visible in macOS Finder</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Unlike hidden browser databases, you can open this folder anytime in Finder to copy, back up, or organize your draft files.
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
                    <div className="font-semibold text-ink flex items-center gap-2">
                      <span className="text-primary font-bold">4.</span>
                      <span>100% Local & Private</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Drafts remain exclusively on your computer hard drive. Nothing is transmitted to the server without your consent.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "assets" && (
            <div className="space-y-2">
              {assets.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted">No assets stored in this workspace yet.</div>
              ) : (
                assets.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/30 p-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink truncate">{a.name}</div>
                      <div className="text-[10px] text-muted flex items-center gap-2">
                        <span className="uppercase font-mono">{a.type}</span>
                        <span>·</span>
                        <span>{formatBytes(a.size)}</span>
                        <span>·</span>
                        <span>Added {formatAgo(a.createdAt)}</span>
                        <span>·</span>
                        <span>Used in {(a.usedInProjectIds ?? []).length} project(s)</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "orphans" && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                These media assets are stored in your local workspace but are not currently referenced in any
                project timeline. Cleaning them frees up local browser storage safely.
              </p>

              {orphans.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted">No unused assets found! All media is currently active in projects.</div>
              ) : (
                <div className="space-y-2">
                  {orphans.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/30 p-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink truncate">{a.name}</div>
                        <div className="text-[10px] text-muted flex items-center gap-2">
                          <span className="uppercase font-mono">{a.type}</span>
                          <span>·</span>
                          <span>{formatBytes(a.size)}</span>
                          <span>·</span>
                          <span>Unused</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-surface/50 px-6 py-3.5">
          <div className="text-[11px] text-muted">
            {folderInfo.hasCustomFolder ? (
              <span className="text-emerald-500 font-medium">● Autosaving to Documents/vdo</span>
            ) : (
              <span>Autosaving to Browser Sandbox</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-ink hover:bg-raised transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
