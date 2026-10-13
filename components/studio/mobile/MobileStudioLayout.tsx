"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { TimelineDoc, VideoClip, AudioClip, TextClip } from "@/lib/edit/doc";
import type { Clock } from "@/lib/editor/clock";
import type { ProjectRef, SaveState } from "@/lib/projects/useProjectSync";
import type { TransitionType } from "@/lib/player/transitions";
import { MobileTopBar } from "./MobileTopBar";
import { MobileBottomToolbar, type MobileTab } from "./MobileBottomToolbar";
import { MobileBottomSheet, type SheetSnap } from "./MobileBottomSheet";
import { MobileEditSheet } from "./sheets/MobileEditSheet";
import { MobileAudioSheet } from "./sheets/MobileAudioSheet";
import { MobileTextSheet } from "./sheets/MobileTextSheet";
import { MobileEffectsSheet } from "./sheets/MobileEffectsSheet";
import { MobileFiltersSheet } from "./sheets/MobileFiltersSheet";
import { MobileAiSheet } from "./sheets/MobileAiSheet";
import { MobileMoreSheet } from "./sheets/MobileMoreSheet";

export type MobileStudioLayoutProps = {
  doc: TimelineDoc;
  clock: Clock;
  selectedId: string | null;
  onSelectClip: (clipId: string | null) => void;
  media?: Record<string, { hasAudio?: boolean; fileName?: string }>;
  project?: ProjectRef | null;
  saveState?: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHome: () => void;
  onExport: () => void;
  onOpenProjects?: () => void;
  previewArea: ReactNode;
  timeline: ReactNode;
  dialogs?: ReactNode;
  // Action Handlers
  onSplit?: (clipId: string, t: number) => void;
  onTrim?: (clipId: string, edge: "in" | "out", t: number) => void;
  onDelete?: (clipId: string) => void;
  onDuplicate?: (clipId: string) => void;
  onCrop?: (clipId: string) => void;
  onSpeed?: (clipId: string) => void;
  onReverse?: (clipId: string) => void;
  onFreeze?: (clipId: string, t: number) => void;
  onDetachAudio?: (clipId: string) => void;
  onAddText?: (presetId: string) => void;
  onOpenLibraryAudio?: () => void;
  onApplyTransition?: (type: TransitionType) => void;
  onRemoveTransition?: () => void;
  onApplyEffect?: (effectName: string) => void;
  onRemoveBackground?: (clipId: string) => void;
  onAutoSubtitles?: () => void;
  onGenerateScript?: () => void;
  onSetAspectRatio?: (ratio: "16:9" | "9:16" | "1:1" | "4:5" | "21:9") => void;
  onOpenPanel?: (panel: "library" | "media" | "templates" | "brand" | "background" | "subtitles") => void;
  onPatchClip?: (clipId: string, patch: any) => void;
};

export function MobileStudioLayout({
  doc,
  clock,
  selectedId,
  onSelectClip,
  media = {},
  project,
  saveState = "saved",
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHome,
  onExport,
  onOpenProjects,
  previewArea,
  timeline,
  dialogs,
  onSplit,
  onTrim,
  onDelete,
  onDuplicate,
  onCrop,
  onSpeed,
  onReverse,
  onFreeze,
  onDetachAudio,
  onAddText = () => {},
  onOpenLibraryAudio = () => {},
  onApplyTransition,
  onRemoveTransition,
  onApplyEffect,
  onRemoveBackground,
  onAutoSubtitles,
  onGenerateScript,
  onSetAspectRatio,
  onOpenPanel = () => {},
  onPatchClip,
}: MobileStudioLayoutProps) {
  const [activeTab, setActiveTab] = useState<MobileTab | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("compact");

  // When a clip is tapped/selected:
  // As decided in /grill-me, highlight clip and open/switch to 'edit' if no sheet open
  useEffect(() => {
    if (selectedId) {
      if (activeTab === null) {
        setActiveTab("edit");
      }
    }
  }, [selectedId]);

  const handleSelectTab = (tab: MobileTab) => {
    if (activeTab === tab) {
      // Toggle close if tapping already active tab
      setActiveTab(null);
    } else {
      setActiveTab(tab);
      // Reset to compact when switching tabs
      setSheetSnap("compact");
    }
  };

  const getSheetTitle = (tab: MobileTab): string => {
    switch (tab) {
      case "edit":
        return "Edit Clip";
      case "audio":
        return "Audio & Sound";
      case "text":
        return "Text & Titles";
      case "effects":
        return "Effects & Transitions";
      case "filters":
        return "Filters & Grading";
      case "ai":
        return "AI Magic Tools";
      case "more":
        return "More Tools & Canvas";
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-app text-ink select-none font-sans">
      {/* 1. Mobile Top Bar */}
      <MobileTopBar
        projectName={project?.name || "Untitled project"}
        project={project}
        saveState={saveState}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onHome={onHome}
        onExport={onExport}
        onOpenProjects={onOpenProjects}
      />

      {/* 2. Video Preview Area (Top ~32-35vh) */}
      <div className="relative shrink-0 w-full max-h-[36vh] min-h-[170px] bg-black/40 flex items-center justify-center overflow-hidden border-b border-line/60">
        <div className="w-full h-full flex items-center justify-center">
          {previewArea}
        </div>
      </div>

      {/* 3. Multi-track Timeline Area (Middle flex-1) */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-app">
        {timeline}
      </div>

      {/* 4. Compact Bottom Sheet (Occupies 20-25% compact or 50% expanded) */}
      <MobileBottomSheet
        isOpen={activeTab !== null}
        title={activeTab ? getSheetTitle(activeTab) : ""}
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        onClose={() => setActiveTab(null)}
      >
        {activeTab === "edit" && (
          <MobileEditSheet
            doc={doc}
            selectedId={selectedId}
            clock={clock}
            media={media}
            onSplit={onSplit}
            onTrim={onTrim}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onCrop={onCrop}
            onSpeed={onSpeed}
            onReverse={onReverse}
            onFreeze={onFreeze}
            onDetachAudio={onDetachAudio}
            onVolumeChange={(clipId, volume) => {
              onPatchClip?.(clipId, { volume });
            }}
          />
        )}

        {activeTab === "audio" && (
          <MobileAudioSheet
            doc={doc}
            selectedId={selectedId}
            onOpenLibraryAudio={onOpenLibraryAudio}
            onDetachAudio={onDetachAudio}
            onPatchClip={onPatchClip}
          />
        )}

        {activeTab === "text" && (
          <MobileTextSheet
            doc={doc}
            selectedId={selectedId}
            onAddText={onAddText}
            onPatchClip={onPatchClip}
          />
        )}

        {activeTab === "effects" && (
          <MobileEffectsSheet
            doc={doc}
            selectedId={selectedId}
            onApplyTransition={onApplyTransition}
            onRemoveTransition={onRemoveTransition}
            onApplyEffect={onApplyEffect}
            onOpenElements={() => onOpenPanel("library")}
            onOpenAiTools={() => setActiveTab("ai")}
          />
        )}

        {activeTab === "filters" && (
          <MobileFiltersSheet
            doc={doc}
            selectedId={selectedId}
            onPatchClip={onPatchClip}
          />
        )}

        {activeTab === "ai" && (
          <MobileAiSheet
            doc={doc}
            selectedId={selectedId}
            onRemoveBackground={onRemoveBackground}
            onAutoSubtitles={onAutoSubtitles}
            onGenerateScript={onGenerateScript}
            onOpenAiTools={() => onOpenPanel("library")}
          />
        )}

        {activeTab === "more" && (
          <MobileMoreSheet
            doc={doc}
            onSetAspectRatio={onSetAspectRatio}
            onOpenPanel={onOpenPanel}
          />
        )}
      </MobileBottomSheet>

      {/* 5. Sticky Bottom Toolbar (7 touch tabs) */}
      <MobileBottomToolbar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />

      {/* Dialogs, export modal, etc. */}
      {dialogs}
    </div>
  );
}
