"use client";

import { useEffect, useState } from "react";
import { apiMessage } from "../admin-client";
import { Icon } from "@/components/ui/Icon";
import type { BulkJob, BulkJobType } from "@/lib/db/schema";

export default function AdminBulkJobsPage() {
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // New Job Wizard State
  const [jobType, setJobType] = useState<BulkJobType>("ai_credit_grant");
  const [targetScope, setTargetScope] = useState<"all" | "active">("all");
  const [batchSize, setBatchSize] = useState(50);
  const [creditAmount, setCreditAmount] = useState(50);
  const [creditReason, setCreditReason] = useState("Festival Promo / Community Gift");
  const [broadcastTitle, setBroadcastTitle] = useState("Important Studio Update");
  const [broadcastMessage, setBroadcastMessage] = useState("New features and tools are now live in ViPlay Studio.");
  const [deviceLimit, setDeviceLimit] = useState(2);
  const [deviceReason, setDeviceReason] = useState("Bulk Admin Device Policy Update");
  const [message, setMessage] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/admin/bulk-jobs");
      const data = await res.json();
      if (data.ok) setJobs(data.jobs);
    } catch (err) {
      console.error("Failed to load bulk jobs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setMessage(null);

    try {
      let payload: Record<string, any> = {};
      if (jobType === "ai_credit_grant") {
        payload = { amount: Number(creditAmount), reason: creditReason };
      } else if (jobType === "notification_broadcast") {
        payload = { title: broadcastTitle, message: broadcastMessage, type: "system" };
      } else if (jobType === "force_logout" || jobType === "device_revoke_all") {
        payload = { reason: "Security / Session maintenance" };
      } else if (jobType === "user_device_override") {
        payload = { maxDevices: Number(deviceLimit), reason: deviceReason };
      }

      const res = await fetch("/api/admin/bulk-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // the server resolves the users for the scope (all of them, not one page of a list)
        body: JSON.stringify({
          type: jobType,
          targetScope,
          payload,
          batchSize: Number(batchSize),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Failed to create bulk job"));

      setMessage(`Created job with ${data.targetCount} target records.`);
      fetchJobs();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleExecuteBatch = async (jobId: string) => {
    setExecutingId(jobId);
    try {
      // each call runs one batch of the job's own batch size
      const res = await fetch(`/api/admin/bulk-jobs/${jobId}/execute`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        fetchJobs();
        // If not finished, keep going
        if (data.job?.status === "running") {
          setTimeout(() => handleExecuteBatch(jobId), 400);
        }
      } else {
        setMessage(`Error: ${apiMessage(data, "Batch execution failed")}`);
      }
    } catch {
      setMessage("Error: network error while running batch");
    } finally {
      setExecutingId(null);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/bulk-jobs/${jobId}/retry`, { method: "POST" });
      const data = await res.json();
      setMessage(data.ok ? data.message : `Error: ${apiMessage(data, "Retry failed")}`);
      if (data.ok) fetchJobs();
    } catch {
      setMessage("Error: network error while retrying");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Bulk Operations Runner</h1>
        <p className="mt-1 text-xs text-muted">
          Execute authorized batch operations across users, active sessions, and AI credit balances with chunking and retry safety.
        </p>
      </div>

      {message && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-muted hover:text-ink cursor-pointer">&times;</button>
        </div>
      )}

      {/* Grid: Create Job & Active Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bulk Action Creator Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="text-base font-bold text-ink mb-1">Queue New Bulk Action</h2>
          <p className="text-xs text-muted mb-4">Choose an operation and configure its target scope.</p>

          <form onSubmit={handleCreateJob} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-muted mb-1">Action Type</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value as BulkJobType)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
              >
                <option value="ai_credit_grant">Bulk Grant AI Credits</option>
                <option value="user_device_override">Set Device Limit (All / Active Users)</option>
                <option value="notification_broadcast">Broadcast In-App Notification</option>
                <option value="device_revoke_all">Revoke All Active Devices & Sessions</option>
                <option value="ai_assignment_revoke">Revoke Admin AI API Assignments</option>
                <option value="force_logout">Force Logout All Sessions</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-muted mb-1">Target Audience</label>
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value as any)}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
              >
                <option value="all">All Registered Users</option>
                <option value="active">Active Accounts Only</option>
              </select>
            </div>

            {jobType === "ai_credit_grant" && (
              <>
                <div>
                  <label className="block font-medium text-muted mb-1">Credits Per User</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Grant Reason / Memo</label>
                  <input
                    type="text"
                    required
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            )}

            {jobType === "notification_broadcast" && (
              <>
                <div>
                  <label className="block font-medium text-muted mb-1">Notification Title</label>
                  <input
                    type="text"
                    required
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Message Content</label>
                  <textarea
                    rows={2}
                    required
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            )}

            {jobType === "user_device_override" && (
              <>
                <div>
                  <label className="block font-medium text-muted mb-1">Max Concurrent Devices</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={deviceLimit}
                    onChange={(e) => setDeviceLimit(Math.max(1, Number(e.target.value)))}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-muted">Each matching user will be allowed this many simultaneous active sessions.</p>
                </div>
                <div>
                  <label className="block font-medium text-muted mb-1">Reason / Memo</label>
                  <input
                    type="text"
                    required
                    value={deviceReason}
                    onChange={(e) => setDeviceReason(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block font-medium text-muted mb-1">Chunk Batch Size</label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink focus:border-primary focus:outline-none"
              >
                <option value="25">25 records / batch</option>
                <option value="50">50 records / batch</option>
                <option value="100">100 records / batch</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-xl bg-primary py-2.5 font-semibold text-white shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer"
            >
              {creating ? "Queueing Job…" : "Queue Bulk Operation"}
            </button>
          </form>
        </div>

        {/* Existing Jobs Table */}
        <div className="lg:col-span-2 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="text-base font-bold text-ink mb-1">Operation Execution Queue</h2>
          <p className="text-xs text-muted mb-4">Track running jobs, view progress, and retry failed operations.</p>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted">Loading queue…</div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No bulk operations in queue.</div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const percent = job.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0;
                const isRunning = job.status === "running" || executingId === job.id;

                return (
                  <div key={job.id} className="rounded-xl border border-line/80 bg-canvas/60 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-ink uppercase tracking-wider">{job.type.replace(/_/g, " ")}</span>
                        <div className="text-[11px] text-muted">ID: {job.id} &bull; {new Date(job.created_at).toLocaleString()}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          job.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                          job.status === "running" ? "bg-primary/10 text-primary animate-pulse" :
                          job.status === "failed" ? "bg-red-500/10 text-red-400" :
                          "bg-amber-500/10 text-amber-400"
                        }`}>
                          {job.status.toUpperCase()}
                        </span>

                        {(job.status === "pending" || job.status === "running" || job.status === "paused") && (
                          <button
                            onClick={() => handleExecuteBatch(job.id)}
                            disabled={isRunning}
                            className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                          >
                            {isRunning ? "Running…" : "Run Batch"}
                          </button>
                        )}

                        {(job.status === "completed" || job.status === "failed") && job.failed_items > 0 && (
                          <button
                            onClick={() => handleRetryJob(job.id)}
                            title="Create a new job for only the users that failed"
                            className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
                          >
                            Retry {job.failed_items} failed
                          </button>
                        )}
                        <a
                          href={`/api/admin/bulk-jobs/export?jobId=${job.id}`}
                          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink transition cursor-pointer"
                          download
                        >
                          Export CSV
                        </a>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span>{job.processed_items} of {job.total_items} processed ({percent}%)</span>
                        <span>{job.successful_items} success &bull; {job.failed_items} errors</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-raised overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            job.status === "failed" ? "bg-red-500" : "bg-primary"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
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
