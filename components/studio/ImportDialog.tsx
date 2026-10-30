"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import type { VideoMeta } from "@/lib/api/types";
import { runTask } from "@/lib/editor/tasks";
import { openAiSettings } from "@/lib/editor/useGemini";
import { formatTime } from "@/lib/format";
import {
  SOURCE_NAME,
  type ImportItem,
  type ImportSource,
  type SearchPage,
  type Shape,
} from "@/lib/import/types";

export type ImportTab = "computer" | ImportSource;
const TABS: { id: ImportTab; label: string; icon: IconName; hint: string }[] = [
  {
    id: "computer",
    label: "My computer",
    icon: "upload",
    hint: "Videos, pictures and music from this computer",
  },
  {
    id: "pixabay",
    label: "Pixabay",
    icon: "video",
    hint: "Free stock videos (free to use)",
  },
];

type Job = {
  id: string;
  state: "working" | "ready" | "failed";
  percent: number;
  error?: string;
  media?: VideoMeta | null;
};

/** Poll an import until it's done. */
async function waitFor(
  jobId: string,
  onPercent: (p: number) => void,
): Promise<VideoMeta> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 700));
    const r = await fetch(`/api/import/jobs/${jobId}`, { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as Job | null;
    if (!r.ok || !j) throw new Error("The import stopped. Try again.");
    if (j.state === "failed")
      throw new Error(j.error ?? "The import didn't work.");
    if (j.state === "ready" && j.media) return j.media;
    onPercent(j.percent);
  }
}

/** One library tab: search, results, and importing the chosen one. */
function LibraryTab({
  source,
  projectShape,
  onImported,
  onReopen,
}: {
  source: ImportSource;
  projectShape: Shape;
  onImported: (m: VideoMeta, add: boolean) => void;
  /** open this tab again (a click on the import in the top bar's background tasks) */
  onReopen: () => void;
}) {
  const [q, setQ] = useState("");
  const [shape, setShape] = useState<Shape>(projectShape);
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<{ text: string; key: boolean } | null>(
    null,
  );
  const [picked, setPicked] = useState<ImportItem | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const lastQ = useRef("");

  const search = async (more = false) => {
    const query = more ? lastQ.current : q.trim();
    if (!query) return;
    lastQ.current = query;
    setSearching(true);
    setError(null);
    try {
      const u = new URLSearchParams({
        source,
        q: query,
        page: more && next ? next : "1",
        shape,
      });
      const r = await fetch(`/api/import/search?${u}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const code = j?.error?.code;
        setError({
          text: j?.error?.message ?? "The search didn't work.",
          key: code === "no_key" || code === "key_refused",
        });
        return;
      }
      const page = j as SearchPage;
      setItems((old) => (more && old ? [...old, ...page.items] : page.items));
      setNext(page.next);
      if (!more) setPicked(null);
    } catch {
      setError({
        text: "The search didn't work. Check the internet connection.",
        key: false,
      });
    } finally {
      setSearching(false);
    }
  };

  const doImport = async (add: boolean) => {
    if (!picked) return;
    setBusy(0);
    setError(null);
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          id: picked.id,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok)
        throw new Error(j?.error?.message ?? "The import didn't start.");
      // (listed in the top bar's background tasks: it keeps going if this window closes)
      const media = await runTask({ id: `import:${j.id}`, kind: "import", label: `Importing from ${SOURCE_NAME[source]}`, detail: picked.title, percent: 0 }, onReopen, (task) =>
        waitFor(j.id, (pc) => {
          setBusy(pc);
          task.update({ percent: pc });
        }),
      );
      setDone((d) => ({ ...d, [picked.id]: true }));
      onImported(media, add);
    } catch (e) {
      setError({ text: (e as Error).message, key: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-col gap-3"
      data-testid={`import-${source}`}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-control bg-raised px-2.5 focus-within:border-primary">
          {searching ? <Spinner size="sm" className="text-primary" /> : <Icon name="search" className="size-4 text-muted" />}
          <input
            aria-busy={searching}
            className="min-h-hit min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${SOURCE_NAME[source]} videos, e.g. “city at night”`}
            aria-label={`Search ${SOURCE_NAME[source]}`}
          />
        </label>
        <div
            className="flex gap-0.5 rounded-lg border border-line p-0.5"
            role="radiogroup"
            aria-label="Shape"
          >
            {(
              [
                ["any", "Any"],
                ["landscape", "Wide"],
                ["portrait", "Tall"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={shape === id}
                onClick={() => setShape(id)}
                className={`rounded-md px-2 py-1 text-xs ${shape === id ? "bg-primary-soft font-semibold text-ink" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
        </div>
        <button
          type="submit"
          className="btn btn-primary px-4"
          disabled={searching || !q.trim()}
        >
          {searching ? (
            <>
              <Spinner size="xs" /> Searching…
            </>
          ) : (
            "Search"
          )}
        </button>
      </form>

      {error && (
        <Notice
          tone={error.key ? "info" : "error"}
          role="alert"
          title={error.key ? `Add your ${SOURCE_NAME[source]} key` : undefined}
        >
          {error.text}
          {error.key && (
            <button
              type="button"
              className="btn btn-primary mt-2 min-h-0 px-3 py-1.5 text-xs"
              onClick={openAiSettings}
            >
              <Icon name="settings" className="size-3.5" /> Open API keys
            </button>
          )}
        </Notice>
      )}

      {searching && !items?.length && <SkeletonGrid n={8} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" />}
      {items && !items.length && !searching && (
        <p className="py-6 text-center text-sm text-muted">
          Nothing found. Try other words.
        </p>
      )}
      {items && items.length > 0 && (
        <ul
          className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4"
          aria-label="Results"
          data-testid="import-results"
        >
          {items.map((it) => {
            const on = picked?.id === it.id;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? null : it)}
                  onDoubleClick={() => (setPicked(it), void doImport(true))}
                  className={`flex w-full flex-col overflow-hidden rounded-lg border text-left ${on ? "border-link ring-2 ring-link" : "border-line hover:border-control"}`}
                  title={`${it.title} · by ${it.author}`}
                >
                  <span className="relative block aspect-video w-full bg-stage">
                    {it.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element -- served by our own proxy
                      <img
                        src={it.thumb}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-2xs text-white">
                      {formatTime(it.duration)}
                    </span>
                    {done[it.id] && (
                      <span className="absolute right-1 top-1 flex size-4.5 items-center justify-center rounded bg-primary text-white">
                        <Icon name="check" className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="px-1.5 py-1">
                    <span className="block truncate text-xs font-medium">
                      {it.title}
                    </span>
                    <span className="block truncate text-2xs text-muted">
                      {it.author}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {next && (
            <li className="col-span-full flex justify-center">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => void search(true)}
                disabled={searching}
              >
                {searching && <Spinner size="xs" />}
                Load more
              </button>
            </li>
          )}
        </ul>
      )}

      {picked && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-line bg-canvas p-3"
          data-testid="import-picked"
        >
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs">
              <strong>{picked.title}</strong> · {formatTime(picked.duration)} ·
              by{" "}
              {picked.authorUrl ? (
                <a
                  className="text-link underline"
                  href={picked.authorUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {picked.author}
                </a>
              ) : (
                picked.author
              )}{" "}
              on{" "}
              <a
                className="text-link underline"
                href={picked.pageUrl}
                target="_blank"
                rel="noreferrer"
              >
                {SOURCE_NAME[source]}
              </a>
              {" · free to use"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void doImport(true)}
              >
                {busy !== null ? <Spinner size="sm" /> : <Icon name="plus" className="size-4" />}
                {busy !== null ? `Importing… ${busy}%` : "Add to timeline"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={() => void doImport(false)}
              >
                Save to My Assets
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-2xs text-muted h-[400px]">
        {`Uses your free ${SOURCE_NAME[source]} key.`}{" "}
        <button
          type="button"
          className="text-link underline"
          onClick={openAiSettings}
        >
          API keys
        </button>
      </p>
    </div>
  );
}

/** Import (Add media): from this computer, or search Pexels and Pixabay and bring a clip in. */
export function ImportDialog(p: {
  open: boolean;
  onClose: () => void;
  tab: ImportTab;
  onTab: (t: ImportTab) => void;
  projectShape: Shape;
  onChooseFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onImported: (m: VideoMeta, add: boolean) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <Dialog open={p.open} onClose={p.onClose} title="Import" size="lg">
      <div className="flex flex-col gap-3" data-testid="import-dialog">
        <div
          role="tablist"
          aria-label="Import from"
          className="flex flex-wrap gap-1 border-b border-line pb-2"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={p.tab === t.id}
              onClick={() => p.onTab(t.id)}
              title={t.hint}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${p.tab === t.id ? "bg-primary-soft font-semibold text-ink" : "text-muted hover:bg-raised hover:text-ink"}`}
            >
              <Icon name={t.icon} className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
        {p.tab === "computer" ? (
          <div
            className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center ${over ? "border-primary bg-primary-soft" : "border-control"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const files = [...e.dataTransfer.files];
              if (files.length) p.onDropFiles(files);
            }}
          >
            <Icon name="upload" className="size-9 text-link" />
            <p className="font-medium">Drag &amp; drop files here</p>
            <p className="text-xs text-muted">
              Videos, pictures and music from this computer
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={p.onChooseFiles}
            >
              Choose files
            </button>
          </div>
        ) : (
          <LibraryTab
            key={p.tab}
            source={p.tab}
            projectShape={p.projectShape}
            onImported={p.onImported}
            onReopen={() => p.onTab(p.tab)}
          />
        )}
      </div>
    </Dialog>
  );
}
