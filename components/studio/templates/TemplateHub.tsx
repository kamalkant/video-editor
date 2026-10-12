"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALL_TEMPLATE_CATEGORIES,
  type AspectRatio,
  type BroadcastTemplate,
  type TemplateCategory,
} from "@/lib/templates/types";
import { BROADCAST_TEMPLATES, BROADCAST_TEMPLATES_BY_ID } from "@/lib/templates/newsTemplates";
import { customHubId, customToBroadcast, legacyToBroadcast } from "@/lib/templates/hubTemplates";
import type { CustomTemplateStatus } from "@/lib/templates/custom";
import { TEMPLATES } from "@/lib/templates";
import type { VideoMeta } from "@/lib/api/types";
import { CreateTemplateDialog } from "./CreateTemplateDialog";
import { TemplateCard } from "./TemplateCard";
import { TemplateDetailPane } from "./TemplateDetailPane";
import { TemplateCustomizerModal } from "./TemplateCustomizerModal";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { VoiceSearchMic } from "@/components/ui/VoiceSearchMic";

export function TemplateHub({
  onUseTemplate,
  onClose,
}: {
  onUseTemplate: (template: BroadcastTemplate, customizations?: Record<string, any>) => void;
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>("All");
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio | "all">("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(BROADCAST_TEMPLATES[0].id);

  // your own templates (kept on the server) and the starter templates, next to the broadcast ones
  const [mine, setMine] = useState<CustomTemplateStatus[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [creating, setCreating] = useState<{ baseId?: string | null; video?: VideoMeta | null; audio?: VideoMeta | null } | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const loadMine = useCallback(async () => {
    try {
      const r = await fetch("/api/templates/custom");
      if (r.ok) setMine(((await r.json()) as { templates: CustomTemplateStatus[] }).templates);
    } catch {
      /* offline: the built-in ones still show */
    }
  }, []);
  useEffect(() => {
    let on = true;
    fetch("/api/templates/custom")
      .then((r) => (r.ok ? (r.json() as Promise<{ templates: CustomTemplateStatus[] }>) : null))
      .then((j) => on && j && setMine(j.templates))
      .catch(() => undefined)
      .finally(() => on && setMineLoading(false));
    return () => {
      on = false;
    };
  }, []);
  const starters = useMemo(() => TEMPLATES.filter((t) => !BROADCAST_TEMPLATES_BY_ID.has(t.id)).map(legacyToBroadcast), []);
  const allTemplates = useMemo(() => [...mine.map(customToBroadcast), ...BROADCAST_TEMPLATES, ...starters], [mine, starters]);
  // the groups: yours first (when you have any), then the library's, then the starter groups
  const categories = useMemo(() => {
    const used = new Set(allTemplates.map((t) => t.category));
    const yours = [...new Set(mine.map((t) => t.category))] as TemplateCategory[];
    return ["All" as TemplateCategory, ...yours, ...ALL_TEMPLATE_CATEGORIES.filter((c) => c !== "All" && !yours.includes(c) && (used.has(c) || BROADCAST_TEMPLATES.some((t) => t.tags.some((g) => g.toLowerCase() === c.toLowerCase()))))];
  }, [allTemplates, mine]);
  const renameMine = async (t: BroadcastTemplate, newName: string) => {
    if (!t.custom) return;
    const name = newName.trim();
    if (!name || name === t.name) return;
    const r = await fetch(`/api/templates/custom/${t.custom.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!r.ok) setHubError(((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Couldn't rename it.");
    await loadMine();
  };
  const deleteMine = async (t: BroadcastTemplate) => {
    if (!t.custom || !window.confirm(`Delete the template “${t.name}”? Its video and sound stay in My Assets.`)) return;
    const r = await fetch(`/api/templates/custom/${t.custom.id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) setHubError("Couldn't delete it. Try again.");
    await loadMine();
  };

  // Customizer Modal state
  const [customizerTab, setCustomizerTab] = useState<"presenter" | "background" | "text" | "branding" | "audio" | null>(null);

  // Filter templates based on category, aspect ratio, and search text
  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      // Category filter
      if (selectedCategory !== "All" && t.category !== selectedCategory) {
        // Also check subcategory / tags
        if (!t.tags.some((tag) => tag.toLowerCase() === selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // Aspect Ratio filter
      if (selectedRatio !== "all" && t.aspectRatio !== selectedRatio) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.name.toLowerCase().includes(q);
        const matchDesc = t.description.toLowerCase().includes(q);
        const matchCat = t.category.toLowerCase().includes(q);
        const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchCat && !matchTags) {
          return false;
        }
      }

      return true;
    });
  }, [allTemplates, selectedCategory, selectedRatio, searchQuery]);

  const activeTemplate = useMemo(() => {
    return (
      filteredTemplates.find((t) => t.id === selectedTemplateId) ??
      filteredTemplates[0] ??
      BROADCAST_TEMPLATES[0]
    );
  }, [filteredTemplates, selectedTemplateId]);

  const similarTemplates = useMemo(() => {
    return allTemplates.filter(
      (t) => t.id !== activeTemplate.id && (t.category === activeTemplate.category || t.aspectRatio === activeTemplate.aspectRatio),
    ).slice(0, 4);
  }, [activeTemplate, allTemplates]);

  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-app text-ink"
      data-testid="template-hub"
    >
      {/* Main Left Stage (4-column grid + filters) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex flex-col gap-3 border-b border-line bg-surface/70 px-6 py-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-bold text-white shadow-sm">
                  📺
                </span>
                <h1 className="text-xl font-bold tracking-tight text-ink">Video Templates</h1>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Choose a professional news or broadcast template to start your video with instant animations and ready-made layers.
              </p>
            </div>

            {/* Back to Studio Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreating({})}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:brightness-110"
                title="Your video and sound, with a ready-made look on top"
              >
                <Icon name="plus" className="size-3.5" strokeWidth={2.5} />
                <span>Create template</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl border border-line bg-raised px-3.5 py-2 text-xs font-semibold text-muted hover:border-control hover:text-ink transition-colors"
                title="Return to timeline editor"
              >
                <span>Back to Editor</span>
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>

          {/* Search Bar & Aspect Ratio Dropdown Filter */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
                <Icon name="search" className="size-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates (e.g. Breaking, Studio, Weather, Finance, Reels)..."
                className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-16 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none shadow-sm"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-muted hover:text-ink text-xs px-1 cursor-pointer"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
                <VoiceSearchMic
                  size="xs"
                  onTranscript={(transcript) => setSearchQuery(transcript)}
                />
              </div>
            </div>

            {/* Aspect Ratio Filter Dropdown */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="aspect-filter" className="sr-only">
                Aspect ratio
              </label>
              <select
                id="aspect-filter"
                value={selectedRatio}
                onChange={(e) => setSelectedRatio(e.target.value as any)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink focus:border-primary focus:outline-none shadow-sm cursor-pointer"
              >
                <option value="all">All Ratios (16:9, 9:16, 1:1)</option>
                <option value="16:9">16:9 Landscape (YouTube, TV)</option>
                <option value="9:16">9:16 Vertical (Reels, Shorts)</option>
                <option value="1:1">1:1 Square (Instagram, Feed)</option>
              </select>
            </div>

            {/* Total template counter */}
            <span className="ml-auto text-xs text-muted font-medium">
              Showing {filteredTemplates.length} {filteredTemplates.length === 1 ? "template" : "templates"}
            </span>
          </div>

          {/* Horizontal Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "bg-primary font-bold text-white shadow-sm shadow-primary/20 scale-[1.02]"
                      : "bg-raised border border-line/60 text-muted hover:border-control hover:text-ink hover:bg-hover"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </header>

        {/* 4-Column Template Grid */}
        <div className="flex-1 overflow-y-auto p-6 pb-20">
          {filteredTemplates.length === 0 ? (
            <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
              <span className="text-4xl">🔍</span>
              <h3 className="text-base font-semibold text-ink">No templates found</h3>
              <p className="max-w-sm text-xs text-muted">
                We couldn&apos;t find any templates matching &ldquo;{searchQuery}&rdquo;. Try adjusting your search or category filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("All");
                  setSelectedRatio("all");
                }}
                className="mt-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={template.id === activeTemplate.id}
                  onSelect={() => setSelectedTemplateId(template.id)}
                  onUse={() => onUseTemplate(template)}
                  onRename={template.custom ? (newName) => void renameMine(template, newName) : undefined}
                  onDelete={template.custom ? () => void deleteMine(template) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Template Detail & Customizer Pane */}
      <aside className="relative flex w-[420px] h-full shrink-0 flex-col shadow-xl bg-surface/50 border-l border-line">
        <TemplateDetailPane
          // (a fresh pane per template: its own clip, sound and video / motion choice)
          key={activeTemplate.id}
          template={activeTemplate}
          similarTemplates={similarTemplates}
          onSelectSimilar={(st) => setSelectedTemplateId(st.id)}
          onUse={(custom) => onUseTemplate(activeTemplate, custom)}
          onCustomize={(tab) => setCustomizerTab(tab)}
          onSaveAsMine={(o) => setCreating({ baseId: activeTemplate.custom ? null : BROADCAST_TEMPLATES_BY_ID.has(activeTemplate.id) ? activeTemplate.id : null, ...o })}
          onTemplateChanged={() => void loadMine()}
        />
      </aside>

      {creating && (
        <CreateTemplateDialog
          open
          initial={creating}
          groups={categories.filter((c) => c !== "All")}
          onClose={() => setCreating(null)}
          onSaved={(t) => {
            setCreating(null);
            setMine((m) => [t, ...m.filter((x) => x.id !== t.id)]);
            setSelectedCategory(t.category as TemplateCategory);
            setSelectedRatio("all");
            setSearchQuery("");
            setSelectedTemplateId(customHubId(t.id));
          }}
        />
      )}
      {mineLoading && (
        <div role="status" className="pointer-events-none absolute bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-lg" data-testid="templates-mine-loading">
          <Spinner size="xs" className="text-primary" /> Loading your templates…
        </div>
      )}
      {hubError && (
        <div role="alert" className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-danger/40 bg-surface px-3 py-2 text-xs text-danger shadow-xl">
          {hubError}
          <button type="button" className="text-muted hover:text-ink" onClick={() => setHubError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* Quick Customizer Modal */}
      {customizerTab && (
        <TemplateCustomizerModal
          template={activeTemplate}
          initialTab={customizerTab}
          onClose={() => setCustomizerTab(null)}
          onApplyAndUse={(customizations) => {
            setCustomizerTab(null);
            onUseTemplate(activeTemplate, customizations);
          }}
        />
      )}
    </div>
  );
}
