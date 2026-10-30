"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { VoiceSearchMic } from "@/components/ui/VoiceSearchMic";
import {
  pushRecent,
  searchCommands,
  type Command,
} from "@/lib/editor/commands";

const RECENT_KEY = "VDO:recent-commands";
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
};
const saveRecent = (r: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  } catch {
    /* private window: not remembered */
  }
};

function Body({
  commands,
  onClose,
  autoStartVoice,
}: {
  commands: Command[];
  onClose: () => void;
  autoStartVoice?: boolean;
}) {
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [active, setActive] = useState(0);
  const id = useId();
  const list = searchCommands(commands, q, recent);
  const typed = q.trim().length > 0;
  const nRecent = typed
    ? 0
    : recent.filter((r) => commands.some((c) => c.id === r)).slice(0, 5).length;
  const cur = list[Math.min(active, list.length - 1)];
  const optId = (i: number) => `${id}-o${i}`;
  useEffect(() => {
    document
      .getElementById(`${id}-o${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  const run = (c: Command | undefined) => {
    if (!c?.run) return;
    const r = pushRecent(recent, c.id);
    setRecent(r);
    saveRecent(r);
    onClose();
    // (after the palette has closed and given the focus back)
    const go = c.run;
    setTimeout(go, 0);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!list.length) return;
      setActive(
        (a) =>
          (Math.min(a, list.length - 1) +
            (e.key === "ArrowDown" ? 1 : list.length - 1)) %
          list.length,
      );
    } else if (e.key === "Home" && e.ctrlKey) setActive(0);
    else if (e.key === "Enter") {
      e.preventDefault();
      run(cur);
    } else if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onClose();
    }
  };

  // sections: the recent picks, then each group in order (typed: best first, in one list)
  const heading = (i: number): string | null => {
    if (typed) return i === 0 ? "Best matches" : null;
    if (i < nRecent) return i === 0 ? "Recent" : null;
    const g = list[i].group;
    return i === nRecent || list[i - 1].group !== g ? g : null;
  };

  return (
    <div className="flex max-h-[min(70dvh,34rem)] flex-col" onKeyDown={onKey}>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Icon name="search" className="size-5 text-muted shrink-0" />
        <input
          autoFocus
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          placeholder="Search tools, panels and projects…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          role="combobox"
          aria-label="Search tools"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={cur ? optId(list.indexOf(cur)) : undefined}
          aria-autocomplete="list"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setActive(0);
              }}
              className="rounded p-1 text-muted hover:text-ink hover:bg-raised/60 transition-colors"
              aria-label="Clear search"
            >
              <Icon name="x" className="size-4" />
            </button>
          )}
          <VoiceSearchMic
            size="sm"
            autoStart={autoStartVoice}
            onTranscript={(transcript) => {
              setQ(transcript);
              setActive(0);
            }}
          />
          <kbd className="max-sm:hidden">Esc</kbd>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted" role="status">
          Nothing found for “{q.trim()}”.
        </p>
      ) : (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Results"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {list.map((c, i) => {
            const h = heading(i);
            const on = c === cur;
            return (
              <li key={c.id} role="presentation">
                {h && (
                  <div
                    role="presentation"
                    className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {h}
                  </div>
                )}
                <div
                  id={optId(i)}
                  role="option"
                  aria-selected={on}
                  aria-disabled={!c.run || undefined}
                  data-testid="search-option"
                  onPointerMove={() => active !== i && setActive(i)}
                  onClick={() => run(c)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${on ? "bg-primary-soft" : ""} ${c.run ? "" : "cursor-not-allowed"}`}
                >
                  <Icon
                    name={c.icon}
                    className={`size-4 ${c.run ? "text-muted" : "text-muted opacity-50"}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate ${c.run ? "" : "text-muted"}`}>
                      {c.label}
                    </span>
                    {(on || !c.run) && c.hint && (
                      <span className="truncate text-xs text-muted">
                        {c.hint}
                      </span>
                    )}
                  </span>
                  {typed && (
                    <span className="shrink-0 text-2xs text-muted">
                      {c.group}
                    </span>
                  )}
                  {c.keys && <kbd className="shrink-0">{c.keys}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex gap-3 border-t border-line px-3 py-1.5 text-2xs text-muted max-sm:hidden">
        <span>↑ ↓ to move</span>
        <span>Enter to use</span>
        <span>Esc to close</span>
      </p>
    </div>
  );
}

/**
 * Search tools (⌘K): type what you want to do (a tool, a panel, a project,
 * export…) and press Enter. Tools that can't be used now say why.
 */
export function SearchPalette({
  open,
  onClose,
  commands,
  autoStartVoice,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  autoStartVoice?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Search tools"
      data-testid="search-palette"
      className="VDO-dialog mx-auto mt-[12dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-hidden rounded-xl border border-control bg-surface p-0 text-ink shadow-2xl"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && <Body commands={commands} onClose={onClose} autoStartVoice={autoStartVoice} />}
    </dialog>
  );
}
