import type { ComponentType } from "react";
import type { KeyColorControl } from "@/components/editor/KeyColorControl";
import type { StudioAction, StudioState } from "@/lib/editor/studioReducer";
import type { AiMaskState } from "@/lib/editor/useAiMask";
import type { CropInfo } from "@/lib/editor/useCropBox";
import type { ChromaKeyParams } from "@/lib/ops/chromaKey";
import type { VideoMeta } from "@/lib/videos";
import { RemoveBackgroundPanel } from "./RemoveBackgroundPanel";

type KeyControlProps = Omit<Parameters<typeof KeyColorControl>[0], "value" | "detected" | "source">;

export type ToolPanelProps = {
  /** inside an inspector tab: no card border or title bar, just a slim switch row */
  bare?: boolean;
  state: StudioState;
  keyParams: ChromaKeyParams;
  dispatch: (a: StudioAction, group?: string) => void;
  /** null before any upload: the panel is shown, dimmed, as an empty state. */
  video: VideoMeta | null;
  seeThrough: boolean;
  keyControl: KeyControlProps;
  crop: CropInfo;
  /** AI Removal mask progress (state "off" when AI Removal isn't on). */
  aiMask: AiMaskState;
  onRetryAi: () => void;
};

export type ToolDefinition = { id: string; label: string; icon: string; Panel: ComponentType<ToolPanelProps> };

/**
 * Tools of the inspector (right side). To add a feature: write its panel in
 * this folder and add one line here (plus its operation in lib/ops if it
 * changes the video). With more than one tool the inspector shows tabs.
 * Export settings live in the Export dialog.
 */
export const TOOLS: ToolDefinition[] = [{ id: "removeBg", label: "Remove background", icon: "🎯", Panel: RemoveBackgroundPanel }];
