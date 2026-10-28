"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "../api/types";
import type { TimelineDoc } from "../edit/doc";
import { newProject, type Project } from "./model";
import { localWorkspaceManager } from "../storage/workspace";
import type { RecoverySnapshot } from "../storage/types";

export type ProjectRef = { id: string; name: string };
export type SaveState = "idle" | "saving" | "saved" | "error";
type Patch = { name?: string; doc?: TimelineDoc; jobId?: string | null };

const DEBOUNCE_MS = 600;

/**
 * Keeps the open project saved locally in the Account Workspace and synced to server.
 * Handles debounced autosaving, dirty state tracking, and crash recovery snapshot detection.
 */
export function useProjectSync(initial: ProjectRef | null, onChange?: () => void) {
  const [project, setProject] = useState<ProjectRef | null>(initial);
  const [saveState, setSaveState] = useState<SaveState>(initial ? "saved" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<RecoverySnapshot | null>(null);

  const ref = useRef<ProjectRef | null>(initial);
  const pending = useRef<Patch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const creating = useRef<Promise<ProjectRef | null> | null>(null);
  const lastCreate = useRef<[TimelineDoc, string | null, string] | null>(null);
  const changed = useRef(onChange);

  useEffect(() => {
    changed.current = onChange;
  });

  const setRef = (p: ProjectRef | null) => {
    ref.current = p;
    setProject(p);
  };

  // Detect newer crash recovery version when opening a project
  useEffect(() => {
    const checkRecovery = async () => {
      if (!initial?.id) return;
      const ws = localWorkspaceManager.getActiveWorkspace();
      if (!ws) return;
      try {
        const localProj = await ws.getProject(initial.id);
        const recovery = await ws.getRecovery(initial.id);
        if (recovery && localProj && recovery.savedAt > localProj.updatedAt + 1500) {
          setPendingRecovery(recovery);
        }
      } catch {
        // Ignore recovery check error
      }
    };
    void checkRecovery();
  }, [initial?.id]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;

    // one save at a time; loop while edits arrived during the last save
    for (;;) {
      if (inFlight.current) {
        await inFlight.current;
        continue;
      }
      const p = ref.current;
      const patch = pending.current;
      if (!p || !patch) return;
      pending.current = null;
      setSaveState("saving");
      let ok = false;

      const run = (async () => {
        try {
          // 1. Local-first workspace save
          const ws = localWorkspaceManager.getActiveWorkspace();
          if (ws) {
            const currentProj = await ws.getProject(p.id);
            if (currentProj) {
              const updatedProj: Project = {
                ...currentProj,
                name: patch.name !== undefined ? patch.name : currentProj.name,
                doc: patch.doc !== undefined ? patch.doc : currentProj.doc,
                jobId: patch.jobId !== undefined ? patch.jobId : currentProj.jobId,
                updatedAt: Date.now(),
              };
              await ws.saveProject(updatedProj);
              // Save crash recovery snapshot
              await ws.saveRecovery(p.id, updatedProj.name, updatedProj.doc);
            }
          }

          // Local-first device storage (no server disk pollution for working projects)

          if (patch.name && ref.current?.id === p.id) {
            setRef({ id: p.id, name: patch.name });
          }

          ok = true;
          setError(null);
          setSaveState(pending.current ? "saving" : "saved");
          changed.current?.();
        } catch (e) {
          // keep the changes; the next edit (or Retry) tries again
          pending.current = { ...patch, ...pending.current };
          setError((e as Error).message || "Couldn't save locally.");
          setSaveState("error");
        }
      })();

      inFlight.current = run;
      await run;
      inFlight.current = null;
      if (!ok || ref.current?.id !== p.id) return;
    }
  }, []);

  /** Queue a change; it's saved shortly after the last edit. */
  const save = useCallback(
    (patch: Patch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      if (!ref.current) return; // saved once the project exists
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  /** Make a project for a timeline that isn't in one yet. */
  const create = useCallback(
    (doc: TimelineDoc, jobId?: string | null, projectName = "Untitled project"): Promise<ProjectRef | null> => {
      if (creating.current) return creating.current;
      lastCreate.current = [doc, jobId ?? null, projectName];
      setSaveState("saving");

      const run = (async () => {
        try {
          const now = Date.now();
          const pId = crypto.randomUUID();
          const name = projectName;

          // 1. Save in local-first workspace
          const ws = localWorkspaceManager.getActiveWorkspace();
          if (ws) {
            const newP = newProject({ id: pId, name, doc, now, jobId });
            await ws.saveProject(newP);
            await ws.saveRecovery(pId, name, doc);
          }

          const r: ProjectRef = { id: pId, name };
          setRef(r);
          setError(null);
          setSaveState("saved");
          changed.current?.();

          // edits made while it was being created
          if (pending.current) void flush();
          return r;
        } catch (e) {
          setError((e as Error).message || "Couldn't create the project.");
          setSaveState("error");
          return null;
        } finally {
          creating.current = null;
        }
      })();

      creating.current = run;
      return run;
    },
    [flush],
  );

  const rename = useCallback(
    (name: string) => {
      if (!ref.current) return;
      setRef({ ...ref.current, name });
      save({ name }, true);
    },
    [save],
  );

  /** Save what's left (unless it was deleted), then leave the project (e.g. "New project"). */
  const detach = useCallback(async (saveFirst = true) => {
    if (timer.current) clearTimeout(timer.current);
    if (saveFirst) await flush();
    pending.current = null;
    lastCreate.current = null;
    setRef(null);
    setError(null);
    setSaveState("idle");
    setPendingRecovery(null);
  }, [flush]);

  /** The project was renamed or deleted elsewhere (the Projects panel). */
  const renamedElsewhere = useCallback((id: string, name: string) => {
    if (ref.current?.id === id) setRef({ id, name });
  }, []);

  /** Attach to an existing project (e.g. opened from local workspace or imported ViPlay) */
  const attach = useCallback((target: ProjectRef) => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    lastCreate.current = null;
    ref.current = target;
    setRef(target);
    setError(null);
    setSaveState("idle");
    setPendingRecovery(null);
  }, []);

  const dismissRecovery = useCallback(() => {
    setPendingRecovery(null);
  }, []);

  const clearRecovery = useCallback(async () => {
    if (ref.current?.id) {
      const ws = localWorkspaceManager.getActiveWorkspace();
      await ws?.clearRecovery(ref.current.id);
    }
    setPendingRecovery(null);
  }, []);

  // Unsaved changes are preserved in local device recovery snapshot when tab closes
  useEffect(() => {
    const handlePageHide = () => {
      if (pending.current && ref.current) {
        const ws = localWorkspaceManager.getActiveWorkspace();
        if (ws && pending.current.doc) {
          void ws.saveRecovery(ref.current.id, ref.current.name, pending.current.doc);
        }
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (timer.current) clearTimeout(timer.current);
      handlePageHide();
    };
  }, []);

  const retry = useCallback(() => {
    if (ref.current) void flush();
    else if (lastCreate.current) void create(...lastCreate.current);
  }, [flush, create]);

  return {
    project,
    saveState,
    error,
    save,
    create,
    rename,
    detach,
    attach,
    flush,
    retry,
    renamedElsewhere,
    pendingRecovery,
    dismissRecovery,
    clearRecovery,
  };
}
