"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatTime } from "@/lib/format";
import type { VersionSummary } from "@/lib/projects/versionList";
import { localWorkspaceManager } from "@/lib/storage/workspace";

export type VersionsProps = {
  projectId: string | null;
  /** save the latest change first (then the version copies the saved project) */
  flush: () => Promise<void>;
  /** put a version back on the timeline (after the confirm) */
  onRestore: (v: VersionSummary) => Promise<void>;
};

const when = (t: number) => new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** This browser's account storage, where the project and its versions are kept. */
function workspace() {
  const ws = localWorkspaceManager.getActiveWorkspace();
  if (!ws) throw new Error("Your storage in this browser isn't open yet. Try again in a moment.");
  return ws;
}

/** The project's saved versions (null while loading); `load` reads them again. */
function useVersions(projectId: string | null, onError: (message: string) => void) {
  const [list, setList] = useState<VersionSummary[] | null>(null);
  const [round, setRound] = useState(0);
  const errRef = useRef(onError);
  useEffect(() => {
    errRef.current = onError;
  });
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    void (async () => {
      try {
        const versions = await workspace().listVersions(projectId);
        if (alive) setList(versions);
      } catch (e) {
        if (alive) errRef.current((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, round]);
  return { list, load: () => setRound((n) => n + 1) };
}

/** Save a version now; the saved ones, newest first, to restore or delete. */
export function VersionsList({ projectId, flush, onRestore, onDone }: VersionsProps & { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const { list, load } = useVersions(projectId, setError);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "primary";
    action: () => Promise<void>;
  } | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  // (after every hook: a project that appears while this is open mustn't change their order)
  if (!projectId) return <p className="text-xs text-muted">Add a clip first: then you can save versions of the project.</p>;

  const next = `Version ${(list ?? []).filter((v) => !v.auto).length + 1}`;
  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      await flush();
      const v = await workspace().saveVersion(projectId, { name: name.trim() || undefined });
      setName("");
      setSaved(v.name);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const restore = (v: VersionSummary) => {
    setConfirmModal({
      title: "Restore Version",
      message: `Restore “${v.name}”? What you have now is saved as a version first, and ⌘Z undoes this.`,
      confirmLabel: "Restore",
      variant: "primary",
      action: async () => {
        setModalBusy(true);
        setBusy(v.id);
        setError(null);
        try {
          await onRestore(v);
          onDone?.();
        } catch (e) {
          setError((e as Error).message);
          load();
        } finally {
          setBusy(null);
          setModalBusy(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const remove = (v: VersionSummary) => {
    setConfirmModal({
      title: "Delete Version",
      message: `Delete the version “${v.name}”? This can't be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
      action: async () => {
        setModalBusy(true);
        setBusy(v.id);
        try {
          await workspace().deleteVersion(projectId, v.id);
          load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(null);
          setModalBusy(false);
          setConfirmModal(null);
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="versions">
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-muted">
          Save a version
          <input className="field h-8 min-h-0 px-2 text-sm" value={name} maxLength={80} placeholder={next} onChange={(e) => setName(e.target.value)} aria-label="Version name" />
        </label>
        <button type="submit" className="btn btn-primary min-h-8 px-3 text-xs" disabled={!!busy}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </form>
      <p className="text-[0.6875rem] text-muted" aria-live="polite">
        {saved ? `✓ Saved “${saved}”.` : "A copy of the project as it is now, to come back to later."}
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <h3 className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Saved versions</h3>
      {list === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted">No versions yet. Save one before a big change so you can go back to it.</p>
      ) : (
        <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto" aria-label="Saved versions">
          {list.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-raised" data-testid="version">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="truncate font-medium">{v.name}</span>
                  {v.auto && <span className="shrink-0 rounded bg-soon px-1 text-[0.625rem] text-muted">automatic</span>}
                </span>
                <span className="truncate text-[0.6875rem] text-muted">
                  {when(v.createdAt)} · {formatTime(v.duration)} · {v.clips} {v.clips === 1 ? "clip" : "clips"}
                  {v.missing > 0 && <span className="text-warn-ink"> · {v.missing === 1 ? "a video is missing" : `${v.missing} videos are missing`}</span>}
                </span>
              </span>
              <button type="button" className="btn btn-secondary min-h-7 px-2 text-[0.6875rem]" disabled={!!busy || v.clips === 0} title={v.clips === 0 ? "Its videos were deleted" : undefined} onClick={() => void restore(v)} aria-label={`Restore ${v.name}`}>
                {busy === v.id ? "…" : "Restore"}
              </button>
              <button type="button" className="flex size-7 items-center justify-center rounded text-muted hover:bg-canvas hover:text-danger disabled:opacity-40" disabled={!!busy} onClick={() => void remove(v)} aria-label={`Delete ${v.name}`} title="Delete this version">
                <Icon name="trash" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Confirmation modal for restore/delete */}
      <ConfirmDialog
        open={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel}
        variant={confirmModal?.variant}
        busy={modalBusy}
        onClose={() => {
          if (!modalBusy) setConfirmModal(null);
        }}
        onConfirm={async () => {
          if (confirmModal) await confirmModal.action();
        }}
      />
    </div>
  );
}

/** Top bar: Save a version (a popover with the list). */
export function VersionsMenu(p: VersionsProps & { className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      label="Versions"
      open={open}
      onOpenChange={setOpen}
      disabled={!p.projectId}
      buttonLabel="Save a version"
      tip={p.projectId ? "Save a version: a copy to come back to" : "Add a clip first, then save versions"}
      buttonClassName={`${p.className} ${open ? "bg-raised text-ink" : ""}`}
      panelClassName="w-80 p-3"
      align="right"
      button={<Icon name="history" className="size-5" />}
    >
      <VersionsList {...p} onDone={() => setOpen(false)} />
    </Popover>
  );
}

/** The same list in a dialog (from the project menu, on any screen). */
export function VersionsDialog(p: VersionsProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={p.open} onClose={p.onClose} title="Versions">
      <VersionsList {...p} onDone={p.onClose} />
    </Dialog>
  );
}
