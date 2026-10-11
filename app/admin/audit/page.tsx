"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { apiMessage } from "../admin-client";

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced copy of `search` sent to the server
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // ?user=<id> (from the user 360 drawer): only that user's trail
  const [subject, setSubject] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setSubject(new URLSearchParams(window.location.search).get("user"));
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (query) params.set("q", query);
      if (subject) params.set("user", subject);
      const res = await fetch(`/api/admin/audit?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Failed to load audit logs"));
      setLogs(data.logs);
      setTotal(data.total);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subject === undefined) return; // (wait until the URL has been read)
    fetchLogs();
  }, [page, query, subject]);

  // search runs on the server over the whole log (not just the rows on this page)
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filteredLogs = logs;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Audit & History Log</h1>
          <p className="mt-1 text-xs text-muted">
            Immutable system audit trail tracking administrative actions, subscription state transitions, and payments.
          </p>
          {subject && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              One user: {subject}
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState(null, "", "/admin/audit");
                  setPage(1);
                  setSubject(null);
                }}
                className="underline"
              >
                Show everyone
              </button>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search action or target…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-sm">
        {error ? (
          <div role="alert" className="p-8 text-center text-sm text-red-500">Could not load audit logs: {error}</div>
        ) : loading ? (
          <div className="p-8 text-center text-sm text-muted">Loading audit records…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">No audit logs matching query.</div>
        ) : (
          <div className="divide-y divide-line/60">
            {filteredLogs.map((log) => {
              const isExpanded = expandedId === log.id;
              let parsedDetails: any = null;
              if (log.details) {
                try {
                  parsedDetails = JSON.parse(log.details);
                } catch {
                  parsedDetails = log.details;
                }
              }

              return (
                <div key={log.id} className="p-4 hover:bg-raised/20 transition-colors text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                        {log.action}
                      </span>
                      {log.target && (
                        <span className="text-ink font-medium">Target: {log.target}</span>
                      )}
                      <span className="text-muted">
                        by {log.actor_name ? `${log.actor_name} (${log.actor_email})` : "System / Gateway"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-muted whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                      {log.details && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          className="rounded-lg border border-line bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted hover:text-ink cursor-pointer"
                        >
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && parsedDetails && (
                    <div className="mt-3 rounded-xl border border-line bg-canvas p-3 font-mono text-[11px] text-muted overflow-x-auto">
                      <pre>{JSON.stringify(parsedDetails, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
          <span>
            {total === 0 ? "0 entries" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} entries`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-line px-2.5 py-1 font-semibold hover:text-ink disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-line px-2.5 py-1 font-semibold hover:text-ink disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
