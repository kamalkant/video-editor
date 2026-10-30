"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Switch } from "@/components/ui/Switch";
import { PROVIDER_GROUPS, PROVIDERS, type Provider, type ProviderId, type ProviderStatus } from "@/lib/ai/providers";
import { refreshGemini } from "@/lib/editor/useGemini";

async function send(method: "PUT" | "DELETE", body: { provider: ProviderId; key?: string; enabled?: boolean }): Promise<ProviderStatus[]> {
  const r = await fetch(method === "DELETE" ? `/api/ai/keys?provider=${body.provider}` : "/api/ai/keys", { method, headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? "Couldn't change the key.");
  return j.providers as ProviderStatus[];
}

/** One AI service: its key (add / replace / remove) and an on/off switch for its features. */
function ProviderCard({ p, s, onStatus }: { p: Provider; s: ProviderStatus | undefined; onStatus: (l: ProviderStatus[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const has = !!s?.hasKey;
  const on = s?.enabled !== false;
  const run = async (fn: () => Promise<ProviderStatus[]>, done?: string) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      onStatus(await fn());
      if (p.id === "gemini") await refreshGemini();
      if (done) setSaved(done);
      setEditing(false);
      setKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const status = !has ? { text: "No key", cls: "bg-raised text-muted" } : !on ? { text: "Switched off", cls: "bg-warn-soft text-warn-ink" } : { text: `Connected · ••••${s?.last4 ?? ""}`, cls: "bg-success-soft text-success" };

  return (
    <section aria-labelledby={`ai-${p.id}`} className="flex flex-col gap-2.5 rounded-lg border border-line p-3" data-testid={`ai-provider-${p.id}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 id={`ai-${p.id}`} className="text-sm font-semibold">
          {p.name}
        </h3>
        {!p.ready && <span className="soon">Soon</span>}
        <span className={`rounded px-1.5 py-px text-2xs font-medium ${status.cls}`} data-testid="ai-provider-status">
          {status.text}
        </span>
        {has && (
          <span className="ml-auto">
            <Switch label={`${p.name} features`} hideLabel compact checked={on} disabled={busy} onCheckedChange={(v) => void run(() => send("PUT", { provider: p.id, enabled: v }), v ? "Switched on." : "Switched off: its features are hidden behind “switched off” until you turn it on.")} />
          </span>
        )}
      </header>
      <p className="text-xs text-muted">
        {p.ready ? "Used for: " : "Coming: "}
        {p.uses}.
      </p>
      {has && !editing ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">{s?.source === "env" ? "The key comes from the .env.local file." : "The key is saved on this computer."}</span>
          <button type="button" className="btn btn-secondary min-h-0 px-2.5 py-1 text-xs" onClick={() => setEditing(true)} disabled={busy}>
            Replace key
          </button>
          <button type="button" className="btn btn-danger min-h-0 px-2.5 py-1 text-xs" disabled={busy} onClick={() => void run(() => send("DELETE", { provider: p.id }), `Key removed. ${p.ready ? "Its features now ask for a key." : ""}`)}>
            Remove key
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => send("PUT", { provider: p.id, key }), p.id === "gemini" ? "Key checked with Google and saved." : "Key saved.");
          }}
        >
          <label className="text-xs text-muted" htmlFor={`key-${p.id}`}>
            API key
          </label>
          <div className="flex gap-1.5">
            <input id={`key-${p.id}`} type="password" autoComplete="off" spellCheck={false} className="field min-w-0 flex-1 font-mono text-xs" placeholder={`${p.example} (paste it here)`} value={key} onChange={(e) => setKey(e.target.value)} />
            <button type="submit" className="btn btn-primary shrink-0 px-3 text-xs" disabled={busy || !key.trim()}>
              {busy ? "Checking…" : p.id === "gemini" ? "Check & save" : "Save"}
            </button>
            {editing && (
              <button type="button" className="btn btn-secondary shrink-0 px-2.5 text-xs" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
          <a className="self-start text-xs text-link underline" href={p.keyUrl} target="_blank" rel="noreferrer">
            Get your {p.name} key
          </a>
        </form>
      )}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {saved && (
        <p className="text-xs text-success" role="status">
          {saved}
        </p>
      )}
    </section>
  );
}

/** API keys (AI Tools → Settings, or Import): the user's own keys, one card per service, in two groups. */
export function AiSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<ProviderStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/ai/keys", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setStatus(j.providers))
      .catch(() => alive && setError("Couldn't read the AI settings."));
    return () => {
      alive = false;
    };
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="API keys">
      <div className="flex flex-col gap-3" data-testid="ai-settings">
        <p className="text-sm text-muted">Connect the services you want to use with your own API key. Without a key (or switched off), their features stay off and nothing is sent anywhere.</p>
        {error && <Notice tone="error">{error}</Notice>}
        {!status && !error && <p className="text-sm text-muted">Loading…</p>}
        {status &&
          PROVIDER_GROUPS.map((g) => (
            <section key={g.id} aria-label={g.label} className="flex flex-col gap-2">
              <h3 className="mt-1 text-2xs font-semibold uppercase tracking-wide text-muted">{g.label}</h3>
              {PROVIDERS.filter((p) => p.group === g.id).map((p) => (
                <ProviderCard key={p.id} p={p} s={status.find((x) => x.id === p.id)} onStatus={setStatus} />
              ))}
            </section>
          ))}
        <p className="flex items-start gap-1.5 text-2xs text-muted">
          <Icon name="lock" className="mt-px size-3.5 shrink-0" />
          Keys are kept on this computer only (in the editor&apos;s storage folder, readable by you only), are never shown again in full, and go only to their own service. They can be changed only on this computer.
        </p>
      </div>
    </Dialog>
  );
}
