"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGrid, SkeletonRows } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { toApiError } from "@/lib/api/types";
import { formatAgo, formatTime } from "@/lib/format";
import type { ProjectSummary } from "@/lib/projects/model";
import { newUuid } from "@/lib/storage/uuid";
import { useAuth } from "@/lib/auth/AuthContext";
import { exportVDO, importVDO } from "@/lib/storage/VDO";
import { saveFileWithPicker } from "@/lib/storage/filePicker";
import { localThumb } from "@/lib/media/localMedia";

export type ProjectSort = "date-desc" | "date-asc" | "name" | "duration";
export type ProjectView = "grid" | "list";

/** Projects: saved automatically; open, rename, multi-select, sort or delete them here. */
export function ProjectsPanel(p: {
  projects: ProjectSummary[] | null;
  listError: string | null;
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRenamed: (id: string, name: string) => void;
  onDeleted: (id: string) => void;
  onOpenStorage?: () => void;
}) {
  const { workspace } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** What is being done to a project now (duplicate, export, import…): said with a spinner. */
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    project: ProjectSummary;
    x: number;
    y: number;
  } | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  // View mode & sorting preference from localStorage
  const [view, setView] = useState<ProjectView>("list");
  const [sort, setSort] = useState<ProjectSort>("date-desc");

  useEffect(() => {
    try {
      const v = localStorage.getItem("VDO:projects:view");
      if (v === "grid" || v === "list") setView(v);
      const s = localStorage.getItem("VDO:projects:sort");
      if (
        s === "date-desc" ||
        s === "date-asc" ||
        s === "name" ||
        s === "duration"
      )
        setSort(s);
    } catch {
      // Local storage disabled/blocked
    }
  }, []);

  const changeView = (next: ProjectView) => {
    setView(next);
    try {
      localStorage.setItem("VDO:projects:view", next);
    } catch {
      // Ignore
    }
  };

  const changeSort = (next: ProjectSort) => {
    setSort(next);
    try {
      localStorage.setItem("VDO:projects:sort", next);
    } catch {
      // Ignore
    }
  };

  const sortedProjects = useMemo(() => {
    if (!p.projects) return null;
    const list = [...p.projects];
    switch (sort) {
      case "date-asc":
        return list.sort((a, b) => a.updatedAt - b.updatedAt);
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "duration":
        return list.sort((a, b) => b.duration - a.duration);
      case "date-desc":
      default:
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }, [p.projects, sort]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!sortedProjects) return;
    if (selected.size === sortedProjects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedProjects.map((x) => x.id)));
    }
  };

  const rename = async (id: string) => {
    const name = draft.trim();
    setEditing(null);
    if (!name) return;
    setBusy("Renaming…");
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw await toApiError(res);
      p.onRenamed(id, ((await res.json()) as { name: string }).name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (x: ProjectSummary) => {
    setBusy(`Duplicating “${x.name}”…`);
    try {
      // a project kept on this computer: copied here (the server would leave out files it doesn't have)
      const local = workspace ? await workspace.getProject(x.id) : null;
      if (workspace && local) {
        const id = newUuid();
        const now = Date.now();
        await workspace.saveProject({ ...local, id, name: `${x.name} (Copy)`, createdAt: now, updatedAt: now, jobId: null });
        p.onRenamed(id, `${x.name} (Copy)`);
        return;
      }
      const res = await fetch(`/api/projects/${x.id}`);
      if (!res.ok) throw await toApiError(res);
      const data = (await res.json()) as { doc: unknown; name: string };
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${x.name} (Copy)`,
          doc: data.doc,
        }),
      });
      if (!createRes.ok) throw await toApiError(createRes);
      const created = (await createRes.json()) as { id: string; name: string };
      p.onRenamed(created.id, created.name);
    } catch (e) {
      setError((e as Error).message || "Couldn't duplicate the project.");
    } finally {
      setBusy(null);
    }
  };

  const del = async (x: ProjectSummary) => {
    if (
      !window.confirm(
        `Delete the project “${x.name}”? Its settings are removed. The video stays in My Assets.`,
      )
    )
      return;
    try {
      if (workspace) {
        await workspace.deleteProject(x.id);
        await workspace.clearRecovery(x.id);
      }
      try {
        const res = await fetch(`/api/projects/${x.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) throw await toApiError(res);
      } catch {
        // Local deletion succeeded even if server is offline
      }
      p.onDeleted(x.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(x.id);
        return next;
      });
      if (x.id === p.currentId) {
        p.onNew();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteBatch = async () => {
    const count = selected.size;
    if (!count) return;
    if (
      !window.confirm(
        `Delete ${count} selected project${count > 1 ? "s" : ""}? Their settings are removed. The videos stay in My Assets.`,
      )
    )
      return;
    setDeletingBatch(true);
    let deletedCurrent = false;
    try {
      for (const id of Array.from(selected)) {
        if (id === p.currentId) deletedCurrent = true;
        if (workspace) {
          await workspace.deleteProject(id);
          await workspace.clearRecovery(id);
        }
        try {
          const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) throw await toApiError(res);
        } catch {
          // Local deletion succeeded
        }
      }
      const firstId = Array.from(selected)[0] ?? "";
      setSelected(new Set());
      if (deletedCurrent) {
        p.onNew();
      } else if (firstId) {
        p.onDeleted(firstId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingBatch(false);
    }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (
    projectSummary: ProjectSummary,
    portable: boolean,
  ) => {
    if (!workspace) {
      setError("Please sign in to access your local workspace.");
      return;
    }
    setBusy(portable ? `Packing “${projectSummary.name}” with its media…` : `Saving “${projectSummary.name}”…`);
    try {
      let proj = await workspace.getProject(projectSummary.id);
      if (!proj) {
        try {
          const res = await fetch(`/api/projects/${projectSummary.id}`);
          if (res.ok) {
            const data = await res.json();
            proj = data.project || data;
          }
        } catch {
          // ignore server fetch error
        }
      }
      if (!proj) throw new Error("Project not found in local workspace or server.");
      const blob = await exportVDO(proj, workspace, { portable });
      const safeName = projectSummary.name.replace(/[/\\?%*:|"<>]/g, "-");
      const suggestedName = `${safeName}${portable ? ".portable" : ""}.vdo`;
      await saveFileWithPicker(blob, suggestedName, {
        description: portable ? "Portable ViPlay Project (with media)" : "ViPlay Project File",
        accept: { "application/x-vdo": [".vdo"] },
      });
    } catch (err) {
      setError((err as Error).message || "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspace) return;
    setBusy(`Importing “${file.name}”…`);
    try {
      const imported = await importVDO(file, workspace);

      p.onOpen(imported.id);
      p.onRenamed(imported.id, imported.name);
    } catch (err) {
      setError((err as Error).message || "Import failed.");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const total = sortedProjects?.length ?? 0;
  const allSelected = total > 0 && selected.size === total;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="projects-panel"
      onClick={(e) =>
        picked &&
        !(e.target as HTMLElement).closest("[data-project]") &&
        setPicked(null)
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && picked) {
          e.stopPropagation();
          setPicked(null);
        }
      }}
    >
      {/* Header action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={p.onNew}
        >
          <Icon name="plus" className="size-4" /> New
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-secondary flex items-center gap-1.5 shrink-0"
          title="Import .VDO project package"
        >
          <Icon name="upload" className="size-3.5" />
          <span>Import .VDO</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".vdo,.VDO,application/x-vdo,application/x-VDO,application/zip"
          className="sr-only"
          onChange={(e) => void handleImportFile(e)}
        />
      </div>

      {/* View Switcher & Sort Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-line pb-2 text-xs">
        <div
          className="flex items-center gap-1 rounded-md border border-line bg-raised/50 p-0.5"
          role="group"
          aria-label="View mode"
        >
          <button
            type="button"
            className={`flex size-7 items-center justify-center rounded transition-colors ${view === "list" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
            onClick={() => changeView("list")}
            aria-label="List view"
            title="List view"
          >
            <Icon name="list" className="size-4" />
          </button>
          <button
            type="button"
            className={`flex size-7 items-center justify-center rounded transition-colors ${view === "grid" ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
            onClick={() => changeView("grid")}
            aria-label="Grid view"
            title="Grid view"
          >
            <Icon name="grid" className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Icon name="sort" className="size-3.5 text-muted shrink-0" />
          <select
            value={sort}
            onChange={(e) => changeSort(e.target.value as ProjectSort)}
            className="field h-7 min-h-0 w-auto py-0 pl-1.5 pr-5 text-xs text-ink bg-raised cursor-pointer shrink-0"
            aria-label="Sort projects"
          >
            <option value="date-desc">Recent</option>
            <option value="date-asc">Oldest</option>
            <option value="name">Name</option>
            <option value="duration">Duration</option>
          </select>
        </div>
      </div>

      {/* Batch Action Toolbar */}
      {total > 0 && (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            selected.size > 0
              ? "border-primary/50 bg-primary-soft/90 shadow-sm backdrop-blur"
              : "border-line/70 bg-raised/40 text-muted"
          }`}
          data-testid="projects-batch-bar"
        >
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="size-4 rounded border-line text-primary focus:ring-primary cursor-pointer"
              aria-label={
                selected.size > 0
                  ? "Deselect all projects"
                  : "Select all projects"
              }
            />
            <span
              className={`font-medium ${selected.size > 0 ? "text-ink" : "text-muted"}`}
            >
              {selected.size > 0
                ? `${selected.size} of ${total} selected`
                : "Select all"}
            </span>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-secondary min-h-0 size-7 p-0 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
              aria-label="Clear selection"
              title="Clear selection"
            >
              <Icon name="close" className="size-3.5" />
            </button>
            <button
              type="button"
              className={`btn min-h-0 size-7 p-0 flex items-center justify-center bg-danger text-white hover:bg-danger/90 disabled:pointer-events-none ${deletingBatch ? "disabled:opacity-80" : "disabled:opacity-30"}`}
              onClick={() => void deleteBatch()}
              disabled={selected.size === 0 || deletingBatch}
              aria-label={
                selected.size > 0
                  ? `Delete (${selected.size})`
                  : "Delete selected"
              }
              title={
                deletingBatch
                  ? "Deleting…"
                  : selected.size > 0
                    ? `Delete (${selected.size})`
                    : "Delete selected"
              }
              data-testid="delete-selected-projects"
            >
              {deletingBatch ? <Spinner size="xs" /> : <Icon name="trash" className="size-3.5" />}
            </button>
          </div>
        </div>
      )}

      {error && (
        <Notice
          tone="error"
          role="alert"
          actions={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setError(null)}
            >
              OK
            </button>
          }
        >
          {error}
        </Notice>
      )}
      {p.listError && <Notice tone="error">{p.listError}</Notice>}
      {busy && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-line bg-raised/60 px-3 py-2 text-xs text-muted" data-testid="projects-busy">
          <Spinner size="xs" className="text-primary" />
          <span className="truncate">{busy}</span>
        </div>
      )}

      {p.projects === null && !p.listError ? (
        <div aria-busy="true" data-testid="projects-loading">
          <span role="status" className="sr-only">
            Loading your projects…
          </span>
          {view === "grid" ? <SkeletonGrid n={4} /> : <SkeletonRows n={4} thumb />}
        </div>
      ) : sortedProjects && sortedProjects.length === 0 ? (
        <div
          className="flex flex-col items-center gap-1 px-3 py-6 text-center"
          data-testid="projects-empty"
        >
          <Icon name="projects" className="size-9 text-muted" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm text-muted">
            Upload a video. Your work is saved here automatically.
          </p>
        </div>
      ) : view === "grid" ? (
        /* GRID VIEW */
        <ul className="grid grid-cols-2 gap-2" data-testid="projects">
          {sortedProjects?.map((x) => {
            const current = x.id === p.currentId;
            const isChecked = selected.has(x.id);
            const isPicked = picked === x.id;
            const isSelected = isChecked || isPicked;
            return (
              <li
                key={x.id}
                data-project
                data-selected={isSelected ? "true" : undefined}
                className={`group/proj relative flex flex-col overflow-hidden rounded-lg border bg-raised transition-all ${
                  isChecked
                    ? "border-primary bg-primary-soft/20"
                    : isPicked
                      ? "border-primary bg-primary-soft/30"
                      : current
                        ? "border-primary/80 ring-1 ring-primary/60 bg-primary-soft/20"
                        : "border-line hover:border-line-hover"
                }`}
              >
                {/* Clean Thumbnail Card - 100% free of badges, duration pills, or checkboxes */}
                <div className="relative aspect-video w-full overflow-hidden bg-stage">
                  <button
                    type="button"
                    className="size-full text-left cursor-pointer focus:outline-none"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) {
                        toggleSelect(x.id);
                      } else {
                        setPicked((prev) => (prev === x.id ? null : x.id));
                      }
                    }}
                    onDoubleClick={() => !current && p.onOpen(x.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ project: x, x: e.clientX, y: e.clientY });
                    }}
                    aria-pressed={isPicked}
                    aria-label={current ? `${x.name} (open)` : `Open ${x.name}`}
                    aria-current={current || undefined}
                  >
                    <ProjectCover coverId={x.coverId} iconClass="size-6" />
                  </button>
                </div>

                {/* Details - Compact typography (11px title, 9px details) */}
                <div className="flex flex-col p-2 min-w-0 gap-0.5">
                  {editing === x.id ? (
                    <input
                      className="field h-6 min-h-0 px-1 text-[0.6875rem]"
                      aria-label="New project name"
                      value={draft}
                      maxLength={80}
                      autoFocus
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename(x.id);
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      onBlur={() => void rename(x.id)}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span
                        className="truncate text-[0.6875rem] font-semibold text-ink"
                        title={x.name}
                      >
                        {x.name}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 text-muted hover:bg-surface hover:text-ink focus-visible:opacity-100 transition-colors"
                        aria-label={`Options for ${x.name}`}
                        title="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenu({ project: x, x: r.left, y: r.bottom + 4 });
                        }}
                      >
                        <Icon name="more" className="size-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1 text-[0.5625rem] text-muted min-w-0">
                    <span className="truncate">
                      {current ? "Open now · " : ""}
                      {formatAgo(x.updatedAt)}
                      {x.duration > 0 ? ` · ${formatTime(x.duration)}` : ""}
                    </span>
                    {current && (
                      <span className="text-primary font-medium shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        /* LIST VIEW */
        <div
          className="flex flex-col gap-1 overflow-hidden"
          data-testid="projects-list"
        >
          {/* Table Header */}
          <div className="flex items-center gap-1.5 border-b border-line px-1.5 py-1 text-[0.625rem] font-semibold text-muted">
            <span className="w-3.5 shrink-0" />
            <span className="w-8 shrink-0">Item</span>
            <span className="min-w-0 flex-1">Name</span>
            <span className="w-10 shrink-0 text-right">Dur</span>
            <span className="w-11 shrink-0 text-center">Act</span>
          </div>

          <ul
            className="flex flex-col gap-0.5 divide-y divide-line/30"
            data-testid="projects"
          >
            {sortedProjects?.map((x) => {
              const current = x.id === p.currentId;
              const isChecked = selected.has(x.id);
              const isPicked = picked === x.id;
              const isSelected = isChecked || isPicked;
              return (
                <li
                  key={x.id}
                  data-project
                  data-selected={isSelected ? "true" : undefined}
                  className={`group/proj flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors ${
                    isChecked
                      ? "border-primary bg-primary-soft/80"
                      : isPicked
                        ? "border-primary bg-primary-soft/30"
                        : current
                          ? "border-primary bg-primary-soft/40 ring-1 ring-primary/50"
                          : "hover:bg-raised"
                  }`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ project: x, x: e.clientX, y: e.clientY });
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(x.id)}
                    className="size-3.5 shrink-0 rounded border-line text-primary focus:ring-primary cursor-pointer"
                    aria-label={`Select ${x.name}`}
                  />

                  {/* Dense Thumbnail (32×20px) */}
                  <button
                    type="button"
                    className="relative h-5 w-8 shrink-0 overflow-hidden rounded bg-stage cursor-pointer focus:outline-none"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) {
                        toggleSelect(x.id);
                      } else {
                        setPicked((prev) => (prev === x.id ? null : x.id));
                      }
                    }}
                    onDoubleClick={() => !current && p.onOpen(x.id)}
                    aria-pressed={isPicked}
                    aria-label={current ? `${x.name} (open)` : `Open ${x.name}`}
                    aria-current={current || undefined}
                  >
                    <ProjectCover coverId={x.coverId} iconClass="size-3" />
                  </button>

                  {/* Name & status */}
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    {editing === x.id ? (
                      <input
                        className="field h-5 min-h-0 w-full px-1 text-[0.6875rem]"
                        aria-label="New project name"
                        value={draft}
                        maxLength={80}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void rename(x.id);
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                        onBlur={() => void rename(x.id)}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className="truncate text-left text-[0.6875rem] font-medium text-ink hover:underline focus:outline-none"
                          title={`${x.name} · edited ${formatAgo(x.updatedAt)}`}
                          onClick={() => {
                            if (!current) p.onOpen(x.id);
                          }}
                        >
                          {x.name}
                        </button>
                        {current && (
                          <span className="shrink-0 rounded bg-primary/20 px-1 py-0.5 text-[9px] font-semibold text-primary">
                            Active
                          </span>
                        )}
                        {x.missing && (
                          <span className="text-[9px] text-danger">
                            Missing
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Duration */}
                  <span className="w-10 shrink-0 text-right text-[0.625rem] text-muted">
                    {x.duration > 0 ? formatTime(x.duration) : "—"}
                  </span>

                  {/* Actions */}
                  <div className="flex w-11 shrink-0 items-center justify-end gap-0.5">
                    {!current && (
                      <button
                        type="button"
                        onClick={() => p.onOpen(x.id)}
                        title="Open project"
                        aria-label={`Open ${x.name}`}
                        className="flex size-5 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink transition-colors"
                      >
                        <Icon name="play" className="size-2.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu({ project: x, x: r.left, y: r.bottom + 4 });
                      }}
                      title="More options"
                      aria-label={`Options for ${x.name}`}
                      className="flex size-5 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink transition-colors"
                    >
                      <Icon name="more" className="size-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Context Menu for Projects */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`Options for ${menu.project.name}`}
          onClose={() => setMenu(null)}
          items={[
            ...(menu.project.id !== p.currentId
              ? [
                  {
                    label: `Open ${menu.project.name}`,
                    shortcut: "Double-click",
                    onSelect: () => p.onOpen(menu.project.id),
                  },
                ]
              : []),
            {
              label: "Duplicate",
              onSelect: () => void duplicate(menu.project),
            },
            {
              label: "Rename",
              onSelect: () => {
                setDraft(menu.project.name);
                setEditing(menu.project.id);
              },
            },
            {
              label: selected.has(menu.project.id) ? "Deselect" : "Select",
              checked: selected.has(menu.project.id),
              onSelect: () => toggleSelect(menu.project.id),
            },
            "separator",
            { heading: "ViPlay Package" },
            {
              label: "Export Project (.VDO)",
              detail: "Metadata and local asset references",
              onSelect: () => void handleExport(menu.project, false),
            },
            {
              label: "Export Portable (.VDO)",
              detail: "Self-contained package with all media files",
              onSelect: () => void handleExport(menu.project, true),
            },
            "separator",
            {
              label: `Delete ${menu.project.name}`,
              onSelect: () => void del(menu.project),
            },
          ]}
        />
      )}
    </div>
  );
}

/**
 * A project's picture: its first video's thumbnail (a file still uploading: the frame taken in the browser,
 * lib/media/localMedia); the film icon when there's none or it can't be loaded (a file no longer on the server).
 */
function ProjectCover({ coverId, iconClass }: { coverId: string | null; iconClass: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!coverId || failed === coverId)
    return (
      <div className="flex size-full items-center justify-center text-muted">
        <Icon name="film" className={`${iconClass} opacity-40`} />
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={localThumb(coverId) ?? `/api/videos/${coverId}/thumb`}
      alt=""
      className="size-full object-cover pointer-events-none"
      loading="lazy"
      draggable={false}
      onError={() => setFailed(coverId)}
    />
  );
}
