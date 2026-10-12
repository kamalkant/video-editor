"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import type { VideoMeta } from "@/lib/api/types";
import { formatTime } from "@/lib/format";
import type { LibraryItem } from "@/lib/library";

type Tab = "music" | "broadcast" | "sfx" | "uploads" | "folder";

/**
 * Audio (rail panel): background music and sound effects — a starter set
 * made on this Mac, plus your own music folder. Play to listen; "+" adds it
 * at the playhead. Voiceover and text to speech are one click away too.
 */
export function AudioLibraryPanel({ onAdd, onRecordVoice, onTts }: { onAdd: (v: VideoMeta) => void; onRecordVoice: () => void; onTts: () => void }) {
  const [tab, setTab] = useState<Tab>("music");
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/library", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Couldn't load the library.");
      setItems(j.items);
      setFolder(j.folder);
      setPath((p) => p || (j.folder ?? ""));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => audio.current?.pause();
  }, [load]);

  const play = (id: string) => {
    audio.current?.pause();
    if (playing === id) return setPlaying(null);
    const a = new Audio(`/api/library/${id}/audio`);
    a.onended = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
    audio.current = a;
    setPlaying(id);
  };
  const add = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/library/${id}/add`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Couldn't add it.");
      onAdd(j as VideoMeta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const chooseFolder = async () => {
    setBusy("folder");
    setError(null);
    try {
      const r = await fetch("/api/library/folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: path.trim() || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Couldn't read that folder.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const list = (items ?? []).filter((x) => {
    if (tab === "folder") return x.source === "folder";
    if (tab === "uploads") return x.source === "upload";
    if (tab === "broadcast") return x.id.startsWith("broadcast-");
    if (tab === "sfx") return x.source === "starter" && x.kind === "sfx";
    return x.source === "starter" && x.kind === "music";
  });
  const moods = [...new Set(list.map((x) => x.mood))].sort();
  const shown = list.filter((x) => (!mood || x.mood === mood) && (!q.trim() || `${x.title} ${x.artist ?? ""} ${x.mood}`.toLowerCase().includes(q.trim().toLowerCase())));
  const tabBtn = (id: Tab, icon: IconName, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-label={label}
      title={label}
      aria-selected={tab === id}
      onClick={() => (setTab(id), setMood(null))}
      className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors ${tab === id ? "bg-primary font-semibold text-white shadow-xs" : "text-muted hover:bg-raised hover:text-ink"}`}
    >
      <Icon name={icon} className="size-4" />
    </button>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="audio-library">
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" className="btn btn-secondary text-xs" onClick={onRecordVoice}>
          <Icon name="mic" className="size-3.5" /> Record voiceover
        </button>
        <button type="button" className="btn btn-secondary text-xs" onClick={onTts}>
          <Icon name="voice" className="size-3.5" /> Text to speech
        </button>
      </div>
      <div role="tablist" aria-label="Library" className="flex gap-0.5 rounded-lg bg-canvas p-0.5">
        {tabBtn("music", "audio", "Music")}
        {tabBtn("broadcast", "broadcast", "News & Themes")}
        {tabBtn("sfx", "effects", "Sound FX")}
        {tabBtn("uploads", "upload", "My uploads")}
        {tabBtn("folder", "folderOpen", "My folder")}
      </div>
      {tab === "uploads" && <p className="text-[0.6875rem] text-muted">Sounds you added to your templates (Video Templates → Create template) or uploaded there.</p>}
      {tab === "folder" && (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Your music folder (full path)</span>
            <input className="field" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/Music/Library" aria-label="Music folder path" />
          </label>
          <button type="button" className="btn btn-secondary text-xs" onClick={() => void chooseFolder()} disabled={busy === "folder"}>
            {busy === "folder" && <Spinner size="xs" />}
            {busy === "folder" ? "Reading the folder…" : folder ? "Read it again" : "Use this folder"}
          </button>
          <p className="text-[0.6875rem] text-muted">Only music you own or have a licence for. Files stay where they are; adding one copies it into My Assets.</p>
        </div>
      )}
      <input className="field" type="search" placeholder="Search…" aria-label="Search the library" value={q} onChange={(e) => setQ(e.target.value)} />
      {moods.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Mood">
          {[null, ...moods].map((m) => (
            <button key={m ?? "all"} type="button" aria-pressed={mood === m} onClick={() => setMood(m)} className={`rounded-md px-2 py-0.5 text-[0.6875rem] ${mood === m ? "bg-primary text-white" : "bg-raised text-muted hover:text-ink"}`}>
              {m ?? "All"}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {!items ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            Getting the sounds ready…
          </span>
          <SkeletonRows n={5} thumb />
        </div>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Sounds">
          {shown.map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
              <button type="button" onClick={() => play(x.id)} aria-label={playing === x.id ? `Stop ${x.title}` : `Listen to ${x.title}`} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised hover:bg-primary-soft">
                <Icon name={playing === x.id ? "pause" : "play"} className="size-3.5" />
              </button>
              <span className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-sm font-medium">{x.title}</span>
                  {(x.artist === "Uploaded Audio" || x.source === "upload" || x.id.includes("-user-") || x.id.includes("-custom-")) && (
                    <span className="rounded bg-primary/10 border border-primary/20 px-1 py-0.2 text-[0.5625rem] font-bold text-primary shrink-0">
                      Uploaded
                    </span>
                  )}
                </div>
                <span className="truncate text-[0.6875rem] text-muted">
                  {x.mood}
                  {x.artist && x.artist !== "Uploaded Audio" && x.source !== "upload" ? ` · ${x.artist}` : ""} · {formatTime(x.duration)}
                </span>
              </span>
              <button type="button" onClick={() => void add(x.id)} disabled={busy === x.id} aria-label={`Add ${x.title} at the playhead`} className="flex size-8 shrink-0 items-center justify-center rounded-md text-link hover:bg-raised disabled:opacity-50">
                {busy === x.id ? <Spinner size="sm" /> : <Icon name="plus" className="size-4" />}
              </button>
            </li>
          ))}
          {!shown.length && <li className="text-xs text-muted">{tab === "folder" && !folder ? "Choose a folder above." : "Nothing matches."}</li>}
        </ul>
      )}
    </div>
  );
}
