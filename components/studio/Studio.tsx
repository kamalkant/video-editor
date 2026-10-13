"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PreviewOptions } from "@/components/editor/PreviewOptions";
import type { BgMedia } from "@/components/editor/BackgroundSwatches";
import {
  PreviewPane,
  type Bg,
  type FinalFiles,
  type PlayerApi,
  type View,
} from "@/components/editor/PreviewPane";
import { ProgramPlayer } from "@/components/editor/ProgramPlayer";
import { VideoInfoCard } from "@/components/upload/VideoInfoCard";
import { Icon } from "@/components/ui/Icon";
import { SliderDensity } from "@/components/ui/LabeledSlider";
import { Notice } from "@/components/ui/Notice";
import { Popover } from "@/components/ui/Popover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tip } from "@/components/ui/Tip";
import { toApiError } from "@/lib/api/types";
import { ACCEPT, precheck } from "@/lib/api/upload";
import {
  type AnyClip,
  type MainClip,
  type MediaLite,
  type Track,
  videoClipOf,
  srcAt,
  mainStarts,
  mainTrack,
  asSingleVideo,
  BLANK_SECONDS,
  THEME_BLANK_DARK,
  THEME_BLANK_LIGHT,
  canvasFor,
  clipCount,
  clipLength,
  clipSpec,
  clipStart,
  docDuration,
  docFromSpec,
  drawnSlot,
  elementClipsOf,
  emptyDoc,
  findClip,
  mainClipAt,
  mainDuration,
  mediaIdsOf,
  mediaLiteOf,
  newId,
  textClipsOf,
  NO_ANIM,
  type ElementClip,
  type ElementLook,
  type TimelineDoc,
  type Transform,
  type VideoClip,
  type ImageClip,
  type ColorAdjust,
  type Watermark,
  type TextClip,
} from "@/lib/edit/doc";
import {
  DEFAULT_SPEC,
  parseSpec,
  specFromSettings,
  type EditSpec,
  type OutputSettings as Output,
} from "@/lib/edit/spec";
import { createClock } from "@/lib/editor/clock";
import {
  clipStudioState,
  defaultVideoClip,
  docReducer,
  withMediaFacts,
  withMediaKnown,
  type DocAction,
  type DocState,
} from "@/lib/editor/docReducer";
import {
  addLocal,
  adoptLocal,
  ensureOnServer,
  forgetLocal,
  installUploadGate,
  localItem,
  listLocalFiles,
  localItems,
  localSrc,
  localThumb,
  localVersion,
  notOnServer,
  onLocalUploaded,
  onLocalUploadFailed,
  overLimit,
  pendingAmong,
  persistLocal,
  probeLocal,
  provisionalMeta,
  releaseLocal,
  releaseLocalExcept,
  restoreLocal,
  restorePending,
  setLocalAccount,
  subscribeLocal,
  uploadingItems,
} from "@/lib/media/localMedia";
import { inOrder } from "@/lib/media/inOrder";
import { EditorSkeleton } from "./EditorSkeleton";
import { Spinner, SpinnerOverlay } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { newUuid } from "@/lib/storage/uuid";

/** How long a new file may take to show its first frame here before it goes the upload-first way. */
const PROBE_TIMEOUT_MS = 6_000;
import { historyReducer, initHistory } from "@/lib/editor/history";
import {
  LAST_SETTINGS_KEY,
  readLocal,
  removeLocal,
  writeLocal,
} from "@/lib/editor/localStore";
import {
  aiParams,
  blackParams,
  keyParams,
  removalOn,
  stateForVideo,
  type StudioAction,
  type StudioState,
} from "@/lib/editor/studioReducer";
import { useAiMask, useAiMasks } from "@/lib/editor/useAiMask";
import { useDerived } from "@/lib/editor/useDerived";
import { useSpeechRanges } from "@/lib/editor/useSpeech";
import { useReversed } from "@/lib/editor/useReversed";
import type { LiveKeyParams } from "@/lib/editor/liveKey";
import type { Range } from "@/lib/edit/timeline";
import { useCropBox } from "@/lib/editor/useCropBox";
import { usePreview } from "@/lib/editor/usePreview";
import type { SampledKeyColor } from "@/lib/editor/sampleColor";
import {
  DEFAULT_FORMAT,
  EXPORT_PRESETS,
  formatBlocked,
  isStillFormat,
  needsAlpha,
  SOCIAL_SET,
  videoPreset,
  type ExportFormat,
  type ExportPresetId,
  type VideoPresetId,
} from "@/lib/export/presets";
import type { Job } from "@/lib/jobs/queue";
import { useJobPolling } from "@/lib/jobs/useJobPolling";
import { useAuth } from "@/lib/auth/AuthContext";
import { getDeviceFolderInfo, pickDeviceFolder } from "@/lib/storage/deviceFolder";
import { useAssets, useProjects, type Asset } from "@/lib/media/useLibrary";
import { useProjectSync, type ProjectRef } from "@/lib/projects/useProjectSync";
import {
  DEFAULTS,
  LIMITS,
  limitsOf,
  mergeSettings,
  SEE_THROUGH_WARN_PCT,
} from "@/lib/settings";
import {
  TEXT_STYLES,
  textAnchor,
  textClipOf,
  textClipOfStyle,
} from "@/lib/text/layout";
import {
  renderTextPng,
  renderTextSprite,
  renderWordSprite,
  textSpriteOf,
  wordSpriteOf,
} from "@/lib/text/render";
import { renderBackdropPng } from "@/lib/backdrops";
import { useUpload } from "@/lib/upload/useUpload";
import type { VideoMeta } from "@/lib/videos";
import {
  ClipPropsCard,
  ProjectCard,
  ClipInspector,
  TAB_INFO,
  tabsFor,
  type InspectorTab,
  type MotionProps,
} from "./ClipCards";
import { applySmartMix, resetSmartMix } from "@/lib/audio/smartMix";
import { DUCK_DETECT } from "@/lib/audio/ducking";
import type { SmartMixConfig } from "@/lib/edit/doc";
import {
  DEFAULT_TRACKING_SETTINGS,
  TRACKING_COLORS,
  type TrackingPoint,
  type TrackingKeyframe,
  type BlurAttachment,
  type ClipAttachment,
  type Attachment,
} from "@/lib/tracking/types";
import { runVideoTracking } from "@/lib/tracking/tracker";
import {
  bakeTrackingToKeyframes,
  trackCoordToTransform,
} from "@/lib/tracking/attach";
import { detectFaces } from "@/lib/tracking/opticalFlow";
import { EditPanel, type EditAction, type EditTab } from "./EditPanel";
import { getEditingTools } from "@/lib/editor/editingTools";
import { EmptyPreview } from "./EmptyPreview";
import { fileUrl } from "./ExportResults";
import { MediaPanel } from "./MediaPanel";
import { OutputSettings } from "./OutputSettings";
import { ProjectsPanel } from "./ProjectsPanel";
import { DESKTOP as RAIL_ITEMS, Rail, type PanelId } from "./Rail";
import type { Command } from "@/lib/editor/commands";
import { stepsPercent, useTask } from "@/lib/editor/tasks";
import { setTheme, THEMES } from "@/lib/editor/theme";
import { isMac } from "@/lib/editor/platform";
import type { VersionSummary } from "@/lib/projects/versions";
import { BrandPanel, DEFAULT_LOGO_LOOK, LogoControls } from "./BrandPanel";
import { ElementsPanel, type LogoState } from "./ElementsPanel";
import {
  ELEMENTS,
  elementClipOf,
  elementName,
  elementPreset,
  emojiClipOf,
} from "@/lib/elements/catalog";
import { refitBadge } from "@/lib/elements/geometry";
import { browserMeasure } from "@/lib/elements/draw";
import { renderElementParts } from "@/lib/elements/render";
import { LooksStrip } from "./LooksStrip";
import { BrandContext, useBrand } from "@/lib/editor/useBrand";
import { saveCustomTemplate, TEMPLATES, type Template } from "@/lib/templates";
import { BROADCAST_TEMPLATES_BY_ID } from "@/lib/templates/newsTemplates";
import type { BroadcastTemplate } from "@/lib/templates/types";
import { NEUTRAL } from "@/lib/player/look";
import { AiToolsPanel, type AiToolId } from "./AiToolsPanel";
import { RatioMenu } from "./RatioMenu";
import { newPatch } from "@/lib/player/patches";
import { cropForAspect } from "@/lib/player/look";
import { logoTransform, staticTransformAt } from "@/lib/player/layout";
import { logoHasBadge } from "@/lib/player/logo";
import { renderLogoPng } from "@/lib/player/logoRender";
import {
  ELEMENT_DRAG,
  elementDrag,
  MEDIA_DRAG,
  MEME_DRAG,
  memeDrag,
  TEXT_DRAG,
  textDrag,
  type LibraryClipDragItem,
} from "@/lib/editor/mediaDrag";
import { sizeBasisOf } from "@/lib/export/size";
import {
  hasKeys,
  motionAt,
  textRenderTransform,
  transformAt,
  type MotionClip,
} from "@/lib/edit/keyframes";
import { BUBBLE_MASK } from "./LookSections";
import { TransitionCard } from "./TransitionsPanel";
import type { TransitionType } from "@/lib/player/transitions";
import { PanelSplitter, usePanelWidth } from "./PanelSplitter";
import { captionLookStyle, type CaptionLook } from "./SubtitlesPanel";
import { mainFrameAt } from "@/lib/edit/frameAt";
import { emojiBoost } from "@/lib/subtitles/emoji";
import { languageLabel } from "@/lib/subtitles/segments";
import { everyNth } from "@/lib/audio/beats";
import type { ImportTab } from "./ImportDialog";
import { NO_AI_REMOVAL } from "@/lib/ops/aiMatte";
import { useServerCaps } from "@/lib/editor/useServerCaps";
import { useGemini } from "@/lib/editor/useGemini";
import { useVeoJob } from "@/lib/editor/useVeoJob";
import type { Caption } from "@/lib/subtitles/segments";
import {
  addMedia,
  deleteClip,
  interruptOrphanedGenerations,
  type CopiedClip,
} from "@/lib/edit/docEdit";
import type { Recorded } from "@/components/record/RecordDialog";
import type { RecordMode } from "@/lib/record/useRecorder";
import { Timeline, type MaskKind, type TimelineApi } from "./Timeline";
import { TimelineResizer, useTimelineHeight } from "./TimelineResizer";
import { TopBar } from "./TopBar";
import { TOOLS } from "./tools/registry";
import { RecoveryNotice } from "./RecoveryNotice";
import {
  localWorkspaceManager,
  type AccountWorkspace,
} from "@/lib/storage/workspace";
import { exportVDO, importVDO } from "@/lib/storage/VDO";
import { saveFileWithPicker } from "@/lib/storage/filePicker";
import { newProject } from "@/lib/projects/model";
import { UniversalAiTooltip } from "./UniversalAiTooltip";
import { useAiGenerationManager } from "@/lib/ai/useAiGenerationManager";
import type {
  UniversalAiGenerationRequest,
  UniversalMediaType,
} from "@/lib/ai/universal";
import { formatTime } from "@/lib/format";
import {
  applyClipStyle,
  extractClipStyle,
  type CopiedStyle,
} from "@/lib/edit/clipStyle";

export const LAST_SPEC_KEY = "VDO:v2:last";

/** The message of an API error body ({ error: { message } }), if it has one. */
const apiErrorMessage = (body: unknown): string | null => {
  const m = (body as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof m !== "string" || !m) return null;
  if (/YouTube/i.test(m)) {
    return "This online meme clip is temporarily unavailable. Try another clip or upload your own file.";
  }
  return m;
};

/** A dialog opened before its code has arrived: a spinner where it will appear. */
function DialogLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop" data-testid="dialog-loading">
      <span role="status" className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted shadow-lg">
        <Spinner size="md" className="text-primary" /> Opening…
      </span>
    </div>
  );
}
/** A side panel opened before its code has arrived: its outline. */
function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2.5 p-2.5" aria-busy="true" data-testid="panel-loading">
      <span role="status" className="sr-only">
        {label}
      </span>
      <Skeleton className="h-8" />
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-14" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-video" />
        ))}
      </div>
    </div>
  );
}

// Lazy-loaded modal dialogs (loaded on-demand when opened to minimize initial JS bundle)
const ExportDialog = dynamic(
  () => import("./ExportDialog").then((m) => m.ExportDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const HelpDialog = dynamic(
  () => import("./HelpDialog").then((m) => m.HelpDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const VersionsDialog = dynamic(
  () => import("./VersionsMenu").then((m) => m.VersionsDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const SilenceDialog = dynamic(
  () => import("./SilenceDialog").then((m) => m.SilenceDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const SearchPalette = dynamic(
  () => import("./SearchPalette").then((m) => m.SearchPalette),
  { ssr: false, loading: () => <DialogLoading /> },
);
const TtsDialog = dynamic(
  () => import("./TtsDialog").then((m) => m.TtsDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const VoiceoverStudioDialog = dynamic(
  () => import("./VoiceoverStudioDialog").then((m) => m.VoiceoverStudioDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const TextToVideoDialog = dynamic(
  () => import("./TextToVideoDialog").then((m) => m.TextToVideoDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const BRollDialog = dynamic(
  () => import("./BRollDialog").then((m) => m.BRollDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const SmartCropDialog = dynamic(
  () => import("./SmartCropDialog").then((m) => m.SmartCropDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const DubbingDialog = dynamic(
  () => import("./DubbingDialog").then((m) => m.DubbingDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const AiAvatarDialog = dynamic(
  () => import("./AiAvatarDialog").then((m) => m.AiAvatarDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const ExtendVideoDialog = dynamic(
  () => import("./ExtendVideoDialog").then((m) => m.ExtendVideoDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const ObjectRemoverDialog = dynamic(
  () => import("./ObjectRemoverDialog").then((m) => m.ObjectRemoverDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const UpscaleEnhanceDialog = dynamic(
  () => import("./UpscaleEnhanceDialog").then((m) => m.UpscaleEnhanceDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const GenerateImageDialog = dynamic(
  () => import("./GenerateImageDialog").then((m) => m.GenerateImageDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const GenerateVideoDialog = dynamic(
  () => import("./GenerateVideoDialog").then((m) => m.GenerateVideoDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const AiSettingsDialog = dynamic(
  () => import("./AiSettingsDialog").then((m) => m.AiSettingsDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const ImportDialog = dynamic(
  () => import("./ImportDialog").then((m) => m.ImportDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const TranscriptEditorDialog = dynamic(
  () =>
    import("./TranscriptEditorDialog").then((m) => m.TranscriptEditorDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const GrokImagineDialog = dynamic(
  () => import("./GrokImagineDialog").then((m) => m.GrokImagineDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const ShareDialog = dynamic(
  () => import("./ShareDialog").then((m) => m.ShareDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const RecordDialog = dynamic(
  () => import("@/components/record/RecordDialog").then((m) => m.RecordDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const TemplatesGallery = dynamic(
  () => import("./TemplatesGallery").then((m) => m.TemplatesGallery),
  { ssr: false, loading: () => <PanelLoading label="Loading templates…" /> },
);
const HighlightsDialog = dynamic(
  () => import("./HighlightsDialog").then((m) => m.HighlightsDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const UnifiedLibraryPanel = dynamic(
  () => import("./UnifiedLibraryPanel").then((m) => m.UnifiedLibraryPanel),
  {
    ssr: false,
    loading: () => <PanelLoading label="Loading the library…" />,
  },
);
const MotionTrackingPanel = dynamic(
  () => import("./MotionTrackingPanel").then((m) => m.MotionTrackingPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading motion tracking…" /> },
);
const SmartMixPanel = dynamic(
  () => import("./SmartMixPanel").then((m) => m.SmartMixPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading smart audio mix…" /> },
);
const AudioLibraryPanel = dynamic(
  () => import("./AudioLibraryPanel").then((m) => m.AudioLibraryPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading audio library…" /> },
);
const EffectsPanel = dynamic(
  () => import("./EffectsPanel").then((m) => m.EffectsPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading effects…" /> },
);
const TemplateHub = dynamic(
  () => import("./templates/TemplateHub").then((m) => m.TemplateHub),
  { ssr: false, loading: () => <PanelLoading label="Loading template hub…" /> },
);
const TransitionsPanel = dynamic(
  () => import("./TransitionsPanel").then((m) => m.TransitionsPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading transitions…" /> },
);
const SubtitlesPanel = dynamic(
  () => import("./SubtitlesPanel").then((m) => m.SubtitlesPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading subtitles…" /> },
);
const BackgroundPanel = dynamic(
  () => import("./BackgroundPanel").then((m) => m.BackgroundPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading backgrounds…" /> },
);
const SoonPanel = dynamic(
  () => import("./SoonPanel").then((m) => m.SoonPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading features…" /> },
);
const TextPanel = dynamic(
  () => import("./TextPanel").then((m) => m.TextPanel),
  { ssr: false, loading: () => <PanelLoading label="Loading text tools…" /> },
);
const ThumbnailDialog = dynamic(
  () => import("./ThumbnailDialog").then((m) => m.ThumbnailDialog),
  { ssr: false, loading: () => <DialogLoading /> },
);
const StorageManagerModal = dynamic(
  () => import("./StorageManagerModal").then((m) => m.StorageManagerModal),
  { ssr: false, loading: () => <DialogLoading /> },
);

type Props = {
  /** The open project's timeline (null: a new, empty editor or an older ?v= link). */
  initialDoc: TimelineDoc | null;
  /** The uploads the timeline uses (or the one video of an older ?v= link). */
  initialMedia: VideoMeta[];
  initialJob: Job | null;
  initialProject: ProjectRef | null;
  /** A problem opening the link, e.g. a deleted project. */
  notice: string | null;
  /** A template picked on the website (/editor?template=<id>): a new project starts from it. */
  initialTemplateId?: string | null;
  capability: { ok: boolean; message: string | null };
};

const noop = () => () => {};
const reducer = historyReducer(docReducer);
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

const SPLIT_KEY = "VDO:v1:previewSplit";

/** Render only after hydration, so remembered settings (localStorage) never cause a mismatch. */
export function Studio(props: Props) {
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!hydrated) return <EditorSkeleton />;
  return <StudioInner {...props} />;
}

function rememberedSpec(): EditSpec | null {
  try {
    const v2 = readLocal<unknown>(LAST_SPEC_KEY);
    if (v2) return parseSpec(v2);
  } catch {
    /* ignore a broken saved spec */
  }
  const v1 = readLocal<{ settings?: unknown }>(LAST_SETTINGS_KEY);
  return v1?.settings
    ? specFromSettings(mergeSettings(DEFAULTS, v1.settings))
    : null;
}

/** The clip copied with ⌘C / ⌘X (kept while the editor is open, also across projects), with its upload. */
let copied: (CopiedClip & { media?: MediaLite }) | null = null;
/** The visual style copied with ⌥⌘C (transform, skew, perspective, looks, mask, color) */
let copiedStyle: CopiedStyle | null = null;

const silentOf = (v: VideoMeta) => v.info.hasAudio && !v.info.soundDetected;
const hintsOf = (v: VideoMeta) => ({
  black: v.keyKind === "black",
  effects: v.keyVia === "frame",
});
/** The Background Removal settings a newly added video starts with: the user's last settings + this clip's detected key. */
const firstStateFor = (v: VideoMeta, base: EditSpec | null) =>
  stateForVideo(
    base,
    v.suggestedKey,
    limitsOf(v.info),
    silentOf(v),
    hintsOf(v),
  );
const NO_CLIP: StudioState = {
  method: "color",
  spec: DEFAULT_SPEC,
  keySource: "default",
  detectedKey: null,
  limits: undefined,
};

type SidePanel =
  | "media"
  | "library"
  | "projects"
  | "edit"
  | "text"
  | "elements"
  | "templates"
  | SoonArea;
type SoonArea =
  | "background"
  | "audio"
  | "subtitles"
  | "brand"
  | "effects"
  | "transitions";
const SOON_AREAS: SoonArea[] = [
  "background",
  "audio",
  "subtitles",
  "brand",
  "effects",
  "transitions",
];
const SIDE_TITLES: Record<SidePanel, string> = {
  media: "Media",
  library: "Library",
  projects: "Projects",
  edit: "Edit",
  text: "Text",
  templates: "Templates",
  background: "Background",
  elements: "Elements",
  audio: "Audio",
  subtitles: "Subtitles",
  brand: "Brand Kit",
  effects: "Effects",
  transitions: "Transitions",
};
const isSoonArea = (id: string): id is SoonArea =>
  (SOON_AREAS as string[]).includes(id);
const isSide = (id: string): id is SidePanel => id in SIDE_TITLES;

/** Text pictures already sent for an export (the same look isn't drawn and sent twice). */
const sentTexts = new Map<string, string>();

function initialDocState(p: Props): DocState {
  const media = Object.fromEntries(
    p.initialMedia.map((m) => [m.id, mediaLiteOf(m)]),
  );
  if (p.initialDoc) return { doc: p.initialDoc, media };
  // an older ?v= link (or a new upload before its project exists): one video on the main track
  const v = p.initialMedia[0];
  if (v) {
    const spec = p.initialJob?.spec ?? firstStateFor(v, rememberedSpec()).spec;
    return { doc: docFromSpec(spec, mediaLiteOf(v)), media };
  }
  return { doc: emptyDoc(rememberedSpec()?.output), media };
}

async function resolveWorkspaceMedia(
  ws: AccountWorkspace,
  currentMedia: Record<string, MediaLite>,
): Promise<Record<string, MediaLite>> {
  const result: Record<string, MediaLite> = { ...currentMedia };
  try {
    const localAssets = await ws.listAssets();
    for (const a of localAssets) {
      if (!result[a.id]) {
        result[a.id] = {
          id: a.id,
          kind: a.type === "image" || a.type === "audio" ? a.type : "video",
          fileName: a.name,
          // (the package's own details of the file; the server's replace them once it has seen it)
          width: a.width ?? 1920,
          height: a.height ?? 1080,
          fps: a.fps ?? 30,
          duration: a.duration ?? 0,
          hasAudio: a.type !== "image",
          suggestedKey: null,
          keyKind: null,
        };
      }
    }
  } catch (err) {
    console.error("Failed to resolve workspace media", err);
  }
  return result;
}

function StudioInner(props: Props) {
  const { initialJob, initialProject, capability } = props;
  const router = useRouter();
  const wide = useMedia("(min-width: 1024px)");
  const xwide = useMedia("(min-width: 1536px)");
  // short screens: the Export & Share box moves into the inspector column and templates start folded
  const tall = useMedia("(min-height: 820px)");

  const [hist, dispatchHistory] = useReducer(reducer, null, () =>
    initHistory(initialDocState(props)),
  );
  const ds = hist.present;
  const doc = ds.doc;
  const dispatchDoc = useCallback(
    (action: DocAction, group?: string) =>
      dispatchHistory({ type: "do", action, group, now: Date.now() }),
    [],
  );
  const [metas, setMetas] = useState<Record<string, VideoMeta>>(() =>
    Object.fromEntries(props.initialMedia.map((m) => [m.id, m])),
  );

  // selection: a clip on the timeline (or nothing). Background Removal works on the selected video clip,
  // or on the first video of Video 1 when nothing is selected.
  const [proxyMode, setProxyMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("vdo_proxy_mode") === "1";
    } catch {
      return false;
    }
  });
  const toggleProxyMode = useCallback(() => {
    setProxyMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("vdo_proxy_mode", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(
    new Set(),
  );
  const timelineApiRef = useRef<TimelineApi | null>(null);
  const selected = selectedId ? findClip(doc, selectedId) : null;
  const activeClip: VideoClip | null = selected
    ? selected.clip.type === "video"
      ? (selected.clip as VideoClip)
      : null
    : defaultVideoClip(doc);
  // the uploads this project uses right now (My Assets marks them; ds.media also remembers deleted ones)
  const usedMedia = useMemo(() => new Set(mediaIdsOf(doc)), [doc]);
  // the clip view plays the clip's own sound settings (volume, clip and Video 1 mute, fades)
  const mainMuted = mainTrack(doc).muted;
  const onMain =
    !!activeClip && mainTrack(doc).clips.some((c) => c.id === activeClip.id);
  const activeSound = useMemo(
    () =>
      activeClip
        ? {
            volume: activeClip.volume,
            muted: activeClip.muted || (onMain && mainMuted),
            fadeIn: activeClip.fadeIn,
            fadeOut: activeClip.fadeOut,
            in: activeClip.in,
            out: activeClip.out,
          }
        : undefined,
    [activeClip, onMain, mainMuted],
  );
  const video = activeClip ? (metas[activeClip.mediaId] ?? null) : null;
  const state: StudioState = activeClip
    ? (clipStudioState(ds, activeClip.id) ?? NO_CLIP)
    : { ...NO_CLIP, spec: { ...DEFAULT_SPEC, output: doc.output } };
  const dispatch = (a: StudioAction, group?: string) => {
    if (a.type === "output")
      return dispatchDoc({ type: "output", patch: a.patch }, group);
    if (activeClip)
      dispatchDoc({ type: "clip", clipId: activeClip.id, action: a }, group);
  };
  // undo groups for single edits (each one its own step)
  const editSeq = useRef(0);
  const hasClips = doc.tracks.some((t) => t.clips.length > 0);
  const firstVideo =
    props.initialMedia.find((m) => (m.kind ?? "video") === "video") ?? null;
  const opened = !!props.initialDoc || !!initialJob;

  // panels: on desktop the rail opens the side panel (Media / Projects); on phones it picks the section under the preview
  const [leftPanel, setLeftPanel] = useState<SidePanel | null>(() =>
    !hasClips || window.innerWidth >= 1280 ? "media" : null,
  );
  const [phoneTab, setPhoneTab] = useState<PanelId>(
    hasClips ? "edit" : "media",
  );
  const [workspaceView, setWorkspaceView] = useState<"studio" | "templates">(
    "studio",
  );
  const [notice, setNotice] = useState(props.notice);
  // the preview: the whole timeline ("program"), or one clip for tuning its background removal
  const [mode, setMode] = useState<"program" | "clip">("program");
  // Program and This clip side by side (wide screens only; remembered)
  const [split, setSplitOn] = useState(() => {
    try {
      return localStorage.getItem(SPLIT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const splitShown = split && wide && hasClips;
  // the clip view is showing: alone, or on the right of the split view
  const clipShown = mode === "clip" || splitShown;
  const [view, setView] = useState<View>(() =>
    firstVideo &&
    !opened &&
    firstVideo.keyKind &&
    firstVideo.keyKind !== "black"
      ? "original"
      : "removed",
  );
  // green/blue clips start by picking the color; black-background clips don't need a pick
  const [picking, setPicking] = useState(false);
  const [pickReturnMode, setPickReturnMode] = useState<"program" | "clip" | null>(null);
  const [pickWarning, setPickWarning] = useState<string | null>(null);
  const [bg, setBg] = useState<Bg>("checker");
  const [custom, setCustom] = useState("#ffffff");
  const [bgMedia, setBgMedia] = useState<
    Partial<Record<"image" | "video", BgMedia>>
  >({});
  const chooseBgMedia = (file: File, kind: "image" | "video") => {
    setBgMedia((m) => {
      if (m[kind]) URL.revokeObjectURL(m[kind]!.url);
      return {
        ...m,
        [kind]: { kind, url: URL.createObjectURL(file), name: file.name },
      };
    });
    setBg(kind);
  };
  const [highlight, setHighlight] = useState(false);
  const [pausedT, setPausedT] = useState<number | null>(0);
  const [lastT, setLastT] = useState(0);
  const [jobId, setJobId] = useState<string | null>(initialJob?.id ?? null);
  // the export started on this page (listed in Background tasks from its start, even when it's quick)
  const [ownJob, setOwnJob] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // the export file format: MP4 is the recommended default (lib/export/presets)
  const [exportFormat, setExportFormat] =
    useState<ExportFormat>(DEFAULT_FORMAT);
  const [helpOpen, setHelpOpen] = useState(false);
  // Search tools (⌘K), focus mode (no side panels: a big preview), the versions list (from the project menu)
  const [searchOpen, setSearchOpen] = useState(false);
  const [startWithVoice, setStartWithVoice] = useState(false);
  const [focus, setFocus] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [aiTooltipState, setAiTooltipState] = useState<{
    isOpen: boolean;
    anchor?: { x: number; y: number } | null;
    target?: {
      trackId?: string;
      index?: number;
      at?: number;
      clipId?: string;
      targetDescription?: string;
    };
    initialMediaType?: UniversalMediaType;
  }>({ isOpen: false });
  const nameRef = useRef<HTMLInputElement>(null);
  const [silenceFor, setSilenceFor] = useState<string | null>(null);
  const [highlightsFor, setHighlightsFor] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState<RecordMode | null>(null);
  // crop mode on the program preview (a video or picture clip)
  const [cropFor, setCropFor] = useState<string | null>(null);
  // a watermark box being placed on the preview
  const [patchEdit, setPatchEdit] = useState<{
    clipId: string;
    patchId: string;
  } | null>(null);
  // the transition into this Video 1 clip is selected (the inspector shows it)
  const [selTransition, setSelTransition] = useState<string | null>(null);
  // the Brand Kit logo clicked on the preview (its box, and the Logo card in the inspector)
  const [logoSel, setLogoSel] = useState(false);
  // a picture file dropped on the preview: where it goes once uploaded
  const pendingPlace = useRef<{
    name: string;
    pt: { x: number; y: number };
  } | null>(null);
  const logoShown = logoSel && !!doc.watermark && !selectedId && !selTransition;
  const [aiOpen, setAiOpen] = useState(false);
  const [smartMixOpen, setSmartMixOpen] = useState(false);
  const [isAnalyzingMix, setIsAnalyzingMix] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [transcriptEditOpen, setTranscriptEditOpen] = useState(false);
  const [thumbOpen, setThumbOpen] = useState(false);
  const [thumbFrame, setThumbFrame] = useState<string | null>(null);
  const [voiceoverMode, setVoiceoverMode] = useState<"tts" | "mic">("tts");
  const [textToVideoOpen, setTextToVideoOpen] = useState(false);
  const [bRollOpen, setBRollOpen] = useState(false);
  const [smartCropOpen, setSmartCropOpen] = useState(false);
  const [audioTranslatorOpen, setAudioTranslatorOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [extendVideoOpen, setExtendVideoOpen] = useState(false);
  const [objectRemoverOpen, setObjectRemoverOpen] = useState(false);
  const [upscaleOpen, setUpscaleOpen] = useState(false);
  // ✦ Gemini: the Generate image / background window ("picture" | "background") and the Generate video window
  const [genImage, setGenImage] = useState<"picture" | "background" | null>(
    null,
  );
  const [genVideoOpen, setGenVideoOpen] = useState(false);
  const [grokOpen, setGrokOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // something was copied (enables Paste in the timeline menu)
  const [hasCopy, setHasCopy] = useState(() => !!copied);
  const [hasCopiedStyle, setHasCopiedStyle] = useState(() => !!copiedStyle);
  // the inspector's tab for video and picture clips (Basic · Remove BG · Color · Audio · Speed · More)
  const [inspTab, setInspTab] = useState<InspectorTab>("basic");
  // Import (Add media): this computer, Pexels, Pixabay
  const [importTab, setImportTab] = useState<ImportTab | null>(null);
  // AI Tools → Settings (API keys); any "Open AI settings" button asks for it with an event
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  useEffect(() => {
    const open = () => setAiSettingsOpen(true);
    window.addEventListener("VDO:ai-settings", open);
    return () => window.removeEventListener("VDO:ai-settings", open);
  }, []);
  const gemini = useGemini();
  const serverCaps = useServerCaps();
  const [silenceMarks, setSilenceMarks] = useState<Range[] | null>(null);
  const [timelineH, setTimelineH] = useTimelineHeight(tall ? 236 : 196);
  // panel widths: drag the lines between the panels (remembered)
  const defaultAiW = () =>
    typeof window === "undefined" ? 640 : Math.round(window.innerWidth * 0.44);
  const [leftW, setLeftW] = usePanelWidth(
    "VDO:v1:leftPanelWidth",
    () => 256,
    200,
    560,
  );
  const [rightW, setRightW] = usePanelWidth(
    "VDO:v1:inspectorWidth",
    () =>
      typeof window !== "undefined" && window.innerWidth >= 1536 ? 336 : 304,
    260,
    560,
  );
  const [aiW, setAiW] = usePanelWidth(
    "VDO:v1:aiPanelWidth",
    defaultAiW,
    420,
    1100,
  );
  // the program clock (timeline seconds) and the clip view's own clock (seconds in the clip's video)
  const [clock] = useState(createClock);
  const [clipClock] = useState(createClock);
  const programRef = useRef<PlayerApi | null>(null);
  const clipRef = useRef<PlayerApi | null>(null);

  // Motion tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState<{
    percent: number;
    frame: number;
    total: number;
    time: number;
  } | null>(null);
  const [lostTargetInfo, setLostTargetInfo] = useState<{
    pointId: string;
    time: number;
    keyframe: TrackingKeyframe;
  } | null>(null);
  const trackingAbortRef = useRef<AbortController | null>(null);

  // clamp playhead time if document duration shrinks (e.g. clip deleted, trimmed)
  useEffect(() => {
    const hasAnyClips = doc.tracks.some((t) => t.clips.length > 0);
    if (hasAnyClips) {
      const maxT = docDuration(doc);
      if (clock.get() > maxT) {
        clock.set(Math.max(0, maxT));
      }
    }
  }, [doc, clock]);

  const { user, accountCode, workspace } = useAuth();
  // local-first media (lib/media/localMedia): imported files play from this computer while they upload
  const localVer = useSyncExternalStore(subscribeLocal, localVersion, () => 0);
  useEffect(() => installUploadGate(), []);
  // (the account is known before its storage opens: the copies of a project's files are read back at once)
  useEffect(() => setLocalAccount(accountCode ?? workspace?.accountCode ?? null), [accountCode, workspace]);
  const [deviceFolder, setDeviceFolder] = useState<string | null>("Documents/vdo");

  useEffect(() => {
    if (!accountCode) return;
    void getDeviceFolderInfo(accountCode).then((info) => {
      setDeviceFolder(info.folderName);
    });
  }, [accountCode]);

  const handleChooseFolder = async () => {
    if (!accountCode) return;
    const res = await pickDeviceFolder(accountCode);
    if (res.success && res.folderName) {
      setDeviceFolder(res.folderName);
      setNotice(`✓ Autosaving drafts to "${res.folderName}"`);
    } else if (res.error && res.error !== "Selection cancelled") {
      setNotice(`Could not select folder: ${res.error}`);
    }
  };
  const assets = useAssets(user?.id, workspace);
  // a Veo video keeps being made while its window is closed; when it's done it shows in My Assets
  const veo = useVeoJob(() => {
    void assets.refresh();
    if (!genVideoOpenRef.current)
      setNotice(
        "Your Gemini video is ready. It's in My Assets (Media), or open AI Tools → Generate Video to add it.",
      );
  });
  const genVideoOpenRef = useRef(false);
  useEffect(() => {
    genVideoOpenRef.current = genVideoOpen;
  }, [genVideoOpen]);
  // everything the player may draw: timeline uploads, and any upload used as a backdrop (My Assets)
  const playerMedia = useMemo(() => {
    const out: Record<string, MediaLite> = {};
    for (const a of assets.items ?? []) out[a.id] = mediaLiteOf(a);
    for (const m of Object.values(metas)) out[m.id] = mediaLiteOf(m);
    return { ...out, ...ds.media };
  }, [assets.items, metas, ds.media]);
  const projects = useProjects(user?.id, workspace);
  // My Assets: files of this tab still uploading (or just uploaded, before the list refreshes) come first,
  // from what the editor already knows about them (lib/media/localMedia)
  const shownAssets = useMemo(() => {
    const server = assets.items;
    const have = new Set((server ?? []).map((a) => a.id));
    const mine = localItems()
      .filter((it) => !have.has(it.id) && metas[it.id])
      .map((it) => ({ ...metas[it.id]!, usedIn: [] }));
    // files kept only on this computer (their copy in the browser), from any project
    const shown = new Set([...have, ...mine.map((m) => m.id)]);
    const kept = listLocalFiles()
      .filter((m) => !shown.has(m.id))
      .map((m) => ({ ...m, usedIn: [] }));
    const local = [...mine, ...kept];
    return server ? [...local, ...server] : local.length ? local : null;
    // (localVer: an upload started, moved on or finished)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.items, metas, localVer]);
  const refreshLists = useCallback(() => {
    void assets.refresh();
    void projects.refresh();
  }, [assets, projects]);
  // saves change project names/dates and which uploads are used: refresh both lists
  const sync = useProjectSync(initialProject, refreshLists);

  const projectName = sync.project?.name || "Untitled project";
  useEffect(() => {
    document.title = `${projectName} · ViPlay Studio`;
  }, [projectName]);

  const docRef = useRef(doc);
  docRef.current = doc;
  const docMediaRef = useRef(ds.media);
  docMediaRef.current = ds.media;
  const mediaRef = useRef(ds.media);
  mediaRef.current = ds.media;

  const setTimelineDoc = useCallback(
    (fn: (prev: TimelineDoc) => TimelineDoc) => {
      const next = fn(docRef.current);
      if (next !== docRef.current) {
        dispatchDoc(
          { type: "replaceDoc", doc: next, media: mediaRef.current },
          `ai-gen:${++editSeq.current}`,
        );
        // back-to-back calls (before React re-renders) must see this update, not the last render's doc
        docRef.current = next;
      }
    },
    [dispatchDoc],
  );

  const aiGenManager = useAiGenerationManager({
    doc,
    setDoc: setTimelineDoc,
    onMediaResolved: (newMedia) => {
      dispatchDoc(
        {
          type: "replaceDoc",
          doc: docRef.current,
          media: { [newMedia.id]: newMedia },
        },
        `ai-media:${newMedia.id}`,
      );
    },
    onAssetCreated: () => {
      void assets.refresh();
    },
  });

  const { job, connection } = useJobPolling(jobId, (j, fresh) => {
    if (!fresh) return;
    // the transparent website pack plays in the clip view ("Final file"); an MP4 plays in the Export dialog
    if (j.files.some((f) => f.kind === "webm")) {
      setMode("clip");
      setView("final");
    }
    setExportOpen(true);
  });
  const running = !!job && (job.state === "queued" || job.state === "running");

  // the address bar always points at the open project
  const projectId = sync.project?.id ?? null;
  useEffect(() => {
    if (projectId) window.history.replaceState(null, "", `/?p=${projectId}`);
  }, [projectId]);

  // If the server didn't find the project (e.g. newly imported or offline local project), check the local workspace
  // (once the account's storage is open: it opens a moment after the editor, so this runs again then)
  const loadedLocalProject = useRef(false);
  /** Quick server work on a clip (freeze frame, key color, auto color): a small note over the stage meanwhile. */
  const [working, setWorking] = useState<string | null>(null);
  /** Opening a project, making one from a template…: said over the stage until it's there. */
  const [stageBusy, setStageBusy] = useState<string | null>(null);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStageBusy = useCallback((label: string | null, maxMs = 20_000) => {
    if (busyTimer.current) clearTimeout(busyTimer.current);
    busyTimer.current = null;
    setStageBusy(label);
    // (a navigation that never finishes must not leave the stage covered)
    if (label) busyTimer.current = setTimeout(() => setStageBusy(null), maxMs);
  }, []);
  useEffect(() => () => void (busyTimer.current && clearTimeout(busyTimer.current)), []);
  useEffect(() => {
    if (props.initialProject || loadedLocalProject.current) return;
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const pid = searchParams.get("p");
    if (!pid) return;
    const ws = workspace ?? localWorkspaceManager.getActiveWorkspace();
    if (!ws) return;
    loadedLocalProject.current = true;

    void (async () => {
      showStageBusy("Opening the project…");
      try {
        const localProj = await ws.getProject(pid);
        if (localProj) {
          const assetMetas = await resolveWorkspaceMedia(ws, ds.media);
          dispatchDoc(
            {
              type: "replaceDoc",
              doc: interruptOrphanedGenerations(localProj.doc),
              media: assetMetas,
            },
            `init:${localProj.id}`,
          );
          sync.attach({ id: localProj.id, name: localProj.name });
          setNotice(null);
        }
      } catch (err) {
        console.error("Failed to load local project on init", err);
      } finally {
        showStageBusy(null);
      }
    })();
  }, [props.initialProject, workspace]);

  /**
   * A project's files (lib/media/localMedia): those with a copy in this browser play from it again, an upload
   * that didn't finish (or stopped) goes on, and files the editor doesn't know yet get their details.
   */
  const restoreLocalFor = useCallback(async (d: TimelineDoc) => {
    const ids = mediaIdsOf(d);
    releaseLocalExcept(new Set(ids));
    const serverMeta = async (id: string): Promise<VideoMeta | null> => {
      try {
        const r = await fetch(`/api/videos/${id}`);
        return r.ok ? ((await r.json()) as VideoMeta) : null;
      } catch {
        return null;
      }
    };
    const unknown = await restoreLocal(ids, async (id) => !!(await serverMeta(id)));
    // files of an imported .vdo package are in the account's storage: they play from there too
    const ws = localWorkspaceManager.getActiveWorkspace();
    if (ws)
      await Promise.all(
        ids
          .filter((id) => !localItem(id))
          .map(async (id) => {
            const [a, b] = await Promise.all([ws.getAsset(id).catch(() => null), ws.getAssetBlob(id).catch(() => null)]);
            if (a && b) adoptLocal(id, b, a.name, a.type === "image" || a.type === "audio" ? a.type : "video");
          }),
      );
    // details of files on the server the editor doesn't have yet (a project reopened from this browser)
    const known = new Set(unknown.map((m) => m.id));
    const fetched = (await Promise.all(ids.filter((id) => !known.has(id) && !docMediaRef.current[id]).map(serverMeta))).filter((m): m is VideoMeta => !!m);
    if (fetched.length) setMetas((x) => ({ ...x, ...Object.fromEntries(fetched.map((m) => [m.id, m])) }));
    const lites = [...unknown, ...fetched.map(mediaLiteOf)];
    if (lites.length) dispatchHistory({ type: "everywhere", update: (st) => withMediaKnown(st, lites) });
  }, []);
  // the open project's files, once the account's storage is open (and again when another project opens)
  const restoredFor = useRef<string | null>(null);
  const localAccount = accountCode ?? workspace?.accountCode ?? null;
  useEffect(() => {
    if (!localAccount) return;
    const key = `${localAccount}:${projectId ?? ""}`;
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    void restoreLocalFor(docRef.current);
  }, [localAccount, projectId, restoreLocalFor]);
  // a file kept on this computer put on the timeline from My Assets (not open in this tab yet): it plays
  // from its copy in the browser
  const docMediaKey = mediaIdsOf(doc).join(",");
  useEffect(() => {
    if (!localAccount || !docMediaKey) return;
    const missing = docMediaKey.split(",").filter((id) => !localItem(id));
    if (missing.length) void restoreLocal(missing, async (id) => (await fetch(`/api/videos/${id}`).catch(() => null))?.ok ?? true);
  }, [docMediaKey, localAccount]);

  // autosave: every change to the timeline goes into the project
  const firstDoc = useRef(true);
  const saveDoc = sync.save;
  useEffect(() => {
    if (firstDoc.current) {
      firstDoc.current = false;
      return;
    }
    if (hasClips) saveDoc({ doc });
  }, [doc, hasClips, saveDoc]);

  // the first media on a new timeline (or an older link) makes a project
  const createProject = sync.create;
  const madeProject = useRef(!!initialProject);
  // (after New project: the old export isn't the new project's)
  const afterReset = useRef(false);
  useEffect(() => {
    if (madeProject.current || !hasClips) return;
    madeProject.current = true;
    void createProject(
      doc,
      afterReset.current ? undefined : initialJob?.id,
    ).then(() => refreshLists());
  }, [hasClips, createProject, doc, initialJob, refreshLists]);

  /** Clip-view time (in the clip's video) → timeline time, for the playhead. */
  useEffect(
    () =>
      clipClock.subscribe(() => {
        if (mode !== "clip" || !activeClip) return;
        const start = clipStart(doc, activeClip.id);
        // source time → timeline time (speed; a reversed clip runs from its end)
        const off =
          (activeClip.reversed
            ? activeClip.out - clipClock.get()
            : clipClock.get() - activeClip.in) / (activeClip.speed ?? 1);
        clock.set(
          Math.min(
            start + clipLength(activeClip),
            Math.max(start, start + off),
          ),
        );
      }),
    [clipClock, clock, mode, activeClip, doc],
  );

  // the latest timeline, for uploads that finish later (their callback was made on an older render)
  const live = useRef({ doc, hasClips, activeClip });
  useEffect(() => {
    live.current = { doc, hasClips, activeClip };
  });

  // a background upload ended (lib/media/localMedia)
  useEffect(() => {
    const offDone = onLocalUploaded((meta) => {
      // the server's details (exact length and frame rate, sound, detected green screen) replace the
      // browser's first guess, in every undo step (not an undo step of its own)
      setMetas((m) => ({ ...m, [meta.id]: meta }));
      const lite = mediaLiteOf(meta);
      dispatchHistory({ type: "everywhere", update: (st) => withMediaFacts(st, lite) });
      refreshLists();
    });
    const offFail = onLocalUploadFailed(({ id, message, permanent }) => {
      const name = localItem(id)?.name ?? "A file";
      // (it plays and edits here either way: only the server features can't use it)
      if (permanent) setNotice(`“${name}” couldn't be sent to the server: ${message} It still plays and edits here; the export and AI tools can't use it.`);
      else setNotice(`“${name}” couldn't be sent to the server (${message}). It still plays and edits here; it's sent again when you export or use an AI tool.`);
    });
    return () => {
      offDone();
      offFail();
    };
  }, [dispatchDoc, refreshLists]);

  /** A picture dropped on the preview: logo-sized (a fifth of the width) where it was dropped, for the whole video. */
  const placeLogo = (v: VideoMeta, pt: { x: number; y: number }) => {
    const { doc } = live.current;
    const d = docDuration(doc);
    addToTimeline(v, {
      overlay: true,
      at: 0,
      duration: d > 0 ? d : undefined,
      patch: {
        transform: logoTransform(
          pt,
          v.info.width,
          v.info.height,
          doc.canvas.width,
          doc.canvas.height,
        ),
      },
    });
  };
  /** Something dropped on the program picture (true: used here). */
  const dropOnPreview = (
    pt: { x: number; y: number },
    dt: DataTransfer,
  ): boolean => {
    if (!live.current.hasClips) return false;
    // 1. Text style dropped directly onto canvas
    const textStyleId = dt.getData(TEXT_DRAG) || textDrag()?.styleId;
    if (textStyleId) {
      addTextAt(textStyleId, { point: pt });
      return true;
    }
    // 2. Element preset or emoji dropped directly onto canvas
    const elRaw = dt.getData(ELEMENT_DRAG);
    const activeEl = elementDrag();
    if (elRaw || activeEl) {
      try {
        const parsed = elRaw ? JSON.parse(elRaw) : activeEl;
        if (parsed?.presetId) {
          addElementAt(parsed.presetId, { point: pt });
          return true;
        }
        if (parsed?.emoji) {
          addElementAt({ emoji: parsed.emoji }, { point: pt });
          return true;
        }
      } catch {
        if (elRaw) {
          addElementAt(elRaw, { point: pt });
          return true;
        }
      }
    }
    // 3. Library clip dropped directly onto canvas
    const memeRaw = dt.getData(MEME_DRAG);
    const activeMeme = memeDrag();
    if (memeRaw || activeMeme) {
      try {
        const item: LibraryClipDragItem = memeRaw ? JSON.parse(memeRaw) : activeMeme;
        if (item?.id) {
          void addMemeToTimeline(item, { overlay: true, point: pt });
          return true;
        }
      } catch {
        if (activeMeme) {
          void addMemeToTimeline(activeMeme, { overlay: true, point: pt });
          return true;
        }
      }
    }
    // 4. Media asset dropped
    const id = dt.getData(MEDIA_DRAG);
    const v = id ? (assets.items ?? []).find((a) => a.id === id) : undefined;
    if (v) {
      if (v.kind === "image") placeLogo(v, pt);
      else addToTimeline(v);
      return true;
    }
    // 5. File dropped
    const files = [...dt.files];
    if (files.length === 1 && files[0].type.startsWith("image/")) {
      pendingPlace.current = { name: files[0].name, pt };
      uploadFiles(files);
      return true;
    }
    return false;
  };
  /** Put an upload on the timeline: videos at the end of Video 1, pictures and sound at the playhead. */
  const addToTimeline = (
    v: VideoMeta,
    opts: {
      trackId?: string | null;
      at?: number;
      index?: number;
      overlay?: boolean;
      duration?: number;
      patch?: Record<string, unknown>;
      group?: string;
    } = {},
  ) => {
    const { doc, hasClips, activeClip } = live.current;
    const m = mediaLiteOf(v);
    setMetas((prev) => ({ ...prev, [v.id]: v }));
    const wasEmpty = !hasClips && !opts.overlay;
    const group = opts.group ?? `add:${v.id}:${++editSeq.current}`;
    if (wasEmpty && m.kind !== "audio")
      dispatchDoc({ type: "setCanvas", patch: canvasFor(m) }, group);
    let ops: EditSpec["ops"] | undefined;
    if (m.kind === "video") {
      const base = activeClip ? clipSpec(doc, activeClip) : rememberedSpec();
      const st = firstStateFor(v, base);
      ops = st.spec.ops;
      if (wasEmpty)
        dispatchDoc(
          { type: "output", patch: { audio: st.spec.output.audio } },
          group,
        );
    }
    const at =
      opts.at ??
      (m.kind === "video" && !opts.trackId ? undefined : clock.get());
    const id = `m${++editSeq.current}${newId(doc)}`;
    // (overlay: a picture-in-picture video on a free overlay track, e.g. the camera of a screen recording)
    dispatchDoc(
      {
        type: "addMedia",
        media: m,
        options: {
          ops,
          at,
          trackId: opts.trackId ?? undefined,
          index: opts.index,
          id,
          overlay: opts.overlay,
          duration: opts.duration,
        },
      },
      group,
    );
    if (opts.patch)
      dispatchDoc({ type: "setClip", clipId: id, patch: opts.patch }, group);
    setSelectedId(id);
    setNotice(null);
    if (m.kind === "video") {
      // a green/blue/black clip: open it in the clip view to set up its background removal
      // the clip keeps its background: it shows in the program view (the Background Removal card offers "Remove it")
      setMode("program");
      setView("removed");
      setPicking(false);
      setPickWarning(null);
      setPausedT(0);
      setLastT(0);
    } else setMode("program");
    setJobId(null);
    if (!wide) setPhoneTab("edit");
    void assets.refresh();
  };

  /** Insert or overlay a library clip from Library into the timeline or canvas. */
  const addMemeToTimeline = async (
    item: LibraryClipDragItem,
    opts: {
      trackId?: string | null;
      at?: number;
      index?: number;
      overlay?: boolean;
      point?: { x: number; y: number };
    } = {},
  ): Promise<boolean> => {
    setWorking("Adding the clip…");
    try {
      const res = await fetch("/api/library/memes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          title: item.title,
          duration: item.duration,
        }),
      });
      // (the server says why: e.g. the online clip couldn't be downloaded)
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null)) ?? "Could not import meme clip.");
      const videoMeta: VideoMeta = await res.json();

      if (opts.point) {
        // Dropped onto preview canvas at point (0..1)
        const { doc } = live.current;
        const transform = logoTransform(
          opts.point,
          videoMeta.info.width,
          videoMeta.info.height,
          doc.canvas.width,
          doc.canvas.height,
        );
        addToTimeline(videoMeta, {
          overlay: true,
          at: clock.get(),
          duration: videoMeta.info.duration,
          patch: { transform },
        });
      } else {
        // If trackId is explicitly passed, obey it.
        // Otherwise, if the timeline already has clips, insert as an overlay at current playhead.
        // If the timeline is empty, insert as the first clip on main track at 0.
        const hasExistingClips = live.current.hasClips;
        let shouldOverlay = false;
        if (opts.overlay !== undefined) {
          shouldOverlay = opts.overlay;
        } else if (opts.trackId) {
          const mainId = mainTrack(live.current.doc)?.id;
          shouldOverlay = opts.trackId !== "v1" && opts.trackId !== mainId;
        } else {
          shouldOverlay = hasExistingClips;
        }

        const at =
          opts.at !== undefined
            ? opts.at
            : shouldOverlay
              ? clock.get()
              : undefined;

        addToTimeline(videoMeta, {
          overlay: shouldOverlay,
          trackId:
            opts.trackId ??
            (shouldOverlay ? undefined : mainTrack(live.current.doc)?.id),
          at,
          index: opts.index,
          duration: videoMeta.info.duration,
        });
      }
      return true;
    } catch (e) {
      // (shown, not thrown: the drop handlers don't wait for it)
      setNotice((e as Error).message);
      return false;
    } finally {
      setWorking(null);
    }
  };

  /** Import a library stock clip directly into My Assets without inserting onto timeline. */
  const importMemeToAssets = async (item: LibraryClipDragItem) => {
    setWorking("Importing clip to My Assets…");
    try {
      const res = await fetch("/api/library/memes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          title: item.title,
          duration: item.duration,
        }),
      });
      if (!res.ok) {
        throw new Error(
          apiErrorMessage(await res.json().catch(() => null)) ??
            "Could not import clip.",
        );
      }
      const videoMeta: VideoMeta = await res.json();
      setMetas((prev) => ({ ...prev, [videoMeta.id]: videoMeta }));
      await assets.refresh();
      setNotice(`Imported “${item.title}” to My Assets.`);
    } catch (e) {
      setNotice((e as Error).message || "Failed to import clip.");
    } finally {
      setWorking(null);
    }
  };

  // several files at once: they upload one after another
  const queue = useRef<File[]>([]);
  const nextUpload = useRef<() => void>(() => {});
  const onUploaded = useRef(addToTimeline);
  useEffect(() => {
    onUploaded.current = (v) => {
      // a picture dropped on the preview: it goes where it was dropped, like a logo
      const place = pendingPlace.current;
      pendingPlace.current = null;
      if (place && v.kind === "image" && v.fileName === place.name)
        placeLogo(v, place.pt);
      else addToTimeline(v);
    };
  });
  const {
    state: uploadState,
    busy: uploadBusy,
    start: startUpload,
    cancel: cancelUpload,
    clearError: clearUploadError,
    openPicker,
    inputRef: fileInputRef,
  } = useUpload((v) => {
    onUploaded.current(v);
    setTimeout(() => nextUpload.current(), 0);
  });
  useEffect(() => {
    nextUpload.current = () => {
      const f = queue.current.shift();
      if (f) void startUpload(f);
    };
  });

  const resetEditor = () => {
    // the next media makes a new project (also when the page doesn't reload)
    madeProject.current = false;
    afterReset.current = true;
    if (uploadBusy) cancelUpload();
    clearUploadError();
    dispatchHistory({ type: "reset", state: { doc: emptyDoc(), media: {} } });
    setSelectedId(null);
    setJobId(null);
    setMode("program");
    setView("removed");
    setPicking(false);
    setPickWarning(null);
    setStartError(null);
    setBg("checker");
    setBgMedia((m) => {
      for (const x of Object.values(m)) if (x) URL.revokeObjectURL(x.url);
      return {};
    });
    setCustom("#ffffff");
    setHighlight(false);
    setPausedT(0);
    setLastT(0);
    setExportOpen(false);
    setNotice(null);
    setPhoneTab("media");
    setLeftPanel((l) => l ?? "media");
  };

  /** Leave the open project: a fresh editor at "/editor" (preserving the active panel if specified). */
  const toEmptyEditor = (keepPanel?: SidePanel | null) => {
    resetEditor();
    if (keepPanel !== undefined) {
      setLeftPanel(keepPanel);
    }
    router.replace("/editor");
  };

  // Account switch: when user account changes, cleanly detach previous project and reset timeline
  const prevUserRef = useRef(user?.id);
  useEffect(() => {
    if (prevUserRef.current !== undefined && prevUserRef.current !== user?.id) {
      void sync.detach(false).then(() => {
        toEmptyEditor();
        refreshLists();
      });
    }
    prevUserRef.current = user?.id;
  }, [user?.id, sync, refreshLists]);

  /** Logo / New project: an empty editor with default settings. The open project stays saved. */
  /** A new, empty project (`withBlank`: it starts with a 3-second blank scene, ready for a title). */
  const startOver = (o: { withBlank?: boolean } = {}) => {
    if (
      running &&
      !window.confirm(
        "An export is still running. Start a new project anyway? The export will be canceled.",
      )
    )
      return;
    if (running && jobId)
      void fetch(`/api/jobs/${jobId}`, { method: "DELETE" }).catch(() => null);
    removeLocal(LAST_SPEC_KEY);
    removeLocal(LAST_SETTINGS_KEY);
    // (no new project is made from the old timeline: the editor reloads empty at "/")
    void sync.detach().then(() => {
      refreshLists();
      toEmptyEditor();
      if (o.withBlank === true) addBlankAt(0);
    });
  };

  const openProject = async (id: string) => {
    if (
      running &&
      !window.confirm(
        "An export is still running. Open another project anyway?",
      )
    ) {
      showStageBusy(null);
      return;
    }
    showStageBusy("Opening the project…");
    await sync.flush();
    const ws = localWorkspaceManager.getActiveWorkspace();
    if (ws) {
      try {
        const localProj = await ws.getProject(id);
        if (localProj) {
          const assetMetas = await resolveWorkspaceMedia(ws, ds.media);
          dispatchDoc(
            {
              type: "replaceDoc",
              doc: interruptOrphanedGenerations(localProj.doc),
              media: assetMetas,
            },
            `open:${localProj.id}`,
          );
          sync.attach({ id: localProj.id, name: localProj.name });
          window.history.pushState(null, "", `/?p=${id}`);
          showStageBusy(null);
          return;
        }
      } catch {
        // Fall through to router push
      }
    }
    // (the editor opens again with this project: the overlay stays until then)
    router.push(`/editor?p=${id}`);
  };

  const handleExportVDO = async (portable: boolean) => {
    const ws = localWorkspaceManager.getActiveWorkspace();
    if (!ws) {
      setNotice(
        "Storage workspace not ready. Please ensure you are logged in.",
      );
      return;
    }
    await sync.flush();
    try {
      let proj = sync.project?.id ? await ws.getProject(sync.project.id) : null;
      if (!proj) {
        const pid = sync.project?.id || crypto.randomUUID();
        const name = sync.project?.name || "Untitled project";
        proj = newProject({
          id: pid,
          name,
          doc,
          now: Date.now(),
        });
      } else {
        proj.doc = doc;
        if (sync.project?.name) proj.name = sync.project.name;
        proj.updatedAt = Date.now();
      }
      await ws.saveProject(proj);
      const blob = await exportVDO(proj, ws, { portable });
      const safeName = (proj.name || "project").replace(/[/\\?%*:|"<>]/g, "-");
      const suggestedName = `${safeName}${portable ? ".portable" : ""}.vdo`;
      const result = await saveFileWithPicker(blob, suggestedName, {
        description: portable ? "Portable ViPlay Project (with media)" : "ViPlay Project File",
        accept: { "application/x-vdo": [".vdo"] },
      });
      if (result.saved) {
        setNotice(
          `Saved “${result.fileName || proj.name}” to device storage.`,
        );
      }
    } catch (err) {
      console.error("Failed to export project", err);
      setNotice(
        `Failed to export VDO: ${(err as Error).message || "Unknown error"}`,
      );
    }
  };

  const loadVDOFile = async (file: File, ws: AccountWorkspace) => {
    try {
      const imported = await importVDO(file, ws);

      const assetMetas = await resolveWorkspaceMedia(ws, ds.media);
      dispatchDoc(
        {
          type: "replaceDoc",
          doc: interruptOrphanedGenerations(imported.doc),
          media: assetMetas,
        },
        `import:${imported.id}`,
      );
      sync.attach({ id: imported.id, name: imported.name });
      window.history.pushState(null, "", `/?p=${imported.id}`);
      refreshLists();
      setNotice(`Imported project “${imported.name}”`);
    } catch (err) {
      console.error("Failed to import ViPlay package", err);
      setNotice(`Import failed: ${(err as Error).message || "Unknown error"}`);
    }
  };

  // Window drag-and-drop & PWA launchQueue listener to import .VDO packages directly
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
      }
    };
    const handleDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const VDOFile = Array.from(files).find(
        (f) => /\.vdo$/i.test(f.name),
      );
      if (!VDOFile) return;

      e.preventDefault();
      e.stopPropagation();
      const ws = localWorkspaceManager.getActiveWorkspace();
      if (!ws) return;
      await loadVDOFile(VDOFile, ws);
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    // PWA LaunchQueue for OS double-click on .VDO files
    if (typeof window !== "undefined" && "launchQueue" in window) {
      try {
        (window as any).launchQueue.setConsumer(
          async (launchParams: { files?: any[] }) => {
            if (!launchParams?.files?.length) return;
            const ws = localWorkspaceManager.getActiveWorkspace();
            if (!ws) return;
            for (const handle of launchParams.files) {
              if (typeof handle.getFile === "function") {
                const file = await handle.getFile();
                if (
                  /\.vdo$/i.test(file.name)
                ) {
                  await loadVDOFile(file, ws);
                  break;
                }
              }
            }
          },
        );
      } catch (err) {
        console.error("Failed to register launchQueue consumer", err);
      }
    }

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [router, refreshLists, sync]);

  const onProjectDeleted = async (id: string) => {
    const ws = localWorkspaceManager.getActiveWorkspace();
    if (ws) {
      await ws.deleteProject(id);
      await ws.clearRecovery(id);
    }
    if (id === projectId || id === sync.project?.id) {
      await sync.detach(false);
      toEmptyEditor("projects");
    }
    refreshLists();
  };

  const deleteAsset = async (a: Asset): Promise<string | null> => {
    // 1. Force release local uploading or active item state
    releaseLocal(a.id, true);

    // 2. Delete from device OPFS / IndexedDB workspace if present
    const ws = workspace ?? localWorkspaceManager.getActiveWorkspace();
    if (ws) {
      try {
        await ws.deleteAsset(a.id);
      } catch (err) {
        console.warn("Failed to delete asset from workspace:", err);
      }
    }

    // 3. Forget local OPFS / index copy
    await forgetLocal(a.id);

    // 4. Remove from in-memory metas immediately so shownAssets won't resurrect it
    setMetas((prev) => {
      if (!prev[a.id]) return prev;
      const next = { ...prev };
      delete next[a.id];
      return next;
    });

    // 5. Delete on server (ignore 404/401/403 so local deletion is never blocked)
    try {
      const res = await fetch(`/api/videos/${a.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404 && res.status !== 401 && res.status !== 403) {
        throw await toApiError(res);
      }
    } catch (e) {
      console.warn("Server delete warning:", e);
    }

    refreshLists();
    return null;
  };

  /** Uploaded first, then on the timeline (files this browser can't play: the server makes a playable copy). */
  const uploadFirst = (files: File[]) => {
    if (!files.length) return;
    if (uploadBusy) {
      queue.current.push(...files);
      return;
    }
    queue.current.push(...files.slice(1));
    void startUpload(files[0]);
  };
  /**
   * New files: each one this browser can play goes on the timeline at once, playing from this computer,
   * and uploads in the background (lib/media/localMedia); the others are uploaded first, as before.
   */
  const uploadFiles = (files: File[]) => {
    if (!files.length) return;
    void (async () => {
      const later: File[] = [];
      // (the files are looked at together; each lands on the timeline as soon as it and those before it are ready)
      await inOrder(
        files,
        async (f) => {
          // (a file of the wrong type or too big: the old way says why)
          if (precheck(f)) return null;
          const url = URL.createObjectURL(f);
          try {
            return await probeLocal(f, url, PROBE_TIMEOUT_MS);
          } catch {
            return null;
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        (f, probe) => {
          if (!probe) {
            later.push(f);
            return;
          }
          const tooBig = overLimit(probe);
          if (tooBig) {
            setNotice(`“${f.name}”: ${tooBig}`);
            return;
          }
          const id = newUuid();
          // kept on this computer: sent to the server only when a server feature needs it (ensureOnServer)
          addLocal(id, f, probe.kind, probe.poster, "local");
          onUploaded.current(provisionalMeta(id, f, probe));
          void persistLocal(id, f, { ...probe, name: f.name });
        },
      );
      uploadFirst(later);
    })();
  };
  const uploadFile = (f: File) => uploadFiles([f]);

  /** Create a new project from dropped files and add them to the timeline. */
  const createProjectFromFiles = async (files: File[]) => {
    if (!files.length) return;
    if (
      running &&
      !window.confirm(
        "An export is still running. Start a new project anyway? The export will be canceled.",
      )
    )
      return;
    showStageBusy("Creating project from files…");
    try {
      await sync.flush();
      await sync.detach();
      removeLocal(LAST_SPEC_KEY);
      removeLocal(LAST_SETTINGS_KEY);
      toEmptyEditor();
      uploadFiles(files);
      const projName = files[0].name.replace(/\.[^/.]+$/, "");
      if (sync.project) {
        sync.project.name = projName;
      }
      refreshLists();
      setNotice(`Created new project “${projName}”.`);
    } catch (e) {
      setNotice((e as Error).message || "Failed to create project.");
    } finally {
      showStageBusy(null);
    }
  };

  /** Create a new project from a dropped library/meme clip and add it to the timeline. */
  const createProjectFromMeme = async (item: LibraryClipDragItem) => {
    if (
      running &&
      !window.confirm(
        "An export is still running. Start a new project anyway? The export will be canceled.",
      )
    )
      return;
    showStageBusy("Creating project from clip…");
    try {
      await sync.flush();
      await sync.detach();
      removeLocal(LAST_SPEC_KEY);
      removeLocal(LAST_SETTINGS_KEY);
      toEmptyEditor();
      await addMemeToTimeline(item);
      if (sync.project) {
        sync.project.name = item.title;
      }
      refreshLists();
      setNotice(`Created new project “${item.title}”.`);
    } catch (e) {
      setNotice((e as Error).message || "Failed to create project.");
    } finally {
      showStageBusy(null);
    }
  };

  /** Handle direct drop on a rail navigation tab (Media / Projects). */
  const handleRailDrop = async (panelId: PanelId, e: React.DragEvent) => {
    if (panelId === "media") {
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        uploadFiles(files);
        showPanel("media");
        return;
      }
      const memeJson = e.dataTransfer.getData(MEME_DRAG);
      if (memeJson) {
        e.preventDefault();
        e.stopPropagation();
        try {
          const meme = JSON.parse(memeJson);
          await importMemeToAssets(meme);
          showPanel("media");
        } catch {}
      }
    } else if (panelId === "projects") {
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const vdoFile = files.find((f) => /\.vdo$/i.test(f.name));
        const ws = localWorkspaceManager.getActiveWorkspace();
        if (vdoFile && ws) {
          await loadVDOFile(vdoFile, ws);
        } else {
          await createProjectFromFiles(files);
        }
        showPanel("projects");
        return;
      }
      const memeJson = e.dataTransfer.getData(MEME_DRAG);
      if (memeJson) {
        e.preventDefault();
        e.stopPropagation();
        try {
          const meme = JSON.parse(memeJson);
          await createProjectFromMeme(meme);
          showPanel("projects");
        } catch {}
      }
    }
  };

  /** A finished recording: camera / screen at the end of Video 1, voice at the playhead; screen + camera = two clips. */
  const addRecording = (r: Recorded) => {
    const group = `record:${r.main.id}:${++editSeq.current}`;
    const start = mainDuration(live.current.doc);
    addToTimeline(r.main, { group });
    // the camera: a box at the bottom right, over the screen, from the same moment (its sound is off: the screen has the mic)
    if (r.camera) {
      const cam = r.camera;
      // round bubble: a square crop, a circle and a white ring, bottom right
      const bubble = r.bubble
        ? {
            mask: BUBBLE_MASK,
            transform: {
              fit: "fit" as const,
              x: 0.39,
              y: 0.31,
              scale: 0.28,
              crop: cropForAspect(cam.info.width, cam.info.height, 1),
            },
          }
        : { transform: { fit: "fit" as const, x: 0.34, y: 0.3, scale: 0.28 } };
      addToTimeline(cam, {
        group,
        overlay: true,
        at: start,
        patch: { muted: true, ...bubble },
      });
    }
  };

  // ---------- timeline editing ----------
  const player = () => (mode === "clip" ? null : programRef.current);
  const seekTimeline = (t: number) => {
    if (mode === "clip" && activeClip) {
      const start = clipStart(doc, activeClip.id);
      if (t >= start - 1e-6 && t <= start + clipLength(activeClip) + 1e-6) {
        clipRef.current?.seek(srcAt(activeClip, t - start));
        clock.set(t);
        return;
      }
      setMode("program");
    }
    clock.set(t);
    programRef.current?.seek(t);
  };
  /** The clip Split / Trim act on: the selected one if the playhead is on it, else the Video 1 clip under the playhead. */
  const clipAtPlayhead = () => {
    const t = clock.get();
    if (selected) {
      const s = clipStart(doc, selected.clip.id);
      if (t > s && t < s + clipLength(selected.clip)) return selected.clip.id;
    }
    return mainClipAt(doc, t)?.clip.id ?? null;
  };
  const splitAtPlayhead = () => {
    const id = clipAtPlayhead();
    if (id) dispatchDoc({ type: "split", clipId: id, t: clock.get() });
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    const f = findClip(doc, selectedId);
    const start = f
      ? f.track.kind === "main"
        ? mainStarts(f.track.clips)[f.index]
        : ((f.clip as AnyClip & { start?: number }).start ?? 0)
      : 0;
    const nextDoc = deleteClip(doc, selectedId);
    const nextDur = docDuration(nextDoc);
    dispatchDoc({ type: "deleteClip", clipId: selectedId });
    setSelectedId(null);
    const cur = clock.get();
    if (cur > nextDur) {
      clock.set(Math.max(0, nextDur));
    } else if (f && cur >= start && cur <= start + clipLength(f.clip)) {
      clock.set(Math.min(start, nextDur));
    }
  };
  const trimToPlayhead = (edge: "in" | "out") => {
    const id = clipAtPlayhead();
    if (id)
      dispatchDoc(
        { type: "trim", clipId: id, edge, to: clock.get() },
        `trim:${edge}:${++editSeq.current}`,
      );
  };
  const dropMedia = (
    mediaId: string,
    trackId: string | null,
    t: number,
    index?: number,
  ) => {
    const v = metas[mediaId] ?? assets.items?.find((a) => a.id === mediaId);
    // an empty timeline: the first thing starts at 0 (wherever it was dropped)
    if (v)
      addToTimeline(v, { trackId, at: live.current.hasClips ? t : 0, index });
  };
  /** ⌘C / ⌘X: remember a clip (and its upload) to paste later; cut also removes it. */
  const copyClip = (clipId: string, cut = false) => {
    const f = findClip(doc, clipId);
    if (!f) return;
    const m = "mediaId" in f.clip ? ds.media[f.clip.mediaId] : undefined;
    copied = {
      clip: f.clip,
      kind: f.track.kind,
      trackId: f.track.id,
      media: m,
    };
    setHasCopy(true);
    if (cut && !f.track.locked) {
      dispatchDoc({ type: "deleteClip", clipId }, `cut:${++editSeq.current}`);
      if (clipId === selectedId) setSelectedId(null);
    }
  };
  /** ⌘V: the copied clip at `at` (Video 1: after the clip there); the new clip is selected. */
  const pasteAt = (at: number) => {
    if (!copied) return;
    const id = `p${++editSeq.current}${Date.now().toString(36).slice(-4)}`;
    dispatchDoc(
      { type: "paste", copied, at, id, media: copied.media },
      `paste:${editSeq.current}`,
    );
    setSelectedId(id);
  };

  /** ⌥⌘C: Copy clip visual styling and shape transforms */
  const copyClipStyle = (clipId: string) => {
    const f = findClip(doc, clipId);
    if (!f) return;
    copiedStyle = extractClipStyle(f.clip);
    setHasCopiedStyle(true);
    setNotice("Clip style copied.");
  };

  /** ⌥⌘V: Paste copied style onto another clip, preserving target position and timing */
  const pasteClipStyle = (clipId: string) => {
    if (!copiedStyle) return;
    const f = findClip(doc, clipId);
    if (!f || f.track.locked) return;
    const patch = applyClipStyle(f.clip, copiedStyle);
    if (Object.keys(patch).length > 0) {
      dispatchDoc(
        { type: "setClip", clipId, patch },
        `style:paste:${clipId}:${++editSeq.current}`,
      );
      setNotice("Clip style pasted.");
    }
  };

  // Motion Tracking & Attach Handlers
  const handleAddTrackingPoint = useCallback(
    (preset: "ellipse" | "rect" | "point" = "ellipse") => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      const currentT = clock.get();
      const clipStart =
        selected.track.kind === "main"
          ? mainStarts(mainTrack(doc).clips)[selected.index]
          : ((clip as unknown as { start: number }).start ?? 0);
      const currentClipT = Math.max(
        0,
        (currentT - clipStart) * (clip.speed ?? 1),
      );
      const nextIdx = (clip.tracking?.points?.length ?? 0) + 1;
      const color = TRACKING_COLORS[(nextIdx - 1) % TRACKING_COLORS.length];
      const isMask = preset === "ellipse" || preset === "rect";
      const initialBox = isMask ? { w: 0.16, h: 0.16 } : { w: 0.1, h: 0.1 };

      const initialAttachments: Attachment[] = isMask
        ? [
            {
              id: `att-blur-${crypto.randomUUID().slice(0, 8)}`,
              type: "blur" as const,
              mode: "blur" as const,
              intensity: 22,
              shape:
                preset === "rect" ? ("rect" as const) : ("ellipse" as const),
              padding: 0,
              feather: 10,
              offset: { x: 0, y: 0 },
              size: { w: 0.16, h: 0.16 },
            },
          ]
        : [];

      const newPt: TrackingPoint = {
        id: `tp-${crypto.randomUUID().slice(0, 8)}`,
        name:
          preset === "rect"
            ? `Rectangle Mask ${nextIdx}`
            : preset === "ellipse"
              ? `Ellipse Mask ${nextIdx}`
              : `Point ${nextIdx}`,
        color,
        type: isMask ? "area" : "point",
        status: "idle",
        settings: { ...DEFAULT_TRACKING_SETTINGS },
        initial: {
          t: currentClipT,
          x: 0.5,
          y: 0.5,
          box: initialBox,
        },
        keyframes: [
          {
            t: currentClipT,
            x: 0.5,
            y: 0.5,
            scale: 1,
            rotation: 0,
            confidence: 1,
            box: initialBox,
          },
        ],
        attachments: initialAttachments,
      };
      const nextPoints = [...(clip.tracking?.points ?? []), newPt];
      dispatchDoc(
        {
          type: "setClip",
          clipId: clip.id,
          patch: {
            tracking: {
              points: nextPoints,
              activePointId: newPt.id,
            },
          },
        },
        `tracking:add:${clip.id}`,
      );
    },
    [selected, doc, clock, dispatchDoc],
  );

  const handleSelectTrackingPoint = useCallback(
    (pointId: string) => {
      const clip = live.current.activeClip;
      if (!clip || clip.type !== "video") return;
      if (clip.tracking?.activePointId === pointId) return;
      dispatchDoc(
        {
          type: "setClip",
          clipId: clip.id,
          patch: {
            tracking: {
              points: clip.tracking?.points ?? [],
              activePointId: pointId,
            },
          },
        },
        `tracking:select:${clip.id}`,
      );
    },
    [dispatchDoc],
  );

  const handleUpdateTrackingPoint = useCallback(
    (pointId: string, patch: Partial<TrackingPoint>, group?: string) => {
      const clip = live.current.activeClip;
      if (!clip || clip.type !== "video") return;
      const points = (clip.tracking?.points ?? []).map((pt) =>
        pt.id === pointId ? { ...pt, ...patch } : pt,
      );
      dispatchDoc(
        {
          type: "setClip",
          clipId: clip.id,
          patch: {
            tracking: {
              points,
              activePointId: clip.tracking?.activePointId ?? pointId,
            },
          },
        },
        group || `tracking:update:${clip.id}:${pointId}`,
      );
    },
    [dispatchDoc],
  );

  const handleDeleteTrackingPoint = useCallback(
    (pointId: string) => {
      const clip = live.current.activeClip;
      if (!clip || clip.type !== "video") return;
      const points = (clip.tracking?.points ?? []).filter(
        (pt) => pt.id !== pointId,
      );
      const nextActive = points[0]?.id ?? null;
      dispatchDoc(
        {
          type: "setClip",
          clipId: clip.id,
          patch: {
            tracking: {
              points,
              activePointId: nextActive,
            },
          },
        },
        `tracking:delete:${clip.id}:${pointId}`,
      );
    },
    [dispatchDoc],
  );

  const handleMoveTrackingPoint = useCallback(
    (
      pointId: string,
      pos: { x: number; y: number; box?: { w: number; h: number } },
      group?: string,
    ) => {
      const clip = live.current.activeClip;
      if (!clip || clip.type !== "video") return;
      const pt = clip.tracking?.points?.find((p) => p.id === pointId);
      if (!pt) return;

      const curBox = pt.initial.box ?? { w: 0.14, h: 0.14 };
      const dx = Math.abs(pt.initial.x - pos.x);
      const dy = Math.abs(pt.initial.y - pos.y);
      const dw = pos.box ? Math.abs(curBox.w - pos.box.w) : 0;
      const dh = pos.box ? Math.abs(curBox.h - pos.box.h) : 0;
      if (dx < 0.0005 && dy < 0.0005 && dw < 0.0005 && dh < 0.0005) {
        return;
      }

      const currentT = clock.get();
      const currentDoc = live.current.doc;
      const selClip = selectedId ? findClip(currentDoc, selectedId) : null;
      const clipStart =
        selClip?.track.kind === "main"
          ? mainStarts(mainTrack(currentDoc).clips)[selClip.index]
          : ((clip as unknown as { start: number }).start ?? 0);
      const currentClipT = Math.max(
        0,
        (currentT - clipStart) * (clip.speed ?? 1),
      );

      const updatedInitial = {
        ...pt.initial,
        x: pos.x,
        y: pos.y,
        ...(pos.box ? { box: pos.box } : {}),
      };

      const existingKfIdx = pt.keyframes.findIndex(
        (k) => Math.abs(k.t - currentClipT) < 0.05,
      );
      let nextKeyframes: TrackingKeyframe[];
      if (existingKfIdx >= 0) {
        nextKeyframes = pt.keyframes.map((k, idx) =>
          idx === existingKfIdx
            ? { ...k, x: pos.x, y: pos.y, ...(pos.box ? { box: pos.box } : {}) }
            : k,
        );
      } else {
        nextKeyframes = [
          ...pt.keyframes,
          {
            t: currentClipT,
            x: pos.x,
            y: pos.y,
            scale: 1,
            rotation: 0,
            confidence: 1,
            ...(pos.box ? { box: pos.box } : {}),
          },
        ].sort((a, b) => a.t - b.t);
      }

      const updatedAttachments = pos.box
        ? (pt.attachments ?? []).map((att) =>
            att.type === "blur"
              ? { ...att, size: { w: pos.box!.w, h: pos.box!.h } }
              : att,
          )
        : pt.attachments;

      handleUpdateTrackingPoint(
        pointId,
        {
          initial: updatedInitial,
          keyframes: nextKeyframes,
          attachments: updatedAttachments,
        },
        group || `tracking:move:${clip.id}:${pointId}`,
      );
    },
    [clock, handleUpdateTrackingPoint, selectedId],
  );

  const handleStartTracking = useCallback(
    async (
      pointId: string,
      direction:
        | "forward"
        | "backward"
        | "both"
        | "stepForward"
        | "stepBackward",
      range: "full" | "playhead" | "custom",
      customBounds?: { startSec: number; endSec: number },
    ) => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      const point = clip.tracking?.points?.find((p) => p.id === pointId);
      if (!point) return;

      programRef.current?.pause();

      const currentT = clock.get();
      const clipStart =
        selected.track.kind === "main"
          ? mainStarts(mainTrack(doc).clips)[selected.index]
          : ((clip as unknown as { start: number }).start ?? 0);
      const currentClipT = Math.max(
        0,
        (currentT - clipStart) * (clip.speed ?? 1),
      );
      const clipLen = clipLength(clip);

      const startSec = customBounds ? customBounds.startSec : (range === "playhead" ? currentClipT : 0);
      const endSec = customBounds ? customBounds.endSec : clipLen;

      // Use a dedicated offscreen video element for tracking to prevent player seek collisions
      const playerEl = programRef.current?.getVideoElement?.(clip.id);
      const trackingVideo = document.createElement("video");
      trackingVideo.crossOrigin = "anonymous";
      trackingVideo.muted = true;
      trackingVideo.playsInline = true;
      trackingVideo.preload = "auto";
      trackingVideo.src =
        playerEl?.currentSrc || `/api/videos/${clip.mediaId}/source`;

      if (trackingVideo.readyState < 2) {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (resolved) return;
            resolved = true;
            trackingVideo.removeEventListener("loadeddata", done);
            trackingVideo.removeEventListener("canplay", done);
            trackingVideo.removeEventListener("error", done);
            resolve();
          };
          trackingVideo.addEventListener("loadeddata", done);
          trackingVideo.addEventListener("canplay", done);
          trackingVideo.addEventListener("error", done);
          setTimeout(done, 1500);
        });
      }

      const videoEl = trackingVideo.videoWidth
        ? trackingVideo
        : playerEl || trackingVideo;

      const abortController = new AbortController();
      trackingAbortRef.current = abortController;
      setIsTracking(true);
      setLostTargetInfo(null);
      setTrackingProgress({ percent: 0, frame: 0, total: 100, time: startSec });

      try {
        const trackedPoint = await runVideoTracking({
          videoEl,
          point,
          direction,
          rangeMode: range,
          startSec,
          endSec,
          clipIn: clip.in,
          clipSpeed: clip.speed ?? 1,
          fps: doc.canvas.fps || 30,
          signal: abortController.signal,
          onProgress: (info) => {
            setTrackingProgress({
              percent: info.percent,
              frame: info.frameIndex,
              total: info.totalFrames,
              time: info.currentTime,
            });
          },
          onLost: (info) => {
            setLostTargetInfo({
              pointId,
              time: info.time,
              keyframe: info.lastKnown,
            });
          },
        });

        handleUpdateTrackingPoint(pointId, {
          keyframes: trackedPoint.keyframes,
          status: "completed",
        });

        // Automatically bake tracking keyframes into attached clips so timeline & export are ready
        for (const att of point.attachments ?? []) {
          if (att.type === "clip") {
            const attachedClipItem = findClip(doc, att.clipId);
            if (attachedClipItem && "transform" in attachedClipItem.clip) {
              const baked = bakeTrackingToKeyframes(
                { ...point, keyframes: trackedPoint.keyframes },
                att,
                attachedClipItem.clip as Parameters<
                  typeof bakeTrackingToKeyframes
                >[2],
                clipStart,
                doc.canvas.fps,
              );
              dispatchDoc({
                type: "setClip",
                clipId: att.clipId,
                patch: { keyframes: baked },
              });
            }
          }
        }

        if (direction === "stepForward") {
          const fps = doc.canvas.fps || 30;
          clock.set(
            clipStart +
              Math.min(clipLen, currentClipT + 1 / fps) / (clip.speed ?? 1),
          );
        } else if (direction === "stepBackward") {
          const fps = doc.canvas.fps || 30;
          clock.set(
            clipStart + Math.max(0, currentClipT - 1 / fps) / (clip.speed ?? 1),
          );
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Tracking error:", err);
        }
      } finally {
        setIsTracking(false);
        setTrackingProgress(null);
        trackingAbortRef.current = null;
        trackingVideo.src = "";
        trackingVideo.load();
      }
    },
    [selected, doc, clock, handleUpdateTrackingPoint],
  );

  const handleCancelTracking = useCallback(() => {
    if (trackingAbortRef.current) {
      trackingAbortRef.current.abort();
      trackingAbortRef.current = null;
    }
    setIsTracking(false);
    setTrackingProgress(null);
    setLostTargetInfo(null);
  }, []);

  const handleRecoverTarget = useCallback(
    (action: "reposition" | "keep" | "stop") => {
      if (action === "stop") {
        handleCancelTracking();
      } else if (action === "keep" && lostTargetInfo) {
        const info = lostTargetInfo;
        setLostTargetInfo(null);
        void handleStartTracking(info.pointId, "forward", "playhead");
      } else {
        if (lostTargetInfo) {
          clock.set(lostTargetInfo.time);
        }
        setLostTargetInfo(null);
      }
    },
    [handleCancelTracking, handleStartTracking, lostTargetInfo, clock],
  );

  const handleAttach = useCallback(
    (
      pointId: string,
      type:
        | "blur"
        | "text"
        | "image"
        | "video"
        | "sticker"
        | "shape"
        | "logo"
        | "effect",
      existingClipId?: string,
    ) => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      const point = clip.tracking?.points?.find((p) => p.id === pointId);
      if (!point) return;

      const clipStart =
        selected.track.kind === "main"
          ? mainStarts(mainTrack(doc).clips)[selected.index]
          : ((clip as unknown as { start: number }).start ?? 0);
      const clipLen = clipLength(clip);
      const pos = trackCoordToTransform(point.initial.x, point.initial.y);

      // 1. Link an existing timeline clip
      if (existingClipId) {
        const existing = findClip(doc, existingClipId);
        if (!existing) return;
        let cat: ClipAttachment["category"] = "element";
        let name = `Clip ${existingClipId.slice(0, 8)}`;
        if (existing.clip.type === "text") {
          cat = "text";
          name = `Text: "${existing.clip.text.slice(0, 16)}"`;
        } else if (existing.clip.type === "element") {
          const elLook = (existing.clip as ElementClip).el;
          const pId = elLook?.preset || "";
          if (
            pId.includes("star") ||
            pId.includes("badge") ||
            (elLook && "icon" in elLook && elLook.icon)
          ) {
            cat = "sticker";
          } else if (pId.includes("logo") || pId.includes("brand")) {
            cat = "logo";
          } else {
            cat = "element";
          }
          name = `Element: ${elLook?.preset || elLook?.kind || "shape"}`;
        } else if (existing.clip.type === "image") {
          cat = "image";
          name = `Image (${existingClipId.slice(0, 6)})`;
        } else if (existing.clip.type === "video") {
          cat = "video";
          name = `Video (${existingClipId.slice(0, 6)})`;
        }

        const clipAtt: ClipAttachment = {
          id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
          type: "clip",
          clipId: existingClipId,
          category: cat,
          name,
          offset: { x: 0, y: 0, scale: 1, rotation: 0 },
        };

        if (point.keyframes.length > 0 && "transform" in existing.clip) {
          const bakedKeys = bakeTrackingToKeyframes(
            point,
            clipAtt,
            existing.clip as Parameters<typeof bakeTrackingToKeyframes>[2],
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: existingClipId,
            patch: { keyframes: bakedKeys },
          });
        }

        const updatedAttachments = [...(point.attachments ?? []), clipAtt];
        handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
        return;
      }

      // 2. Blur or Mosaic Effect
      if (type === "blur" || type === "effect") {
        const blurAtt: BlurAttachment = {
          id: `att-blur-${crypto.randomUUID().slice(0, 8)}`,
          type: "blur",
          mode: "blur",
          intensity: 16,
          shape: "ellipse",
          padding: 10,
          feather: 8,
          offset: { x: 0, y: 0 },
          size: {
            w: Math.max(0.08, point.initial.box.w * 1.2),
            h: Math.max(0.08, point.initial.box.h * 1.2),
          },
        };

        const updatedAttachments = [...(point.attachments ?? []), blurAtt];
        handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
        return;
      }

      // 3. Text Overlay
      if (type === "text") {
        const textClipId = `text-${crypto.randomUUID().slice(0, 8)}`;
        const baseText = textClipOf("title");
        const textClip: TextClip = {
          ...baseText,
          id: textClipId,
          text: "Tracked Text",
          duration: clipLen,
          transform: {
            ...baseText.transform,
            x: pos.x,
            y: pos.y,
            scale: 0.8,
          },
        };

        const clipAtt: ClipAttachment = {
          id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
          type: "clip",
          clipId: textClipId,
          category: "text",
          name: "Tracked Text",
          offset: { x: 0, y: 0, scale: 1, rotation: 0 },
        };

        dispatchDoc({
          type: "addText",
          clip: textClip,
          at: clipStart,
          id: textClipId,
        });

        if (point.keyframes.length > 0) {
          const bakedKeys = bakeTrackingToKeyframes(
            point,
            clipAtt,
            textClip,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: textClipId,
            patch: { keyframes: bakedKeys },
          });
        }

        const updatedAttachments = [...(point.attachments ?? []), clipAtt];
        handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
        return;
      }

      // 4. Sticker Overlay
      if (type === "sticker") {
        const elClipId = `sticker-${crypto.randomUUID().slice(0, 8)}`;
        const stickerPreset =
          ELEMENTS.find((e) => e.group === "stickers") ??
          ELEMENTS.find((e) => e.id === "star") ??
          ELEMENTS[0];
        const baseEl = elementClipOf(stickerPreset, doc.canvas);
        const elClip: ElementClip = {
          ...baseEl,
          id: elClipId,
          duration: clipLen,
          transform: {
            ...baseEl.transform,
            x: pos.x,
            y: pos.y,
            scale: 0.6,
          },
        };

        const clipAtt: ClipAttachment = {
          id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
          type: "clip",
          clipId: elClipId,
          category: "sticker",
          name: `Sticker (${stickerPreset.label})`,
          offset: { x: 0, y: 0, scale: 1, rotation: 0 },
        };

        dispatchDoc({
          type: "addElement",
          clip: elClip,
          at: clipStart,
          id: elClipId,
        });

        if (point.keyframes.length > 0) {
          const bakedKeys = bakeTrackingToKeyframes(
            point,
            clipAtt,
            elClip,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: elClipId,
            patch: { keyframes: bakedKeys },
          });
        }

        const updatedAttachments = [...(point.attachments ?? []), clipAtt];
        handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
        return;
      }

      // 5. Logo Badge Overlay
      if (type === "logo") {
        const elClipId = `logo-${crypto.randomUUID().slice(0, 8)}`;
        const logoPreset =
          ELEMENTS.find((e) => e.id === "star" || e.id === "ring") ??
          ELEMENTS[0];
        const baseEl = elementClipOf(logoPreset, doc.canvas);
        const elClip: ElementClip = {
          ...baseEl,
          id: elClipId,
          duration: clipLen,
          el: {
            ...baseEl.el,
            text: "LOGO",
            textColor: "#ffffff",
            shadow: true,
          },
          transform: {
            ...baseEl.transform,
            x: pos.x,
            y: pos.y,
            scale: 0.5,
          },
        };

        const clipAtt: ClipAttachment = {
          id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
          type: "clip",
          clipId: elClipId,
          category: "logo",
          name: "Logo Badge",
          offset: { x: 0, y: 0, scale: 1, rotation: 0 },
        };

        dispatchDoc({
          type: "addElement",
          clip: elClip,
          at: clipStart,
          id: elClipId,
        });

        if (point.keyframes.length > 0) {
          const bakedKeys = bakeTrackingToKeyframes(
            point,
            clipAtt,
            elClip,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: elClipId,
            patch: { keyframes: bakedKeys },
          });
        }

        const updatedAttachments = [...(point.attachments ?? []), clipAtt];
        handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
        return;
      }

      // 6. Image Overlay
      if (type === "image") {
        const availableImage = Object.values(metas).find(
          (m) => m.kind === "image",
        );
        if (availableImage) {
          const imgClipId = `img-${crypto.randomUUID().slice(0, 8)}`;
          dispatchDoc({
            type: "addMedia",
            media: {
              id: availableImage.id,
              kind: "image",
              fileName: availableImage.fileName,
              width: availableImage.width || 1920,
              height: availableImage.height || 1080,
              fps: 30,
              duration: clipLen,
              hasAudio: false,
              suggestedKey: null,
              keyKind: null,
            },
            options: { as: "overlay", at: clipStart },
          });

          const clipAtt: ClipAttachment = {
            id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
            type: "clip",
            clipId: imgClipId,
            category: "image",
            name: availableImage.fileName || "Tracked Image",
            offset: { x: 0, y: 0, scale: 1, rotation: 0 },
          };

          const updatedAttachments = [...(point.attachments ?? []), clipAtt];
          handleUpdateTrackingPoint(pointId, {
            attachments: updatedAttachments,
          });
        } else {
          // Fallback graphic frame for image
          const elClipId = `img-frame-${crypto.randomUUID().slice(0, 8)}`;
          const framePreset =
            ELEMENTS.find((e) => e.id === "frame" || e.id === "box") ??
            ELEMENTS[0];
          const baseEl = elementClipOf(framePreset, doc.canvas);
          const elClip: ElementClip = {
            ...baseEl,
            id: elClipId,
            duration: clipLen,
            el: {
              ...baseEl.el,
              text: "🖼️ Image",
              textColor: "#ffffff",
            },
            transform: {
              ...baseEl.transform,
              x: pos.x,
              y: pos.y,
              scale: 0.6,
            },
          };

          const clipAtt: ClipAttachment = {
            id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
            type: "clip",
            clipId: elClipId,
            category: "image",
            name: "Tracked Image",
            offset: { x: 0, y: 0, scale: 1, rotation: 0 },
          };

          dispatchDoc({
            type: "addElement",
            clip: elClip,
            at: clipStart,
            id: elClipId,
          });

          if (point.keyframes.length > 0) {
            const bakedKeys = bakeTrackingToKeyframes(
              point,
              clipAtt,
              elClip,
              clipStart,
              doc.canvas.fps,
            );
            dispatchDoc({
              type: "setClip",
              clipId: elClipId,
              patch: { keyframes: bakedKeys },
            });
          }

          const updatedAttachments = [...(point.attachments ?? []), clipAtt];
          handleUpdateTrackingPoint(pointId, {
            attachments: updatedAttachments,
          });
        }
        return;
      }

      // 7. Video Overlay
      if (type === "video") {
        const elClipId = `vid-pip-${crypto.randomUUID().slice(0, 8)}`;
        const pipPreset =
          ELEMENTS.find((e) => e.id === "frame" || e.id === "box") ??
          ELEMENTS[0];
        const baseEl = elementClipOf(pipPreset, doc.canvas);
        const elClip: ElementClip = {
          ...baseEl,
          id: elClipId,
          duration: clipLen,
          el: {
            ...baseEl.el,
            text: "🎬 Video PiP",
            textColor: "#ffffff",
          },
          transform: {
            ...baseEl.transform,
            x: pos.x,
            y: pos.y,
            scale: 0.6,
          },
        };

        const clipAtt: ClipAttachment = {
          id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
          type: "clip",
          clipId: elClipId,
          category: "video",
          name: "Video Overlay",
          offset: { x: 0, y: 0, scale: 1, rotation: 0 },
        };

        dispatchDoc({
          type: "addElement",
          clip: elClip,
          at: clipStart,
          id: elClipId,
        });

        if (point.keyframes.length > 0) {
          const bakedKeys = bakeTrackingToKeyframes(
            point,
            clipAtt,
            elClip,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: elClipId,
            patch: { keyframes: bakedKeys },
          });
        }

        const updatedAttachments = [...(point.attachments ?? []), clipAtt];
        handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
        return;
      }

      // 8. Element / Shape (Default)
      const elClipId = `el-${crypto.randomUUID().slice(0, 8)}`;
      const preset = elementPreset("circle") ?? ELEMENTS[0];
      const baseEl = elementClipOf(preset, doc.canvas);
      const elClip: ElementClip = {
        ...baseEl,
        id: elClipId,
        duration: clipLen,
        transform: {
          ...baseEl.transform,
          x: pos.x,
          y: pos.y,
          scale: 0.5,
        },
      };

      const clipAtt: ClipAttachment = {
        id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
        type: "clip",
        clipId: elClipId,
        category: "element",
        name: `Shape (${preset.label})`,
        offset: { x: 0, y: 0, scale: 1, rotation: 0 },
      };

      dispatchDoc({
        type: "addElement",
        clip: elClip,
        at: clipStart,
        id: elClipId,
      });

      if (point.keyframes.length > 0) {
        const bakedKeys = bakeTrackingToKeyframes(
          point,
          clipAtt,
          elClip,
          clipStart,
          doc.canvas.fps,
        );
        dispatchDoc({
          type: "setClip",
          clipId: elClipId,
          patch: { keyframes: bakedKeys },
        });
      }

      const updatedAttachments = [...(point.attachments ?? []), clipAtt];
      handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
    },
    [selected, doc, metas, handleUpdateTrackingPoint, dispatchDoc],
  );

  const handleUpdateAttachment = useCallback(
    (pointId: string, attachmentId: string, patch: Partial<Attachment>) => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      const point = clip.tracking?.points?.find((p) => p.id === pointId);
      if (!point) return;

      const updatedAttachments = (point.attachments ?? []).map((att) => {
        if (att.id !== attachmentId) return att;
        return { ...att, ...patch } as Attachment;
      });

      handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });

      const targetAtt = updatedAttachments.find((a) => a.id === attachmentId);
      if (
        targetAtt &&
        targetAtt.type === "clip" &&
        point.keyframes.length > 0
      ) {
        const attachedClipItem = findClip(doc, targetAtt.clipId);
        if (attachedClipItem && "transform" in attachedClipItem.clip) {
          const clipStart =
            selected.track.kind === "main"
              ? mainStarts(mainTrack(doc).clips)[selected.index]
              : ((clip as unknown as { start: number }).start ?? 0);
          const reBaked = bakeTrackingToKeyframes(
            point,
            targetAtt,
            attachedClipItem.clip as any,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: targetAtt.clipId,
            patch: { keyframes: reBaked },
          });
        }
      }
    },
    [selected, doc, handleUpdateTrackingPoint, dispatchDoc],
  );

  const handleDetach = useCallback(
    (pointId: string, attachmentId: string) => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      const point = clip.tracking?.points?.find((p) => p.id === pointId);
      if (!point) return;
      const updatedAttachments = (point.attachments ?? []).filter(
        (att) => att.id !== attachmentId,
      );
      handleUpdateTrackingPoint(pointId, { attachments: updatedAttachments });
    },
    [selected, handleUpdateTrackingPoint],
  );

  const handleBakeKeyframes = useCallback(
    (pointId: string, attachmentId?: string) => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      const point = clip.tracking?.points?.find((p) => p.id === pointId);
      if (!point || !point.keyframes.length) return;

      const clipStart =
        selected.track.kind === "main"
          ? mainStarts(mainTrack(doc).clips)[selected.index]
          : ((clip as unknown as { start: number }).start ?? 0);

      const targets = attachmentId
        ? (point.attachments ?? []).filter((a) => a.id === attachmentId)
        : (point.attachments ?? []);

      for (const att of targets) {
        if (att.type === "clip") {
          const attachedClipItem = findClip(doc, att.clipId);
          if (attachedClipItem && "transform" in attachedClipItem.clip) {
            const baked = bakeTrackingToKeyframes(
              point,
              att,
              attachedClipItem.clip as any,
              clipStart,
              doc.canvas.fps,
            );
            dispatchDoc({
              type: "setClip",
              clipId: att.clipId,
              patch: { keyframes: baked },
            });
          }
        }
      }
    },
    [selected, doc, dispatchDoc],
  );

  const handleAutoDetectFace = useCallback(() => {
    if (!selected || selected.clip.type !== "video") return;
    const clip = selected.clip as VideoClip;
    const videoEl = programRef.current?.getVideoElement?.(clip.id);

    let faceBox = { x: 0.5, y: 0.38, w: 0.18, h: 0.22, confidence: 1 };
    if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      try {
        const offCanvas = document.createElement("canvas");
        offCanvas.width = 320;
        offCanvas.height = Math.round(
          (320 * videoEl.videoHeight) / videoEl.videoWidth,
        );
        const ctx = offCanvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, offCanvas.width, offCanvas.height);
          const imgData = ctx.getImageData(
            0,
            0,
            offCanvas.width,
            offCanvas.height,
          );
          const detected = detectFaces(imgData);
          if (detected.length > 0) {
            faceBox = detected[0];
          }
        }
      } catch (err) {
        console.warn("Face detection canvas read error:", err);
      }
    }

    const currentT = clock.get();
    const clipStart =
      selected.track.kind === "main"
        ? mainStarts(mainTrack(doc).clips)[selected.index]
        : ((clip as unknown as { start: number }).start ?? 0);
    const currentClipT = Math.max(
      0,
      (currentT - clipStart) * (clip.speed ?? 1),
    );

    const existingPoints = clip.tracking?.points ?? [];
    const activePoint = existingPoints.find(
      (p) => p.id === (clip.tracking?.activePointId ?? existingPoints[0]?.id),
    );

    if (activePoint) {
      handleUpdateTrackingPoint(
        activePoint.id,
        {
          initial: {
            t: currentClipT,
            x: faceBox.x,
            y: faceBox.y,
            box: { w: faceBox.w, h: faceBox.h },
          },
          keyframes: [
            {
              t: currentClipT,
              x: faceBox.x,
              y: faceBox.y,
              scale: 1,
              rotation: 0,
              confidence: faceBox.confidence,
              box: { w: faceBox.w, h: faceBox.h },
            },
          ],
        },
        `tracking:detect:${clip.id}`,
      );
    } else {
      const newPointId = `point-${crypto.randomUUID().slice(0, 8)}`;
      const newPoint: TrackingPoint = {
        id: newPointId,
        name: "Face Lock",
        color: TRACKING_COLORS[0],
        type: "area",
        initial: {
          t: currentClipT,
          x: faceBox.x,
          y: faceBox.y,
          box: { w: faceBox.w, h: faceBox.h },
        },
        keyframes: [
          {
            t: currentClipT,
            x: faceBox.x,
            y: faceBox.y,
            scale: 1,
            rotation: 0,
            confidence: faceBox.confidence,
            box: { w: faceBox.w, h: faceBox.h },
          },
        ],
        attachments: [],
        settings: {
          ...DEFAULT_TRACKING_SETTINGS,
        },
        status: "idle",
      };

      dispatchDoc(
        {
          type: "setClip",
          clipId: clip.id,
          patch: {
            tracking: {
              points: [...existingPoints, newPoint],
              activePointId: newPointId,
            },
          },
        },
        `tracking:detect:${clip.id}`,
      );
    }
  }, [selected, doc, clock, handleUpdateTrackingPoint, dispatchDoc]);

  const handleApplyDisguise = useCallback(
    (disguise: string, margin = 1.2) => {
      if (!selected || selected.clip.type !== "video") return;
      const clip = selected.clip as VideoClip;
      let points = clip.tracking?.points ?? [];
      let activePoint = points.find(
        (p) => p.id === (clip.tracking?.activePointId ?? points[0]?.id),
      );

      const currentT = clock.get();
      const clipStart =
        selected.track.kind === "main"
          ? mainStarts(mainTrack(doc).clips)[selected.index]
          : ((clip as unknown as { start: number }).start ?? 0);
      const currentClipT = Math.max(
        0,
        (currentT - clipStart) * (clip.speed ?? 1),
      );
      const clipLen = clipLength(clip);

      // Auto-create tracking point if none exists yet
      if (!activePoint) {
        const newPointId = `point-${crypto.randomUUID().slice(0, 8)}`;
        const createdPoint: TrackingPoint = {
          id: newPointId,
          name: "Face Lock",
          color: TRACKING_COLORS[0],
          type: "area",
          initial: {
            t: currentClipT,
            x: 0.5,
            y: 0.38,
            box: { w: 0.18, h: 0.22 },
          },
          keyframes: [
            {
              t: currentClipT,
              x: 0.5,
              y: 0.38,
              scale: 1,
              rotation: 0,
              confidence: 1,
              box: { w: 0.18, h: 0.22 },
            },
          ],
          attachments: [],
          settings: {
            ...DEFAULT_TRACKING_SETTINGS,
          },
          status: "idle",
        };
        points = [...points, createdPoint];
        dispatchDoc({
          type: "setClip",
          clipId: clip.id,
          patch: {
            tracking: {
              points,
              activePointId: newPointId,
            },
          },
        });
        activePoint = createdPoint;
      }

      const pt: TrackingPoint = activePoint;
      const box = pt.initial.box ?? { w: 0.18, h: 0.22 };
      const pos = trackCoordToTransform(pt.initial.x, pt.initial.y);

      const existingBlur = pt.attachments?.find((a) => a.type === "blur") as
        | BlurAttachment
        | undefined;
      const existingClipAtt = pt.attachments?.find((a) => a.type === "clip") as
        | ClipAttachment
        | undefined;
      const existingAttachedClip = existingClipAtt
        ? findClip(doc, existingClipAtt.clipId)?.clip
        : null;
      const isExistingEmoji =
        existingAttachedClip?.type === "element" &&
        (existingAttachedClip as ElementClip).el?.kind === "emoji";

      if (disguise === "blur" || disguise === "pixelate") {
        if (existingClipAtt) {
          dispatchDoc({ type: "deleteClip", clipId: existingClipAtt.clipId });
        }

        const blurSize = {
          w: Math.max(0.1, box.w * margin),
          h: Math.max(0.1, box.h * margin),
        };

        if (existingBlur) {
          const updatedAttachments = (pt.attachments ?? [])
            .filter((a) => a.id !== existingClipAtt?.id)
            .map((a) =>
              a.id === existingBlur.id
                ? {
                    ...a,
                    mode: disguise as "blur" | "pixelate",
                    size: blurSize,
                  }
                : a,
            );
          handleUpdateTrackingPoint(pt.id, { attachments: updatedAttachments });
        } else {
          const blurAtt: BlurAttachment = {
            id: `att-blur-${crypto.randomUUID().slice(0, 8)}`,
            type: "blur",
            mode: disguise as "blur" | "pixelate",
            intensity: disguise === "pixelate" ? 24 : 18,
            shape: "ellipse",
            padding: 10,
            feather: 8,
            offset: { x: 0, y: 0 },
            size: blurSize,
          };
          const updatedAttachments = [
            ...(pt.attachments ?? []).filter((a) => a.type !== "clip"),
            blurAtt,
          ];
          handleUpdateTrackingPoint(pt.id, { attachments: updatedAttachments });
        }
        return;
      }

      // EMOJI DISGUISE: scale = (box.h / 0.2) * margin
      const targetScale = Math.max(0.4, Math.min(3.5, (box.h / 0.2) * margin));
      let filteredAttachments = (pt.attachments ?? []).filter(
        (a) => a.type !== "blur",
      );

      if (isExistingEmoji && existingClipAtt && existingAttachedClip) {
        const updatedEl = {
          ...(existingAttachedClip as ElementClip).el,
          emoji: disguise,
        };
        const updatedTransform = {
          ...existingAttachedClip.transform,
          x: pos.x,
          y: pos.y,
          scale: targetScale,
        };
        dispatchDoc({
          type: "setClip",
          clipId: existingClipAtt.clipId,
          patch: {
            el: updatedEl,
            transform: updatedTransform,
          },
        });

        if (pt.keyframes.length > 0) {
          const bakedKeys = bakeTrackingToKeyframes(
            pt,
            existingClipAtt,
            {
              ...existingAttachedClip,
              transform: updatedTransform,
            } as ElementClip,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: existingClipAtt.clipId,
            patch: { keyframes: bakedKeys },
          });
        }
        handleUpdateTrackingPoint(pt.id, { attachments: filteredAttachments });
      } else {
        if (existingClipAtt) {
          dispatchDoc({ type: "deleteClip", clipId: existingClipAtt.clipId });
          filteredAttachments = filteredAttachments.filter(
            (a) => a.id !== existingClipAtt.id,
          );
        }

        const elClipId = `emoji-${crypto.randomUUID().slice(0, 8)}`;
        const baseEl = emojiClipOf(disguise, doc.canvas);
        const elClip: ElementClip = {
          ...baseEl,
          id: elClipId,
          duration: clipLen,
          anim: NO_ANIM,
          transform: {
            ...baseEl.transform,
            x: pos.x,
            y: pos.y,
            scale: targetScale,
          },
        };

        const clipAtt: ClipAttachment = {
          id: `att-clip-${crypto.randomUUID().slice(0, 8)}`,
          type: "clip",
          clipId: elClipId,
          category: "element",
          name: `Disguise ${disguise}`,
          offset: { x: 0, y: 0, scale: 1, rotation: 0 },
        };

        dispatchDoc({
          type: "addElement",
          clip: elClip,
          at: clipStart,
          id: elClipId,
        });

        if (pt.keyframes.length > 0) {
          const bakedKeys = bakeTrackingToKeyframes(
            pt,
            clipAtt,
            elClip,
            clipStart,
            doc.canvas.fps,
          );
          dispatchDoc({
            type: "setClip",
            clipId: elClipId,
            patch: { keyframes: bakedKeys },
          });
        }

        handleUpdateTrackingPoint(pt.id, {
          attachments: [...filteredAttachments, clipAtt],
        });
      }
    },
    [selected, doc, clock, handleUpdateTrackingPoint, dispatchDoc],
  );

  const currentDisguise = useMemo(() => {
    if (!selected || selected.clip.type !== "video") return null;
    const clip = selected.clip as VideoClip;
    const activePoint = clip.tracking?.points?.find(
      (p) =>
        p.id ===
        (clip.tracking?.activePointId ?? clip.tracking?.points?.[0]?.id),
    );
    if (!activePoint) return null;

    const blurAtt = activePoint.attachments?.find((a) => a.type === "blur") as
      | BlurAttachment
      | undefined;
    if (blurAtt) {
      const boxH = activePoint.initial.box?.h || 0.18;
      const margin = blurAtt.size.h ? blurAtt.size.h / boxH : 1.2;
      return {
        type:
          blurAtt.mode === "pixelate"
            ? ("pixelate" as const)
            : ("blur" as const),
        value: blurAtt.mode === "pixelate" ? "pixelate" : "blur",
        margin: Math.round(margin * 100) / 100,
      };
    }

    const clipAtt = activePoint.attachments?.find((a) => a.type === "clip") as
      | ClipAttachment
      | undefined;
    if (clipAtt) {
      const attClipItem = findClip(doc, clipAtt.clipId);
      if (
        attClipItem?.clip.type === "element" &&
        (attClipItem.clip as ElementClip).el?.kind === "emoji"
      ) {
        const emoji = (attClipItem.clip as ElementClip).el.emoji || "😎";
        const scale = attClipItem.clip.transform.scale || 1;
        const boxH = activePoint.initial.box?.h || 0.18;
        const margin = (scale * 0.2) / boxH;
        return {
          type: "emoji" as const,
          value: emoji,
          margin: Math.round(margin * 100) / 100,
        };
      }
    }
    return null;
  }, [selected, doc]);

  /** Subtitles on a new track of their own (one undo step); `hide`: the original language's track after a translation. */
  const addCaptions = (
    name: string,
    captions: Caption[],
    hide: string[] = [],
    look?: CaptionLook,
  ) => {
    const { text: _t, duration: _d, ...template } = textClipOf("caption");
    void _t;
    void _d;
    dispatchDoc(
      {
        type: "addCaptions",
        name,
        captions,
        template: {
          ...template,
          // the chosen word-by-word look comes with the subtitles (one click, styled)
          style: look ? { ...template.style, ...captionLookStyle(look) } : template.style,
          anim: { in: "none", out: "none" },
        },
        hide,
      },
      `subtitles:${++editSeq.current}`,
    );
    setMode("program");
  };
  /** The selected caption's style (and place) on every line of its subtitle track, as one undo step. */
  const styleAllCaptions = (trackId: string) => {
    if (!selected || selected.clip.type !== "text") return;
    const src = selected.clip;
    const t = doc.tracks.find((x) => x.id === trackId);
    if (!t) return;
    const group = `subtitle-style:${++editSeq.current}`;
    for (const c of t.clips)
      if (c.type === "text" && c.id !== src.id)
        dispatchDoc(
          {
            type: "setClip",
            clipId: c.id,
            patch: {
              style: src.style,
              transform: src.transform,
              anim: src.anim,
            },
          },
          group,
        );
  };

  /** A text style from the Text panel, at the playhead (on a free overlay track). */
  /** A text style at the playhead (on a blank scene: from its start, for 3 s). `where`: a place of its own, or canvas drop point {x, y}. */
  const addTextAt = (
    styleId: string,
    where?: { at?: number; seconds?: number; point?: { x: number; y: number } },
  ) => {
    const id = `t${++editSeq.current}${newId(doc)}`;
    // (at the very end of the timeline the text would start after everything: at the start instead)
    const slot = drawnSlot(doc, clock.get());
    const at = where?.at ?? slot.at;
    const clip = textClipOfStyle(styleId);
    let tr = clip.transform;
    if (where?.point) {
      const anchor = textAnchor(clip.style.preset, 1, 1);
      const nx = Math.round((where.point.x - anchor.x) * 1000) / 1000;
      const ny = Math.round((where.point.y - anchor.y) * 1000) / 1000;
      tr = { ...tr, x: nx, y: ny };
    }
    // (asked length, e.g. "Add a title on it" on a blank: 3 s; else on a blank 3 s from its start)
    const seconds =
      where?.seconds ??
      (slot.seconds && where?.at == null ? slot.seconds : undefined);
    dispatchDoc({
      type: "addText",
      clip: {
        ...(seconds ? { ...clip, duration: seconds } : clip),
        transform: tr,
      },
      at,
      id,
    });
    setSelectedId(id);
    setMode("program");
    setNotice(null);
    setJobId(null);
    if (!wide) setPhoneTab("edit");
    // the program view shows the text right away
    requestAnimationFrame(() => seekTimeline(at + 0.6));
  };
  /** An element from the Elements panel (or an emoji), at the playhead on a free overlay track (a progress bar: the whole video). `where`: optional point on canvas. */
  const addElementAt = (
    what: string | { emoji: string },
    where?: { at?: number; point?: { x: number; y: number } },
  ) => {
    const p = typeof what === "string" ? elementPreset(what) : null;
    if (typeof what === "string" && !p) return;
    const id = `e${++editSeq.current}${newId(doc)}`;
    const end = docDuration(doc);
    const whole = p?.seconds === "whole";
    // (on a blank scene: from its start, for 3 s)
    const slot = drawnSlot(doc, clock.get());
    const at = where?.at ?? (whole ? 0 : slot.at);
    let clip = p
      ? elementClipOf(p, doc.canvas, end)
      : emojiClipOf((what as { emoji: string }).emoji, doc.canvas);
    if (slot.seconds && !whole && where?.at == null)
      clip = { ...clip, duration: slot.seconds };
    if (where?.point) {
      clip = {
        ...clip,
        transform: {
          ...clip.transform,
          x: Math.round((where.point.x - 0.5) * 10000) / 10000,
          y: Math.round((where.point.y - 0.5) * 10000) / 10000,
        },
      };
    }
    // a badge is as wide as its words (measured here, like the preview draws them)
    const fit = refitBadge(
      { ...clip, id } as ElementClip,
      browserMeasure(),
      doc.canvas.width,
      doc.canvas.height,
    );
    if (fit)
      clip = {
        ...clip,
        el: { ...clip.el, aspect: fit.aspect },
        transform: where?.point
          ? {
              ...fit.transform,
              x: Math.round((where.point.x - 0.5) * 10000) / 10000,
              y: Math.round((where.point.y - 0.5) * 10000) / 10000,
            }
          : fit.transform,
      };
    dispatchDoc({ type: "addElement", clip, at, id });
    setSelectedId(id);
    setMode("program");
    setNotice(null);
    setJobId(null);
    if (!wide) setPhoneTab("edit");
    if (!whole) requestAnimationFrame(() => seekTimeline(at + 0.6));
  };
  // the Elements panel's search box (Search tools → "Add emoji…")
  const elementsSearch = useRef<HTMLInputElement>(null);
  /**
   * A blank scene on Video 1 at `index` (0 = the start; the number of clips = the
   * end), like Google Vids: selected, with the playhead on it, so a title or an
   * element added next goes on it.
   */
  const addBlankAt = (index: number) => {
    const cur = live.current.doc;
    const i = Math.min(Math.max(0, index), mainTrack(cur).clips.length);
    const id = `b${++editSeq.current}${newId(cur)}`;
    const isLight =
      typeof document !== "undefined" &&
      document.documentElement.dataset.theme === "light";
    const initialFill = isLight ? THEME_BLANK_LIGHT : THEME_BLANK_DARK;
    dispatchDoc(
      { type: "addBlank", index: i, id, fill: initialFill },
      `blank:${id}`,
    );
    setSelectedId(id);
    setSelTransition(null);
    setMode("program");
    setNotice(null);
    setJobId(null);
    if (!wide) setPhoneTab("edit");
    requestAnimationFrame(() =>
      seekTimeline(clipStart(live.current.doc, id) + 0.05),
    );
  };
  /** The selected blank scene: a title on it (from its start, 3 s), or the Elements panel with the playhead on it. */
  const blankTitle = (clipId: string) =>
    addTextAt("title", { at: clipStart(doc, clipId), seconds: BLANK_SECONDS });
  const blankElement = (clipId: string) => {
    seekTimeline(clipStart(doc, clipId) + 0.05);
    showPanel("elements");
  };
  /**
   * Freeze frame: the frame at the playhead becomes a 2-second picture put in
   * after a split (its background removal kept, same place and size).
   */
  const freezeAt = async (clipId: string, t: number) => {
    const f = findClip(doc, clipId);
    if (!f || f.clip.type !== "video" || f.track.kind !== "main") return;
    const c = f.clip as VideoClip;
    const start = clipStart(doc, clipId);
    const src = srcAt(c, Math.max(0, t - start));
    setNotice(null);
    setWorking("Making the freeze frame…");
    try {
      const r = await fetch(`/api/videos/${c.mediaId}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: src, spec: clipSpec(doc, c) }),
      });
      const v = (await r.json()) as VideoMeta & { error?: { message: string } };
      if (!r.ok)
        throw new Error(v.error?.message ?? "Couldn't make the freeze frame.");
      const group = `freeze:${clipId}:${++editSeq.current}`;
      const inside = t > start + 0.05 && t < start + clipLength(c) - 0.05;
      if (inside) dispatchDoc({ type: "split", clipId, t }, group);
      // the still looks like the clip at that moment (its keyframes: the place, size, angle, opacity there)
      const m = ds.media[c.mediaId];
      const into = Math.min(clipLength(c), Math.max(0, t - start));
      const transform = m
        ? staticTransformAt(
            m.width,
            m.height,
            doc.canvas.width,
            doc.canvas.height,
            c,
            into,
          )
        : c.transform;
      const opacity = motionAt(c, into).opacity;
      addToTimeline(v, {
        trackId: f.track.id,
        index: f.index + 1,
        group,
        patch: {
          duration: 2,
          transform,
          color: c.color,
          mask: c.mask,
          ...(opacity < 0.999 ? { opacity } : {}),
        },
      });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setWorking(null);
    }
  };
  // ---------- transitions (Video 1 and Overlay tracks) ----------
  /** Select the transition into a clip (adding a crossfade if there's none). */
  const openTransition = (clipId: string) => {
    const f = findClip(doc, clipId);
    if (!f || (f.track.kind !== "main" && f.track.kind !== "overlay")) return;
    const sorted =
      f.track.kind === "main"
        ? f.track.clips
        : [...(f.track.clips as (AnyClip & { start: number })[])].sort(
            (a, b) => a.start - b.start,
          );
    const sortedIdx = sorted.findIndex((c) => c.id === clipId);
    if (sortedIdx <= 0) return;
    const prev = sorted[sortedIdx - 1];

    if (!("transitionIn" in f.clip) || !f.clip.transitionIn) {
      const defDur = 0.5;
      const maxLen = Math.min(clipLength(prev), clipLength(f.clip)) / 2;
      const duration = Math.min(defDur, maxLen);
      const patch: Record<string, unknown> = {
        transitionIn: { type: "crossfade", duration },
      };
      if (f.track.kind === "overlay") {
        const prevEnd =
          (prev as AnyClip & { start: number }).start + clipLength(prev);
        const curStart = (f.clip as AnyClip & { start: number }).start;
        if (Math.abs(curStart - prevEnd) <= 0.1) {
          patch.start = Math.max(
            (prev as AnyClip & { start: number }).start,
            prevEnd - duration,
          );
        }
      }
      dispatchDoc(
        { type: "setClip", clipId, patch },
        `transition:${++editSeq.current}`,
      );
    }
    setSelectedId(null);
    setSelTransition(clipId);
    setMode("program");
  };
  /** The cut on Video 1 or Overlay tracks nearest the playhead (the clip after it). */
  const cutNearPlayhead = (): string | null => {
    let best: string | null = null;
    let dist = Infinity;
    const playhead = clock.get();

    const selClip = selectedId ? findClip(doc, selectedId) : null;
    const tracksToCheck =
      selClip && selClip.track.kind === "overlay"
        ? [
            selClip.track,
            ...doc.tracks.filter((t) => t.id !== selClip.track.id),
          ]
        : doc.tracks;

    for (const tr of tracksToCheck) {
      if (tr.kind === "main") {
        const starts = mainStarts(tr.clips);
        tr.clips.forEach((c, i) => {
          if (i === 0) return;
          const dd = Math.abs(starts[i] - playhead);
          if (dd < dist) [best, dist] = [c.id, dd];
        });
      } else if (tr.kind === "overlay" && !tr.hidden) {
        const sorted = [...(tr.clips as (AnyClip & { start: number })[])].sort(
          (a, b) => a.start - b.start,
        );
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          const prevEnd = prev.start + clipLength(prev);
          if (
            ("transitionIn" in curr && curr.transitionIn) ||
            Math.abs(curr.start - prevEnd) <= 0.2 ||
            curr.start < prevEnd
          ) {
            const cutTime = curr.start;
            const dd = Math.abs(cutTime - playhead);
            if (dd < dist) [best, dist] = [curr.id, dd];
          }
        }
      }
    }
    return best;
  };
  const applyTransition = (type: TransitionType) => {
    const id = selTransition ?? cutNearPlayhead();
    if (!id)
      return setNotice(
        "Put at least two adjacent clips on a track first: a transition goes between them.",
      );
    const f = findClip(doc, id);
    if (!f) return;
    const cur = "transitionIn" in f.clip ? f.clip.transitionIn : undefined;
    const duration = cur?.duration ?? 0.5;
    const patch: Record<string, unknown> = { transitionIn: { type, duration } };
    if (f.track.kind === "overlay") {
      const sorted = [
        ...(f.track.clips as (AnyClip & { start: number })[]),
      ].sort((a, b) => a.start - b.start);
      const idx = sorted.findIndex((c) => c.id === id);
      if (idx > 0) {
        const prev = sorted[idx - 1];
        const prevEnd =
          (prev as AnyClip & { start: number }).start + clipLength(prev);
        const curStart = (f.clip as AnyClip & { start: number }).start;
        if (Math.abs(curStart - prevEnd) <= 0.1) {
          patch.start = Math.max(
            (prev as AnyClip & { start: number }).start,
            prevEnd - duration,
          );
        }
      }
    }
    dispatchDoc(
      { type: "setClip", clipId: id, patch },
      `transition:${++editSeq.current}`,
    );
    setSelectedId(null);
    setSelTransition(id);
    setMode("program");
    seekTimeline(Math.max(0, clipStart(doc, id) - 0.5));
  };
  /** "None": the cut at the playhead (or the selected transition) becomes a plain cut again. */
  const removeTransition = () => {
    const id = selTransition ?? cutNearPlayhead();
    if (!id)
      return setNotice(
        "Select a transition or move the playhead near a cut first.",
      );
    const f = findClip(doc, id);
    if (f && "transitionIn" in f.clip && f.clip.transitionIn) {
      const patch: Record<string, unknown> = { transitionIn: undefined };
      if (f.track.kind === "overlay") {
        const sorted = [
          ...(f.track.clips as (AnyClip & { start: number })[]),
        ].sort((a, b) => a.start - b.start);
        const idx = sorted.findIndex((c) => c.id === id);
        if (idx > 0) {
          const prev = sorted[idx - 1];
          const prevEnd =
            (prev as AnyClip & { start: number }).start + clipLength(prev);
          const curStart = (f.clip as AnyClip & { start: number }).start;
          const trDur = f.clip.transitionIn.duration;
          if (Math.abs(prevEnd - curStart - trDur) <= 0.15) {
            patch.start = prevEnd;
          }
        }
      }
      dispatchDoc(
        { type: "setClip", clipId: id, patch },
        `transition:${++editSeq.current}`,
      );
    }
    setSelTransition(null);
    setMode("program");
  };
  const applyTransitionAll = (
    t: { type: TransitionType; duration: number } | undefined,
  ) => {
    const group = `transition-all:${++editSeq.current}`;
    const trClip = selTransition ? findClip(doc, selTransition) : null;
    const track =
      trClip && trClip.track.kind === "overlay"
        ? trClip.track
        : doc.tracks.find((x) => x.kind === "main")!;
    if (track.kind === "main") {
      track.clips.forEach(
        (c, i) =>
          i > 0 &&
          dispatchDoc(
            { type: "setClip", clipId: c.id, patch: { transitionIn: t } },
            group,
          ),
      );
    } else {
      const sorted = [...(track.clips as (AnyClip & { start: number })[])].sort(
        (a, b) => a.start - b.start,
      );
      for (let i = 1; i < sorted.length; i++) {
        const c = sorted[i];
        const prev = sorted[i - 1];
        const prevEnd = prev.start + clipLength(prev);
        const patch: Record<string, unknown> = { transitionIn: t };
        if (t && Math.abs(c.start - prevEnd) <= 0.1) {
          patch.start = Math.max(prev.start, prevEnd - t.duration);
        }
        dispatchDoc({ type: "setClip", clipId: c.id, patch }, group);
      }
    }
  };

  /** Crop a video or picture clip on the program preview. */
  /**
   * Place, size, angle or opacity changed (preview or inspector): with keyframes it
   * goes into the keyframe at the playhead (or a new one there), like CapCut.
   */
  const editAtPlayhead = (
    clipId: string,
    patch: { transform?: Partial<Transform>; opacity?: number },
    group?: string,
  ) => {
    const f = findClip(live.current.doc, clipId);
    if (
      !f ||
      f.track.locked ||
      f.clip.type === "audio" ||
      f.clip.type === "blank"
    )
      return;
    const keyed = hasKeys(f.clip);
    // playing: stop first (a keyframe per frame would be made otherwise)
    if (keyed) programRef.current?.pause();
    const t = clock.get();
    if (!keyed) {
      const curT = (f.clip as MotionClip).transform;
      const pt = patch.transform;
      const tSame =
        !pt ||
        Object.entries(pt).every(([k, v]) => {
          if (k === "crop") {
            const cc = curT.crop;
            const nc = v as Transform["crop"];
            if (cc === nc) return true;
            if (!cc || !nc) return false;
            return (
              cc.l === nc.l && cc.t === nc.t && cc.r === nc.r && cc.b === nc.b
            );
          }
          return (curT as Record<string, unknown>)[k] === v;
        });
      const targetOp =
        patch.opacity !== undefined && patch.opacity < 0.999
          ? Math.min(1, Math.max(0, patch.opacity))
          : undefined;
      const opSame = !("opacity" in patch) || f.clip.opacity === targetOp;
      if (tSame && opSame) return;
    }
    // edits at different moments are separate undo steps
    const g =
      group && keyed ? `${group}@${Math.round(t * doc.canvas.fps)}` : group;
    dispatchDoc({ type: "editClipAt", clipId, t, ...patch }, g);
  };
  /** An element's side dragged on the preview: its shape, then its size and place (at the playhead), as one undo step. */
  const stretchAt = (
    clipId: string,
    next: { aspect: number; x: number; y: number; scale: number },
    group: string,
  ) => {
    const f = findClip(live.current.doc, clipId);
    if (!f || f.clip.type !== "element") return;
    const g = hasKeys(f.clip)
      ? `${group}@${Math.round(clock.get() * doc.canvas.fps)}`
      : group;
    if (f.clip.el.aspect !== next.aspect) {
      dispatchDoc(
        {
          type: "setClip",
          clipId,
          patch: { el: { ...f.clip.el, aspect: next.aspect } },
        },
        g,
      );
    }
    editAtPlayhead(
      clipId,
      { transform: { x: next.x, y: next.y, scale: next.scale } },
      group,
    );
  };
  /** The corner-radius dot on the preview: a video's or picture's rounded corners (its shape), an element's corners. */
  const radiusAt = (clipId: string, share: number, group: string) => {
    const f = findClip(live.current.doc, clipId);
    if (!f) return;
    if (f.clip.type === "element") {
      dispatchDoc(
        {
          type: "setClip",
          clipId,
          patch: {
            el: { ...f.clip.el, radius: share > 0 ? share : undefined },
          },
        },
        group,
      );
      return;
    }
    if (f.clip.type !== "video" && f.clip.type !== "image") return;
    const m = f.clip.mask;
    // (no corners: a plain rectangle again; a border stays)
    const mask =
      share > 0
        ? {
            shape: "rounded" as const,
            radius: share,
            feather: m?.feather ?? 0,
            ...(m?.border ? { border: m.border } : {}),
          }
        : m?.border?.width
          ? {
              shape: "rect" as const,
              radius: 0,
              feather: m.feather,
              border: m.border,
            }
          : undefined;
    dispatchDoc({ type: "setClip", clipId, patch: { mask } }, group);
  };
  /** The inspector's keyframe controls for a clip. */
  const motionFor = (clipId: string): MotionProps => ({
    clock,
    start: clipStart(doc, clipId),
    fps: doc.canvas.fps,
    onEditAt: (patch, group) =>
      editAtPlayhead(clipId, patch, group ? `${group}:${clipId}` : undefined),
    onKeyframe: (op) =>
      dispatchDoc(
        { type: "keyframe", clipId, t: clock.get(), op },
        `key:${op.kind}:${clipId}:${++editSeq.current}`,
      ),
    onSeek: (t) => seekTimeline(t),
    canvas: { width: doc.canvas.width, height: doc.canvas.height },
    overlay: findClip(doc, clipId)?.track.kind === "overlay",
  });
  const startCrop = (id: string) => {
    if (cropFor === id) return;
    setSelectedId(id);
    setInspTab("basic");
    setMode("program");
    setCropFor(id);
    // the playhead on the clip (its middle: away from fades and transitions), or there is no picture to crop
    const f = findClip(doc, id);
    if (f) {
      const s0 = clipStart(doc, id);
      const len = clipLength(f.clip as AnyClip);
      const now = clock.get();
      if (now < s0 || now >= s0 + len) {
        clock.set(s0 + len / 2);
        programRef.current?.seek(s0 + len / 2);
      }
    }
  };
  /** Select a clip (timeline or preview): pictures, text and sound show in the program view. */
  const selectClip = (id: string | null) => {
    setSelTransition(null);
    setLogoSel(false);
    if (id !== cropFor) setCropFor(null);
    if (id !== patchEdit?.clipId) setPatchEdit(null);
    setSelectedId(id);
    setSelectedClipIds(id ? new Set([id]) : new Set());
    const f = id ? findClip(doc, id) : null;
    if (f && f.clip.type !== "video" && mode === "clip") setMode("program");
  };

  const onSelectClips = (ids: string[]) => {
    setSelectedClipIds(new Set(ids));
    if (ids.length === 1) {
      selectClip(ids[0]);
    } else if (ids.length === 0) {
      selectClip(null);
    } else {
      if (!selectedId || !ids.includes(selectedId)) {
        setSelectedId(ids[0]);
      }
    }
  };

  const getCutPoints = (): number[] => {
    const cuts = new Set<number>([0, Math.max(0, docDuration(doc))]);
    for (const tr of doc.tracks) {
      if (tr.kind === "main") {
        const starts = mainStarts(tr.clips);
        starts.forEach((s, idx) => {
          cuts.add(s);
          cuts.add(s + clipLength(tr.clips[idx] as AnyClip));
        });
      } else {
        for (const c of tr.clips) {
          const s = (c as any).start ?? 0;
          cuts.add(s);
          cuts.add(s + clipLength(c as AnyClip));
        }
      }
    }
    return Array.from(cuts).sort((a, b) => a - b);
  };

  const jumpToPrevCut = () => {
    const cur = clock.get();
    const cuts = getCutPoints();
    for (let i = cuts.length - 1; i >= 0; i--) {
      if (cuts[i] < cur - 0.04) {
        seekTimeline(cuts[i]);
        return;
      }
    }
    seekTimeline(0);
  };

  const jumpToNextCut = () => {
    const cur = clock.get();
    const cuts = getCutPoints();
    for (let i = 0; i < cuts.length; i++) {
      if (cuts[i] > cur + 0.04) {
        seekTimeline(cuts[i]);
        return;
      }
    }
    seekTimeline(docDuration(doc));
  };

  const toggleDisableSelected = () => {
    const targetIds =
      selectedClipIds.size > 0
        ? Array.from(selectedClipIds)
        : selectedId
          ? [selectedId]
          : [];
    if (targetIds.length === 0) return;
    targetIds.forEach((id) => {
      const f = findClip(doc, id);
      if (!f || f.track.locked) return;
      const c = f.clip;
      if (c.type === "video" || c.type === "audio") {
        const nextMuted = !(c as VideoClip).muted;
        dispatchDoc(
          { type: "setClip", clipId: id, patch: { muted: nextMuted } },
          `clip:mute:${id}`,
        );
        setNotice(nextMuted ? "Clip muted" : "Clip unmuted");
      } else if (
        c.type === "text" ||
        c.type === "element" ||
        c.type === "image"
      ) {
        const curOpacity = (c as any).opacity ?? 1;
        const nextOpacity = curOpacity === 0 ? 1 : 0;
        dispatchDoc(
          { type: "setClip", clipId: id, patch: { opacity: nextOpacity } },
          `clip:opacity:${id}`,
        );
        setNotice(nextOpacity === 0 ? "Clip hidden" : "Clip visible");
      }
    });
  };

  // keyboard: ⌘Z / ⇧⌘Z, ? help, and the editing shortcuts (not while typing or in a dialog)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const t = e.target;
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t instanceof HTMLElement && t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const inDialog = !!document.querySelector("dialog[open]");
      // ⌘K: Search tools, from anywhere (also while typing); again: close it
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        if (inDialog && !searchOpen) return;
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      // ⌘S: save now (the project saves itself anyway; this also stops the browser's "Save page")
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void sync.flush();
        return;
      }
      // crop mode: Enter or Esc finishes it (also right after moving a crop slider)
      const slider = t instanceof HTMLInputElement && t.type === "range";
      if (
        (cropFor || patchEdit) &&
        (e.key === "Escape" || e.key === "Enter") &&
        (!typing || slider)
      ) {
        e.preventDefault();
        setCropFor(null);
        setPatchEdit(null);
        return;
      }
      if (logoShown && e.key === "Escape" && !typing) {
        setLogoSel(false);
        return;
      }
      if (
        (selectedId || selectedClipIds.size > 0) &&
        e.key === "Escape" &&
        !typing &&
        !inDialog &&
        !e.defaultPrevented
      ) {
        setSelectedId(null);
        setSelectedClipIds(new Set());
        return;
      }
      // ⌘A / Ctrl+A: Select all clips on unlocked tracks (not while typing)
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "a" &&
        !typing
      ) {
        e.preventDefault();
        const allUnlockedIds = doc.tracks
          .filter((t) => !t.locked)
          .flatMap((t) => t.clips.map((c) => c.id));
        setSelectedClipIds(new Set(allUnlockedIds));
        if (allUnlockedIds.length > 0) setSelectedId(allUnlockedIds[0]);
        return;
      }
      // Esc leaves focus mode (after a crop or the logo; not from inside a dialog)
      if (
        focus &&
        e.key === "Escape" &&
        !typing &&
        !inDialog &&
        !e.defaultPrevented
      ) {
        setFocus(false);
        return;
      }
      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (t instanceof HTMLInputElement && t.type === "text") return;
        e.preventDefault();
        dispatchHistory({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      // ⌘C / ⌘X copy or cut the selected clip, ⌘V pastes it at the playhead (not while text is selected or typed)
      if (
        (e.metaKey || e.ctrlKey) &&
        !typing &&
        !e.shiftKey &&
        !e.altKey &&
        ["c", "x", "v"].includes(e.key.toLowerCase())
      ) {
        const k = e.key.toLowerCase();
        if (k !== "v" && selectedId && !window.getSelection()?.toString()) {
          e.preventDefault();
          copyClip(selectedId, k === "x");
          return;
        }
        if (k === "v" && copied) {
          e.preventDefault();
          pasteAt(clock.get());
          return;
        }
      }
      // ⌥⌘C copies clip visual style, ⌥⌘V pastes clip style onto selected clip
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !typing &&
        selectedId &&
        ["c", "v"].includes(e.key.toLowerCase())
      ) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          e.preventDefault();
          copyClipStyle(selectedId);
          return;
        }
        if (k === "v" && copiedStyle) {
          e.preventDefault();
          pasteClipStyle(selectedId);
          return;
        }
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "d" &&
        !typing &&
        selectedId
      ) {
        e.preventDefault();
        dispatchDoc({ type: "duplicate", clipId: selectedId });
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === "j" ||
          (e.shiftKey && e.key.toLowerCase() === "g")) &&
        !typing
      ) {
        e.preventDefault();
        const playheadT = clock.get();
        setAiTooltipState({
          isOpen: true,
          target: {
            at: playheadT,
            trackId: "main",
            targetDescription: `Timeline at ${formatTime(playheadT)}`,
          },
        });
        return;
      }
      if (
        typing ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        exportOpen ||
        helpOpen ||
        silenceFor ||
        !hasClips ||
        e.defaultPrevented
      )
        return;
      const onControl =
        t instanceof HTMLElement &&
        t.closest(
          "button, a, [role=slider], [role=menu], [role=radio], label",
        ) !== null;
      const pl = mode === "clip" ? clipRef.current : player();
      const fps = doc.canvas.fps;
      switch (e.key) {
        case " ":
          if (onControl) return;
          e.preventDefault();
          // (side by side: the other one stops, so two never play at once)
          if (splitShown)
            (pl === clipRef.current ? programRef : clipRef).current?.pause();
          pl?.toggle();
          return;
        case "k":
        case "K":
          pl?.pause();
          return;
        case "l":
        case "L":
          pl?.play();
          return;
        case "j":
        case "J":
          pl?.pause();
          pl?.step(-Math.round(fps));
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (onControl) return;
          if (
            selected &&
            !selected.track.locked &&
            (selected.clip.type === "text" ||
              selected.clip.type === "element" ||
              selected.clip.type === "image" ||
              selected.clip.type === "video")
          ) {
            e.preventDefault();
            const step = e.shiftKey ? 0.05 : 0.005;
            const c = selected.clip;
            const t = clock.get();
            const start = clipStart(doc, c.id);
            const t0 = hasKeys(c)
              ? transformAt(c as MotionClip, t - start)
              : c.transform;
            let next: Partial<Transform> | null = null;
            if (e.key === "ArrowLeft") next = { x: t0.x - step };
            else if (e.key === "ArrowRight") next = { x: t0.x + step };
            else if (e.key === "ArrowUp") next = { y: t0.y - step };
            else if (e.key === "ArrowDown") next = { y: t0.y + step };
            if (next) {
              editAtPlayhead(
                c.id,
                { transform: next },
                `preview:nudge:${c.id}`,
              );
            }
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            pl?.pause();
            pl?.step(
              (e.key === "ArrowRight" ? 1 : -1) *
                (e.shiftKey ? Math.round(fps) : 1),
            );
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            jumpToPrevCut();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            jumpToNextCut();
            return;
          }
          return;
        }
        case "[":
          e.preventDefault();
          jumpToPrevCut();
          return;
        case "]":
          e.preventDefault();
          jumpToNextCut();
          return;
        case "+":
        case "=":
          e.preventDefault();
          timelineApiRef.current?.zoomIn();
          return;
        case "-":
        case "_":
          e.preventDefault();
          timelineApiRef.current?.zoomOut();
          return;
        case "\\":
          e.preventDefault();
          timelineApiRef.current?.fit();
          return;
        case "z":
        case "Z":
          if (e.shiftKey) {
            e.preventDefault();
            timelineApiRef.current?.fit();
            return;
          }
          break;
        case "b":
        case "B": {
          e.preventDefault();
          const m = mainClipAt(doc, clock.get());
          addBlankAt(m ? m.index + 1 : mainTrack(doc).clips.length);
          return;
        }
        case "t":
        case "T":
          e.preventDefault();
          addTextAt("title");
          return;
        case "d":
        case "D":
          e.preventDefault();
          toggleDisableSelected();
          return;
        case "Home":
        case "End":
          if (onControl) return;
          e.preventDefault();
          seekTimeline(e.key === "Home" ? 0 : docDuration(doc));
          return;
        case "s":
        case "S":
          splitAtPlayhead();
          return;
        case "m":
        case "M":
          if (onControl) return;
          e.preventDefault();
          dispatchDoc({ type: "addMarker", t: clock.get() });
          return;
        case "q":
        case "Q":
          trimToPlayhead("in");
          return;
        case "w":
        case "W":
          trimToPlayhead("out");
          return;
        case "f":
        case "F":
          if (wide) setFocus((f) => !f);
          return;
        case "Delete":
        case "Backspace":
          if (selTransition) {
            e.preventDefault();
            dispatchDoc({
              type: "setClip",
              clipId: selTransition,
              patch: { transitionIn: undefined },
            });
            setSelTransition(null);
            return;
          }
          if (logoShown) {
            e.preventDefault();
            setWatermark(undefined);
            return;
          }
          if (selectedClipIds.size > 0) {
            e.preventDefault();
            const ids = Array.from(selectedClipIds);
            dispatchDoc({ type: "deleteClips", clipIds: ids });
            setSelectedClipIds(new Set());
            setSelectedId(null);
            const remainingClips = doc.tracks.flatMap((tr) =>
              tr.clips.filter((c) => !selectedClipIds.has(c.id)),
            );
            const nextDur =
              remainingClips.length === 0 ? 0 : Math.max(0, docDuration(doc));
            if (clock.get() > nextDur) clock.set(Math.max(0, nextDur));
            return;
          }
          if (selectedId) {
            e.preventDefault();
            deleteSelected();
            setSelectedClipIds(new Set());
          }
          return;
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a missed drop must not open the file in the browser tab
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  // ---------- the active video clip (Background Removal, clip view) ----------
  const kp = keyParams(state);
  const [aiAttempt, setAiAttempt] = useState(0);
  const clipSpecNow = activeClip ? clipSpec(doc, activeClip) : state.spec;
  const aiMask = useAiMask(video?.id ?? null, clipSpecNow, aiAttempt);
  const aiOn = state.method === "ai" && removalOn(state);
  const hard = aiParams(state).hardness;
  const liveParams: LiveKeyParams =
    state.method === "ai"
      ? {
          ...kp,
          method: "packed",
          maskLo: (hard * 96) / 255,
          maskHi: 1 - (hard * 96) / 255,
        }
      : state.method === "black"
        ? { ...kp, method: "black", ...blackParams(state) }
        : kp;
  // AI Removal needs no color pick
  const pickingOn = picking && state.method !== "ai" && clipShown;
  const crop = useCropBox(
    video?.id ?? "",
    clipSpecNow,
    !!video && doc.output.crop.enabled && !notOnServer(video.id),
  );
  const preview = usePreview(
    video?.id ?? "",
    clipSpecNow,
    pausedT ?? lastT,
    // (the server's exact frame is for background removal: a file kept only here isn't sent just to show it)
    !!video && clipShown && pausedT !== null && removalOn(state) && !notOnServer(video.id),
  );
  const seeThroughPct = preview.result?.stats.seeThroughPct ?? null;
  const seeThrough =
    state.method === "color" &&
    seeThroughPct !== null &&
    seeThroughPct > SEE_THROUGH_WARN_PCT;

  /** Live key settings of any video clip, for the program preview. */
  const liveOf = (c: VideoClip): LiveKeyParams | null => {
    const cs = clipStudioState(ds, c.id);
    if (!cs || !removalOn(cs)) return null;
    const k = keyParams(cs);
    if (cs.method === "black")
      return { ...k, method: "black", ...blackParams(cs) };
    if (cs.method === "ai") {
      const h = aiParams(cs).hardness;
      return {
        ...k,
        method: "packed",
        maskLo: (h * 96) / 255,
        maskHi: 1 - (h * 96) / 255,
      };
    }
    return k;
  };
  // every AI Removal clip gets its playing preview (the selected one also reports progress in its card)
  const aiClips = doc.tracks.flatMap((t) =>
    t.clips.filter(
      (c): c is VideoClip =>
        c.type === "video" &&
        (c as VideoClip).ops.some((o) => o.enabled && o.type === "aiMatte"),
    ),
  );
  const allPacked = useAiMasks(
    aiClips.map((c) => ({
      clipId: c.id,
      videoId: c.mediaId,
      spec: clipSpec(doc, c),
    })),
  );
  const blurOf = (c: VideoClip) => {
    const op = c.ops.find((o) => o.enabled && o.type === "aiMatte");
    return op && op.type === "aiMatte" && op.params.background === "blur"
      ? (op.params.blur ?? 12)
      : null;
  };
  // Stabilize: the preview plays the stabilized copy once it's made (not with AI Removal)
  const hasAi = (c: VideoClip) =>
    c.ops.some((o) => o.enabled && o.type === "aiMatte");
  const stabIds = doc.tracks.flatMap((t) =>
    t.clips
      .filter(
        (c): c is VideoClip =>
          c.type === "video" &&
          !!(c as VideoClip).stabilize &&
          !hasAi(c as VideoClip),
      )
      .map((c) => c.mediaId),
  );
  const stab = useDerived(stabIds, "stabilize");
  // Reverse: the preview plays the backwards copy of each reversed clip once it's made (not with AI Removal)
  const revClips = doc.tracks.flatMap((t) =>
    t.clips.filter(
      (c): c is VideoClip =>
        c.type === "video" &&
        !!(c as VideoClip).reversed &&
        !hasAi(c as VideoClip),
    ),
  );
  const rev = useReversed(
    revClips.map((c) => ({
      clipId: c.id,
      mediaId: c.mediaId,
      in: c.in,
      out: c.out,
    })),
  );
  const reversedOf = (c: VideoClip) =>
    c.reversed && !hasAi(c) ? (rev.url[c.id] ?? null) : null;

  // ---------- background tasks (the top bar's list) ----------
  const exportStep = job?.steps.find((x) => x.state === "running");
  const exportStarting =
    starting || (!!ownJob && ownJob === jobId && job?.id !== jobId);
  useTask(
    exportStarting
      ? {
          id: "export",
          kind: "export",
          label: "Exporting",
          detail: "Starting…",
          percent: 0,
        }
      : !job || job.state === "canceled"
        ? null
        : {
            id: "export",
            kind: "export",
            label: running
              ? "Exporting"
              : job.state === "done"
                ? "Export ready"
                : "Export failed",
            detail: running ? exportStep?.label : (job.error ?? undefined),
            percent: running ? stepsPercent(job.steps) : null,
            state: running
              ? "running"
              : job.state === "done"
                ? "done"
                : "failed",
          },
    () => setExportOpen(true),
  );
  const veoJob = veo.job;
  useTask(
    veoJob
      ? {
          id: `veo:${veoJob.id}`,
          kind: "ai",
          label:
            veoJob.state === "working"
              ? "Making a video with Veo"
              : veoJob.state === "ready"
                ? "Veo video ready"
                : "Veo video failed",
          detail:
            veoJob.state === "failed"
              ? veoJob.error
              : `“${veoJob.prompt.slice(0, 60)}” · ${veoJob.seconds} s`,
          percent: null,
          state:
            veoJob.state === "working"
              ? "running"
              : veoJob.state === "ready"
                ? "done"
                : "failed",
        }
      : null,
    () => setGenVideoOpen(true),
  );
  useTask(
    uploadState.kind === "uploading" || uploadState.kind === "checking"
      ? {
          id: `upload:${uploadState.name}`,
          kind: "upload",
          label:
            uploadState.kind === "uploading"
              ? "Uploading"
              : "Checking the file",
          detail: uploadState.name,
          percent:
            uploadState.kind === "uploading" && uploadState.total
              ? (uploadState.loaded / uploadState.total) * 100
              : null,
        }
      : null,
    () => showPanel("media"),
  );
  const sending = uploadingItems();
  void localVer;
  useTask(
    sending.length
      ? {
          id: "local-uploads",
          kind: "upload",
          label: sending.some((u) => u.state === "failed") ? "Upload stopped" : "Uploading",
          detail: sending.length === 1 ? sending[0]!.name : `${sending.length} files`,
          percent: (100 * sending.reduce((n, u) => n + u.progress * u.size, 0)) / Math.max(1, sending.reduce((n, u) => n + u.size, 0)),
        }
      : null,
    () => showPanel("media"),
  );
  const steadying = [...new Set(stabIds)].filter((m) => !stab.url[m]);
  const firstClipOf = (pred: (c: AnyClip) => boolean) =>
    doc.tracks.flatMap((t): AnyClip[] => t.clips).find(pred)?.id ?? null;
  const selectForTask = (id: string | null, tab: InspectorTab) => {
    if (!id) return;
    setSelectedId(id);
    setInspTab(tab);
    setFocus(false);
  };
  useTask(
    steadying.length
      ? {
          id: "stabilize",
          kind: "copy",
          label:
            steadying.length > 1
              ? `Steadying ${steadying.length} clips`
              : "Steadying a clip",
          detail: metas[steadying[0]]?.fileName,
          percent:
            steadying.reduce((a, m) => a + (stab.percent[m] ?? 0), 0) /
            steadying.length,
        }
      : null,
    () =>
      selectForTask(
        firstClipOf(
          (c) =>
            c.type === "video" && (c as VideoClip).mediaId === steadying[0],
        ),
        "speed",
      ),
  );
  const reversing = revClips.filter((c) => !rev.url[c.id] && !rev.error[c.id]);
  useTask(
    reversing.length
      ? {
          id: "reverse",
          kind: "copy",
          label:
            reversing.length > 1
              ? `Reversing ${reversing.length} clips`
              : "Reversing a clip",
          detail: metas[reversing[0].mediaId]?.fileName,
          percent:
            reversing.reduce((a, c) => a + (rev.percent[c.id] ?? 0), 0) /
            reversing.length,
        }
      : null,
    () => selectForTask(reversing[0]?.id ?? null, "speed"),
  );
  useTask(
    activeClip && video && aiMask.state !== "off"
      ? {
          id: `ai-mask:${video.id}`,
          kind: "ai",
          label:
            aiMask.state === "working"
              ? "AI cut-out"
              : aiMask.state === "ready"
                ? "AI cut-out ready"
                : "AI cut-out failed",
          detail: aiMask.state === "failed" ? aiMask.error : video.fileName,
          percent: aiMask.state === "working" ? aiMask.percent : null,
          state:
            aiMask.state === "working"
              ? "running"
              : aiMask.state === "ready"
                ? "done"
                : "failed",
        }
      : null,
    () => selectForTask(activeClip?.id ?? null, "background"),
  );
  // ducking you can hear in the preview (only when a sound clip asks for it)
  const anyDuck = doc.tracks.some(
    (t) => t.kind === "audio" && t.clips.some((c) => c.duck),
  );
  const speech = useSpeechRanges(doc, ds.media, anyDuck);
  const sourceOf = (c: VideoClip) => {
    const steady = c.stabilize && !hasAi(c) ? (stab.url[c.mediaId] ?? null) : null;
    if (steady) return steady;
    // an imported file plays from this computer (lib/media/localMedia); with proxies on, the server's
    // light copy once the file is there
    const local = localSrc(c.mediaId);
    if (local) return proxyMode && !notOnServer(c.mediaId) ? null : local;
    // its copy in this browser is being read back: wait a moment for it ("" = no element yet), rather
    // than start downloading the server's copy only to switch over
    return restorePending(c.mediaId) ? "" : null;
  };
  const packedOf = (c: VideoClip) =>
    activeClip && c.id === activeClip.id && aiOn
      ? aiMask.packed
      : (allPacked[c.id] ?? null);

  const onPick = async (
    pt: { x: number; y: number },
    at: number,
    clientSample?: SampledKeyColor | null,
  ) => {
    if (!video) return;
    setPicking(false);
    const returnMode = pickReturnMode;
    if (returnMode === "program") {
      setMode("program");
    }
    setPickReturnMode(null);

    if (clientSample) {
      dispatch({ type: "setKey", hex: clientSample.hex, source: "picked" });
      setView((v) => (v === "original" ? "removed" : v));
      setPickWarning(
        clientSample.looksLikeKey
          ? null
          : `The color you clicked (${clientSample.hex}) doesn't look like a green or blue background. Parts of the person may disappear.`,
      );
      return;
    }

    if (!notOnServer(video.id)) {
      setWorking("Reading the color…");
      try {
        const res = await fetch(
          `/api/videos/${video.id}/pick?x=${pt.x}&y=${pt.y}&t=${at.toFixed(3)}`,
        );
        const r = (await res.json()) as { hex: string; looksLikeKey: boolean };
        if (!res.ok) throw new Error();
        dispatch({ type: "setKey", hex: r.hex, source: "picked" });
        setView((v) => (v === "original" ? "removed" : v));
        setPickWarning(
          r.looksLikeKey
            ? null
            : `The color you clicked (${r.hex}) doesn't look like a green or blue background. Parts of the person may disappear.`,
        );
      } catch {
        setPickWarning("Couldn't read the color there. Try again.");
      } finally {
        setWorking(null);
      }
    } else {
      setPickWarning("Couldn't read the color there. Try again.");
    }
  };

  const useDetected = () => {
    dispatch({ type: "resetKey" });
    // "use the detected green" means: remove it
    dispatch({ type: "setRemoval", enabled: true });
    setPickWarning(null);
    setPicking(false);
    setView((v) => (v === "original" ? "removed" : v));
  };

  // ---------- export ----------
  // a timeline that is just one video (its parts, one background removal, transparent) exports as before
  const single = useMemo(() => {
    const s = asSingleVideo(doc);
    if (!s || doc.canvas.background !== "transparent") return null;
    const m = ds.media[s.mediaId];
    if (
      !m ||
      Math.abs(m.width - doc.canvas.width) > 1 ||
      Math.abs(m.height - doc.canvas.height) > 1
    )
      return null;
    return s;
  }, [doc, ds.media]);

  /**
   * Start an export in `format`. `size`: a social-media size (a copy of the project at that
   * size); the project itself stays as it is. Formats without alpha put a transparent project on black.
   */
  const generate = async (
    outputOverride?: Partial<Output>,
    size?: { width: number; height: number },
    format: ExportFormat = exportFormat,
  ) => {
    if (!hasClips) return;
    let d = outputOverride
      ? { ...doc, output: { ...doc.output, ...outputOverride } }
      : doc;
    if (
      d.canvas.background === "transparent" &&
      !needsAlpha(format) &&
      format !== "png"
    )
      d = { ...d, canvas: { ...d.canvas, background: "#000000" } };
    if (size)
      d = {
        ...d,
        canvas: { ...d.canvas, width: size.width, height: size.height },
      };
    // a project that is one transparent video makes its website pack the detailed way (width, crop, estimate)
    const s =
      single && !size && format === "pack"
        ? { ...single, spec: { ...single.spec, output: d.output } }
        : null;
    setStarting(true);
    setStartError(null);
    if (activeClip) writeLocal(LAST_SPEC_KEY, clipSpec(d, activeClip));
    try {
      // the export runs on the server: files kept only on this computer are sent now (the top bar shows it)
      const needed = s ? [s.mediaId] : mediaIdsOf(d);
      if (pendingAmong(needed).length) {
        const sent = await ensureOnServer(needed);
        if (!sent.ok)
          throw new Error(
            `${sent.failed.length === 1 ? `“${localItem(sent.failed[0]!)?.name ?? "A file"}”` : `${sent.failed.length} files`} couldn't be sent to the server, so the export can't start. Check the connection and try again.`,
          );
      }
      // drawn pictures (FFmpeg can't draw text or our backdrops): made here like the preview, sent once
      const send = async (key: string, make: () => Promise<Blob | null>) => {
        let id = sentTexts.get(key);
        if (id) return id;
        const png = await make();
        if (!png) throw new Error("Couldn't prepare the export.");
        const r = await fetch("/api/renders", {
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: png,
        });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.id)
          throw new Error(
            j?.error?.message ?? "Couldn't prepare the text for the export.",
          );
        id = j.id as string;
        sentTexts.set(key, id);
        return id;
      };
      const texts: Record<string, string> = {};
      // (a moving text is drawn at its biggest; the export scales and moves it: lib/edit/keyframes textRenderTransform)
      // (typewriter: every step of the typing in one picture, and where its area sits)
      const textSprites: Record<string, ReturnType<typeof textSpriteOf>> = {};
      if (!s)
        for (const c of textClipsOf(d)) {
          const rt = textRenderTransform(c);
          const drawn = { ...c, transform: rt };
          const typing =
            c.anim.in === "typewriter" || c.anim.out === "typewriter";
          // word-by-word captions: one row per word, so the export highlights like the preview
          const words = typing
            ? null
            : wordSpriteOf(drawn, d.canvas.width, d.canvas.height);
          if (typing)
            textSprites[c.id] = textSpriteOf(
              drawn,
              d.canvas.width,
              d.canvas.height,
            );
          else if (words) textSprites[c.id] = words;
          texts[c.id] = await send(
            JSON.stringify([
              c.text,
              c.style,
              rt,
              d.canvas.width,
              d.canvas.height,
              typing,
              !!words,
            ]),
            () =>
              typing
                ? renderTextSprite(drawn, d.canvas.width, d.canvas.height)
                : words
                  ? renderWordSprite(drawn, d.canvas.width, d.canvas.height)
                  : renderTextPng(drawn, d.canvas.width, d.canvas.height),
          );
        }
      // elements: drawn like the preview at the size the export shows them (lib/elements/render)
      const elements: Record<
        string,
        {
          png: string;
          w: number;
          h: number;
          mask?: string;
          strip?: {
            png: string;
            w: number;
            x: number;
            win: number;
            speed: number;
          };
        }
      > = {};
      if (!s)
        for (const c of elementClipsOf(d)) {
          const W = d.canvas.width;
          const H = d.canvas.height;
          const key = JSON.stringify([
            "element",
            c.el,
            c.transform.scale,
            c.keyframes?.map((k) => k.scale),
            W,
            H,
          ]);
          const parts = await renderElementParts(c, W, H);
          if (!parts)
            throw new Error("Couldn't draw an element for the export.");
          const one = (tag: string, blob: Blob) =>
            send(`${key}|${tag}`, async () => blob);
          elements[c.id] = {
            png: await one("png", parts.png),
            w: parts.w,
            h: parts.h,
            ...(parts.mask ? { mask: await one("mask", parts.mask) } : {}),
            ...(parts.strip
              ? {
                  strip: {
                    ...parts.strip,
                    png: await one("words", parts.strip.png),
                  },
                }
              : {}),
          };
        }
      const bd = d.canvas.backdrop;
      const backdrop =
        !s && bd && bd.kind !== "media"
          ? await send(
              JSON.stringify(["backdrop", bd, d.canvas.width, d.canvas.height]),
              () => renderBackdropPng(bd, d.canvas.width, d.canvas.height),
            )
          : undefined;
      // the logo with a box / rounded corners: drawn here, like the preview
      const wm = d.watermark;
      const logo =
        !s && wm && logoHasBadge(wm)
          ? await send(
              JSON.stringify([
                "logo",
                {
                  ...wm,
                  from: undefined,
                  to: undefined,
                  anim: undefined,
                  opacity: 1,
                },
                d.canvas.width,
                d.canvas.height,
              ]),
              () => renderLogoPng(wm, d.canvas.width, d.canvas.height),
            )
          : undefined;
      const body = s
        ? { videoId: s.mediaId, spec: s.spec }
        : {
            doc: d,
            texts,
            textSprites,
            elements,
            backdrop,
            logo,
            format,
            ...(isStillFormat(format) ? { at: clock.get() } : {}),
          };
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      // a text picture expired on the server: draw them again next time
      if (!res.ok && j?.error?.code === "missing_text") sentTexts.clear();
      if (!res.ok) throw new Error(j?.error?.message ?? "Couldn't start.");
      if (sync.project) sync.save({ jobId: j.jobId }, true);
      setJobId(j.jobId);
      setOwnJob(j.jobId);
    } catch (e) {
      setStartError((e as Error).message);
      setExportOpen(true);
    } finally {
      setStarting(false);
    }
  };

  /** Export ▾ → MP4 at the project size, or at a video size (YouTube, Shorts / Reels, square, 4:5). */
  const videoExport = (id: VideoPresetId | "project" | "social-set") => {
    if (id === "social-set") {
      // one click, three videos: each size is its own job in the export queue (the project stays as it is)
      setExportFormat("mp4");
      setExportOpen(true);
      void (async () => {
        for (const pid of SOCIAL_SET) {
          const p = videoPreset(pid)!;
          await generate(undefined, { width: p.width, height: p.height }, "mp4");
        }
      })();
      return;
    }
    const p = id === "project" ? null : videoPreset(id);
    if (id !== "project" && !p) return;
    setExportFormat("mp4");
    setExportOpen(true);
    void generate(
      undefined,
      p ? { width: p.width, height: p.height } : undefined,
      "mp4",
    );
  };

  /** Export ▾ → a website pack (VP9 + HEVC alpha, optionally with the ProRes master). */
  const quickExport = (id: ExportPresetId) => {
    const preset = EXPORT_PRESETS.find((x) => x.id === id)!;
    setExportFormat("pack");
    setExportOpen(true);
    void generate({ master: preset.master }, undefined, "pack");
  };

  const cancel = async () => {
    if (!jobId) return;
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" }).catch(() => null);
  };

  const final: FinalFiles | null =
    job?.state === "done" &&
    job.files.some((x) => x.kind === "webm" || x.kind === "mov")
      ? (() => {
          const f = (k: string) => job.files.find((x) => x.kind === k);
          // a website pack has both; a single-format export (VP9 WebM, HEVC MOV) has one: it plays in both places
          const webm = f("webm") ?? f("mov")!;
          const mov = f("mov") ?? webm;
          const poster = f("poster");
          return {
            webmUrl: fileUrl(job, webm),
            movUrl: fileUrl(job, mov),
            posterUrl: poster ? fileUrl(job, poster) : undefined,
          };
        })()
      : null;

  const size = video
    ? preview.result?.stats
      ? {
          width: preview.result.stats.width,
          height: preview.result.stats.height,
        }
      : {
          width: Math.min(video.info.width, 1920),
          height:
            video.info.width > 1920
              ? Math.round((video.info.height * 1920) / video.info.width)
              : video.info.height,
        }
    : { width: 16, height: 9 };

  const on = removalOn(state);
  const anyRemoval = useMemo(
    () =>
      doc.tracks.some((t) =>
        t.clips.some(
          (c) =>
            c.type === "video" && (c as VideoClip).ops.some((o) => o.enabled),
        ),
      ),
    [doc],
  );
  // (only text and pictures on a transparent canvas — a see-through lower third — is fine)
  const anyVideo = doc.tracks.some((t) =>
    t.clips.some((c) => c.type === "video"),
  );
  const anyBlur = aiClips.some((c) => blurOf(c) !== null);
  // does the timeline make any sound (for the sound-only formats; the server checks again)
  // what the export size estimate measures (only the clips matter: its key changes when they do)
  const sizeBasis = useMemo(
    () => (hasClips ? sizeBasisOf(doc) : null),
    [doc, hasClips],
  );
  const docHasSound = doc.tracks.some(
    (t) =>
      !("hidden" in t && t.hidden) &&
      !("muted" in t && t.muted) &&
      t.clips.some(
        (c) =>
          (c.type === "video" || c.type === "audio") &&
          !(c.type === "video" && c.muted) &&
          c.volume > 0 &&
          !!ds.media[c.mediaId]?.hasAudio,
      ),
  );
  /** Why a format can't be made now. MP4 and the other solid formats don't need background removal. */
  // (files kept only on this computer don't block it: starting the export sends them first)
  const exportBlocked = (f: ExportFormat): string | null =>
    !capability.ok
      ? `Can't make videos yet: ${capability.message}`
      : !hasClips
        ? "Add a video or picture first."
        : f === "mov-alpha" && !serverCaps.safariAlpha
          ? "Safari's see-through file (HEVC + alpha) needs Apple's encoder, which this server doesn't have. Use WebM (VP9 + alpha): it works in Chrome, Edge, Firefox and Android."
        : (formatBlocked(f, {
            transparent:
              doc.canvas.background === "transparent" && !doc.canvas.backdrop,
            hasSound: docHasSound,
            duration: docDuration(doc),
          }) ??
          (!needsAlpha(f)
            ? null
            : anyBlur
              ? "Blur background keeps the video solid, so it can't be see-through. Pick MP4 or another video format."
              : anyVideo && !anyRemoval
                ? "Turn on Background removal first, so the video has see-through parts."
                : null));
  const busy = running ? "An export is running." : null;
  const videoDisabled = exportBlocked("mp4") ?? busy;
  const patchOutput = (x: Partial<Output>) =>
    dispatchDoc({ type: "output", patch: x });
  // the preview background (checkerboard, colors, a picture…): a small popover in the preview toolbar
  const BG_LABEL: Record<Bg, string> = {
    checker: "Checkerboard",
    white: "White",
    black: "Black",
    custom: "Custom",
    image: "Image",
    video: "Video",
  };
  const bgButton = (
    <Popover
      size="sm"
      label="Preview background"
      button={
        <>
          <span
            aria-hidden="true"
            className={`size-3.5 rounded-sm border border-control ${bg === "checker" || bg === "image" || bg === "video" ? "bg-checker" : ""}`}
            style={
              bg === "white"
                ? { background: "#fff" }
                : bg === "black"
                  ? { background: "#000000" }
                  : bg === "custom"
                    ? { background: custom }
                    : undefined
            }
          />
          <span className="max-[1699px]:sr-only">
            Background: {BG_LABEL[bg]}
          </span>
          <Icon name="chevronDown" className="size-3" />
        </>
      }
    >
      <PreviewOptions
        bg={bg}
        onBg={setBg}
        custom={custom}
        onCustom={setCustom}
        highlight={highlight}
        onHighlight={setHighlight}
        media={bgMedia}
        onMedia={chooseBgMedia}
      />
      <p className="mt-2 text-[0.6875rem] text-muted">
        Only for looking at transparent parts. Not exported.
      </p>
    </Popover>
  );
  const tool = TOOLS[0];

  /** AI Tools: a wide panel on the right (in place of the inspector); the preview and timeline stay in the middle. */
  const toggleAi = () =>
    setAiOpen((o) => {
      if (!o) setLeftPanel(null);
      return !o;
    });
  const onRail = (id: PanelId) => {
    if (id === "templates") {
      setWorkspaceView((v) => (v === "templates" ? "studio" : "templates"));
      return;
    }
    if (workspaceView === "templates") {
      setWorkspaceView("studio");
    }
    if (!wide) return setPhoneTab(id);
    // (in focus mode a rail button brings the panels back, with that one open)
    if (focus) {
      setFocus(false);
      if (id === "ai") return setAiOpen(true);
      if (isSide(id)) return setLeftPanel(id);
      return;
    }
    if (id === "ai") return toggleAi();
    if (isSide(id)) setLeftPanel((l) => (l === id ? null : id));
  };
  const railActive: PanelId | null =
    workspaceView === "templates"
      ? "templates"
      : wide
        ? aiOpen
          ? "ai"
          : leftPanel
        : phoneTab;
  // (phones: the Edit tab is the timeline + settings, not a panel)
  const sidePanel: SidePanel | null = wide
    ? leftPanel
    : isSide(phoneTab) && phoneTab !== "edit"
      ? phoneTab
      : null;
  /** Open a panel (Search tools, a task, the project menu): never closes it. */
  const showPanel = (id: SidePanel | "ai") => {
    if (!wide) return setPhoneTab(id);
    setFocus(false);
    if (id !== "ai") return setLeftPanel(id);
    setLeftPanel(null);
    setAiOpen(true);
  };

  // ---------- AI tools ----------
  // they work on the selected clip, else the first video on Video 1
  const aiTarget = selected?.clip ?? defaultVideoClip(doc);
  const aiVideo = aiTarget?.type === "video" ? (aiTarget as VideoClip) : null;
  const aiPicture =
    aiTarget && (aiTarget.type === "video" || aiTarget.type === "image")
      ? aiTarget
      : null;
  const aiSound =
    aiTarget &&
    (aiTarget.type === "video" || aiTarget.type === "audio") &&
    ds.media[aiTarget.mediaId]?.hasAudio
      ? aiTarget
      : null;
  const aiTargetName = aiTarget
    ? "mediaId" in aiTarget
      ? (metas[aiTarget.mediaId]?.fileName ?? "a clip")
      : aiTarget.type === "element"
        ? "an element"
        : aiTarget.type === "blank"
          ? "a blank scene"
          : "a text"
    : null;
  const aiWhyNot: Partial<Record<AiToolId, string | null>> = {
    "ai-remove": !serverCaps.aiRemoval ? NO_AI_REMOVAL : aiVideo ? null : "Add or select a video clip first.",
    "green-screen": aiVideo ? null : "Add or select a video clip first.",
    "blur-bg": !serverCaps.aiRemoval ? NO_AI_REMOVAL : aiVideo ? null : "Add or select a video clip first.",
    denoise: aiSound ? null : "Select a video or sound clip that has sound.",
    "auto-color": aiPicture ? null : "Add or select a video or picture first.",
    "replace-bg": !serverCaps.aiRemoval ? NO_AI_REMOVAL : aiVideo ? null : "Add or select a video clip first.",
    watermark: aiPicture ? null : "Add or select a video or picture first.",
    stabilize: aiVideo
      ? hasAi(aiVideo)
        ? "Stabilize can't be combined with AI Removal yet."
        : null
      : "Add or select a video clip first.",
    enhance: aiPicture ? null : "Add or select a video or picture first.",
    silences: aiSound ? null : "Select a clip with speech first.",
    "smart-crop": aiVideo ? null : "Add or select a video clip first.",
    extend: aiVideo ? null : "Add or select a video clip first.",
    "remove-object": aiPicture
      ? null
      : "Add or select a video or picture first.",
    upscale: aiVideo ? null : "Add or select a video clip first.",
    "video-denoise": aiVideo ? null : "Add or select a video clip first.",
    translate: aiSound ? null : "Select a clip with audio/speech first.",
    "smart-mix": null,
  };
  /** AI Removal on the clip, staying in the program view (Replace Background). */
  const removePerson = () => {
    if (!aiVideo) return;
    const group = `ai-tool:remove:${++editSeq.current}`;
    setSelectedId(aiVideo.id);
    setInspTab("background");
    dispatchDoc(
      {
        type: "clip",
        clipId: aiVideo.id,
        action: { type: "setMethod", method: "ai" },
      },
      group,
    );
    dispatchDoc(
      {
        type: "clip",
        clipId: aiVideo.id,
        action: { type: "setRemoval", enabled: true },
      },
      group,
    );
    dispatchDoc(
      {
        type: "clip",
        clipId: aiVideo.id,
        action: { type: "ai", patch: { background: "transparent" } },
      },
      group,
    );
    setMode("program");
  };
  const handleApplySmartMix = async (config: SmartMixConfig) => {
    setIsAnalyzingMix(true);
    try {
      const mediaIds = new Set<string>();
      for (const tr of doc.tracks) {
        if (tr.muted) continue;
        for (const c of tr.clips) {
          if ("mediaId" in c && c.mediaId && (c.type === "video" || c.type === "audio")) {
            const m = ds.media[c.mediaId];
            if (m?.hasAudio) {
              mediaIds.add(c.mediaId);
            }
          }
        }
      }

      const silencesMap: Record<string, Range[]> = {};
      await Promise.all(
        Array.from(mediaIds).map(async (id) => {
          try {
            const res = await fetch(`/api/videos/${id}/silences`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(DUCK_DETECT),
            });
            if (res.ok) {
              const data = (await res.json()) as { silences?: Range[] };
              if (data.silences) {
                silencesMap[id] = data.silences;
              }
            }
          } catch {
            silencesMap[id] = [];
          }
        })
      );

      const updatedDoc = applySmartMix(doc, silencesMap, config);
      dispatchDoc({ type: "replaceDoc", doc: updatedDoc, media: ds.media }, "smartMix:apply");
      setNotice("Smart Audio Mix applied with volume automation!");
    } catch (err) {
      console.error("Failed to apply Smart Mix:", err);
      setNotice("Couldn't analyze audio for Smart Mix.");
    } finally {
      setIsAnalyzingMix(false);
    }
  };

  const handleResetSmartMix = () => {
    const updatedDoc = resetSmartMix(doc);
    dispatchDoc({ type: "replaceDoc", doc: updatedDoc, media: ds.media }, "smartMix:reset");
    setNotice("Smart Audio Mix reset. Original clip volumes restored.");
  };

  const runAiTool = (id: AiToolId) => {
    // the clip tools open the inspector on the tab that shows what they changed
    const jump: Partial<Record<AiToolId, InspectorTab>> = {
      denoise: "audio",
      stabilize: "speed",
      "auto-color": "color",
      enhance: "color",
      watermark: "more",
      "ai-remove": "background",
      "green-screen": "background",
      "blur-bg": "background",
      "replace-bg": "background",
    };
    if (jump[id]) setInspTab(jump[id]!);
    if (id === "tts") {
      setVoiceoverMode("tts");
      return setTtsOpen(true);
    }
    if (id === "voice-clone") {
      setVoiceoverMode("tts");
      return setTtsOpen(true);
    }
    if (id === "grok") {
      setAiOpen(false);
      return setGrokOpen(true);
    }
    if ((id as string) === "universal-ai") {
      setAiOpen(false);
      const playheadT = clock.get();
      return setAiTooltipState({
        isOpen: true,
        target: {
          at: playheadT,
          trackId: "main",
          targetDescription: `Timeline at ${formatTime(playheadT)}`,
        },
      });
    }
    if (id === "gen-image" || id === "gen-bg")
      return setGenImage(id === "gen-bg" ? "background" : "picture");
    if (id === "gen-video") return setGenVideoOpen(true);
    if (id === "text-to-video") return setTextToVideoOpen(true);
    if (id === "avatar") return setAvatarOpen(true);
    if (id === "b-roll") return setBRollOpen(true);
    if (id === "smart-crop") return setSmartCropOpen(true);
    if (id === "translate") return setAudioTranslatorOpen(true);
    if (id === "extend") return setExtendVideoOpen(true);
    if (id === "remove-object") return setObjectRemoverOpen(true);
    if (id === "upscale" || id === "video-denoise") return setUpscaleOpen(true);
    if (id === "gen-effects" || id === "replace-sky")
      return setGenImage("background");
    if (id === "auto-subs") {
      setAiOpen(false);
      if (wide) setLeftPanel("subtitles");
      else setPhoneTab("subtitles");
      return;
    }
    if (id === "replace-bg") {
      setAiOpen(false);
      if (wide) setLeftPanel("background");
      else setPhoneTab("background");
      const cs = aiVideo ? clipStudioState(ds, aiVideo.id) : null;
      if (aiVideo && !(cs && removalOn(cs) && cs.method === "ai"))
        removePerson();
      return;
    }
    if (id === "smart-mix") {
      setAiOpen(false);
      setSmartMixOpen(true);
      return;
    }
    if (id === "silences") return aiSound && setSilenceFor(aiSound.id);
    if (id === "highlights") {
      setAiOpen(false);
      const targetClip =
        aiVideo ??
        (mainTrack(doc).clips.find((c) => c.type === "video") as
          | MainClip
          | undefined);
      if (targetClip && "mediaId" in targetClip) {
        setHighlightsFor(targetClip.mediaId);
      } else {
        setNotice(
          "Select a video clip with audio first to extract highlights.",
        );
      }
      return;
    }
    const group = `ai-tool:${id}:${++editSeq.current}`;
    if (id === "watermark") {
      if (!aiPicture) return;
      const pid = `w${++editSeq.current}`;
      setSelectedId(aiPicture.id);
      dispatchDoc(
        {
          type: "setClip",
          clipId: aiPicture.id,
          patch: { patches: [...(aiPicture.patches ?? []), newPatch(pid)] },
        },
        group,
      );
      setMode("program");
      setAiOpen(false);
      setPatchEdit({ clipId: aiPicture.id, patchId: pid });
      return;
    }
    if (id === "stabilize") {
      if (!aiVideo || hasAi(aiVideo)) return;
      setSelectedId(aiVideo.id);
      dispatchDoc(
        { type: "setClip", clipId: aiVideo.id, patch: { stabilize: true } },
        group,
      );
      setMode("program");
      setAiOpen(false);
      return;
    }
    if (id === "auto-color" || id === "enhance") {
      if (!aiPicture) return;
      const pic = aiPicture;
      setSelectedId(pic.id);
      setAiOpen(false);
      setWorking(id === "enhance" ? "Enhancing the colors…" : "Looking at the colors…");
      void fetch(`/api/videos/${pic.mediaId}/autocolor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pic.type === "video" ? { in: pic.in, out: pic.out } : {},
        ),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j?.color) return setNotice("Couldn't read this clip's colors.");
          const color = {
            ...(pic.color ?? {}),
            ...j.color,
            ...(id === "enhance" ? { sharpen: 0.5 } : {}),
          };
          dispatchDoc(
            { type: "setClip", clipId: pic.id, patch: { color } },
            group,
          );
          if (id === "enhance")
            setNotice(
              "Enhanced: colors fixed, and a light sharpening that shows in the exported video.",
            );
        })
        .catch(() => setNotice("Couldn't read this clip's colors."))
        .finally(() => setWorking(null));
      return;
    }
    if (id === "denoise") {
      if (!aiSound) return;
      setSelectedId(aiSound.id);
      dispatchDoc(
        { type: "setClip", clipId: aiSound.id, patch: { denoise: "light" } },
        group,
      );
      setAiOpen(false);
      return;
    }
    if (!aiVideo) return;
    setSelectedId(aiVideo.id);
    const act = (a: StudioAction) =>
      dispatchDoc({ type: "clip", clipId: aiVideo.id, action: a }, group);
    if (id === "green-screen") {
      act({ type: "setMethod", method: "color" });
      act({ type: "setRemoval", enabled: true });
    } else {
      act({ type: "setMethod", method: "ai" });
      act({ type: "setRemoval", enabled: true });
      act({
        type: "ai",
        patch:
          id === "blur-bg"
            ? { background: "blur", blur: 12 }
            : { background: "transparent" },
      });
      if (id === "blur-bg" && doc.canvas.background === "transparent") {
        dispatchDoc(
          { type: "setCanvas", patch: { background: "#000000" } },
          group,
        );
        setNotice(
          "Blur background makes the video solid, so the project got a black background and exports as MP4. Change it in Project.",
        );
      }
    }
    setMode("clip");
    setView("removed");
    setAiOpen(false);
  };
  // the ready features in the "Soon" panels do something when clicked
  const soonActions: Record<string, () => void> = {
    music: openPicker,
    "rec-voice": () => setRecordMode("voice"),
    tts: () => setTtsOpen(true),
    ...(aiSound
      ? {
          denoise: () => runAiTool("denoise"),
          silences: () => runAiTool("silences"),
        }
      : {}),
    ...(aiVideo
      ? {
          "green-screen": () => runAiTool("green-screen"),
          "ai-remove": () => runAiTool("ai-remove"),
          "blur-bg": () => runAiTool("blur-bg"),
        }
      : {}),
  };
  const aiPanel = (
    <AiToolsPanel
      onClose={() => setAiOpen(false)}
      target={aiTargetName}
      onTool={runAiTool}
      whyNot={aiWhyNot}
      onSettings={() => setAiSettingsOpen(true)}
    />
  );

  /** The timeline's Mask tool: a shape for a video / picture clip (the clip card has the fine settings). */
  const maskClip = (clipId: string, kind: MaskKind) => {
    setInspTab("basic");
    const f = findClip(doc, clipId);
    if (!f || (f.clip.type !== "video" && f.clip.type !== "image")) return;
    const c = f.clip as VideoClip | ImageClip;
    const m = ds.media[c.mediaId];
    const group = `mask:${clipId}:${++editSeq.current}`;
    const square = m ? cropForAspect(m.width, m.height, 1) : undefined;
    if (kind === "none") {
      // the bubble's square crop goes too (a crop the user made stays)
      const bubbleCrop =
        !!square && JSON.stringify(c.transform.crop) === JSON.stringify(square);
      return dispatchDoc(
        {
          type: "setClip",
          clipId,
          patch: {
            mask: undefined,
            ...(bubbleCrop
              ? { transform: { ...c.transform, crop: undefined } }
              : {}),
          },
        },
        group,
      );
    }
    if (kind === "bubble")
      return dispatchDoc(
        {
          type: "setClip",
          clipId,
          patch: {
            mask: BUBBLE_MASK,
            transform: { ...c.transform, crop: square ?? c.transform.crop },
          },
        },
        group,
      );
    dispatchDoc(
      {
        type: "setClip",
        clipId,
        patch: {
          mask:
            kind === "circle"
              ? { shape: "circle", radius: 0, feather: 1 }
              : { shape: "rounded", radius: 0.12, feather: 1 },
        },
      },
      group,
    );
  };

  // ---------- Brand Kit, looks, templates ----------
  const brand = useBrand();
  /** Show / hide your logo on this project (it needs the picture's size for the preview). */
  const setWatermark = (w: Watermark | undefined, group?: string) => {
    const m = w
      ? (assets.items ?? []).find((a) => a.id === w.mediaId)
      : undefined;
    if (w && !m)
      return setNotice(
        "Your logo isn't in My Assets any more. Upload it again in the Brand Kit.",
      );
    if (!w) {
      setLogoSel(false);
      // switched off: the Brand Kit remembers how it looked, for the next time it's switched on
      if (doc.watermark) {
        const { mediaId: _m, ...look } = doc.watermark;
        void _m;
        void brand.save({ logoLook: look });
      }
    }
    dispatchDoc(
      {
        type: "setWatermark",
        watermark: w,
        media: m ? mediaLiteOf(m) : undefined,
      },
      group ?? (w && doc.watermark ? `watermark:${w.corner}` : undefined),
    );
  };
  /** The Elements panel's logo tile: your Brand Kit logo in its corner, like the Brand Kit switch. */
  const logoTileState: LogoState = doc.watermark
    ? "on"
    : brand.brand?.logo
      ? "off"
      : "none";
  const logoTile = () => {
    const b = brand.brand;
    if (!doc.watermark) {
      if (!b?.logo) {
        showPanel("brand");
        return setNotice(
          "Add your logo in the Brand Kit first. Then it can sit in a corner of the whole video.",
        );
      }
      setWatermark({
        ...DEFAULT_LOGO_LOOK,
        ...(b.logoLook ?? {}),
        mediaId: b.logo,
      });
    }
    setSelectedId(null);
    setSelTransition(null);
    setLogoSel(true);
    setMode("program");
  };
  const lookClip =
    selected &&
    (selected.clip.type === "video" || selected.clip.type === "image")
      ? (selected.clip as VideoClip | ImageClip)
      : null;
  /** Use one look (and its vignette) on every video and picture clip; each keeps its own brightness, contrast… */
  const lookAll = (c: ColorAdjust | undefined) => {
    const group = `look-all:${++editSeq.current}`;
    for (const t of doc.tracks)
      for (const x of t.clips as AnyClip[]) {
        if (x.type !== "video" && x.type !== "image") continue;
        const n: ColorAdjust = {
          ...(x.color ?? NEUTRAL),
          look: c?.look,
          vignette: c?.vignette,
        };
        const neutral =
          n.brightness === 0 &&
          n.contrast === 1 &&
          n.saturation === 1 &&
          n.temperature === 0 &&
          !n.look &&
          !n.vignette &&
          !n.sharpen;
        dispatchDoc(
          {
            type: "setClip",
            clipId: x.id,
            patch: { color: neutral ? undefined : n },
          },
          group,
        );
      }
  };
  /** A new project from this timeline, opened (templates, Duplicate). */
  const createAndOpen = async (d: TimelineDoc, name: string) => {
    showStageBusy("Making the project…");
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: d, name }),
      });
      const j = (await r.json()) as {
        id?: string;
        error?: { message?: string };
      };
      if (!r.ok || !j.id)
        throw new Error(j.error?.message ?? "Couldn't make the project.");
      refreshLists();
      await openProject(j.id);
    } catch (e) {
      showStageBusy(null);
      setNotice((e as Error).message);
    }
  };
  /**
   * "♪ Add beat markers": the beats of a clip's sound as amber markers on the timeline
   * (cuts and clips then snap to the music). Earlier beat markers are replaced, as one undo step.
   */
  const addBeatMarkers = async (clip: AnyClip, every: 1 | 2 | 4): Promise<string> => {
    if ((clip.type !== "video" && clip.type !== "audio") || (clip.type === "video" && clip.reversed))
      return "Beat markers work on a clip with sound that plays forwards.";
    const found = findClip(doc, clip.id);
    if (!found) return "Select the clip again.";
    const start =
      found.track.kind === "main"
        ? mainStarts(mainTrack(doc).clips)[found.index]
        : (clip as AnyClip & { start: number }).start;
    const res = await fetch(`/api/videos/${clip.mediaId}/beats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ in: clip.in, out: clip.out }),
    });
    const j = (await res.json()) as { bpm?: number; beats?: number[]; error?: { message?: string } };
    if (!res.ok) throw new Error(j.error?.message ?? "Couldn't find the beat.");
    const sp = clip.type === "video" ? (clip.speed ?? 1) : 1;
    const times = everyNth(j.beats ?? [], every)
      .map((b) => start + (b - clip.in) / sp)
      .filter((t) => t >= start - 1e-6)
      .slice(0, 300);
    if (!times.length) return "No steady beat was found in this sound.";
    const group = `beats:${++editSeq.current}`;
    for (const m of doc.markers ?? [])
      if (m.label.startsWith("♪")) dispatchDoc({ type: "deleteMarker", markerId: m.id }, group);
    times.forEach((t, i) =>
      dispatchDoc({ type: "addMarker", t, label: `♪ ${i + 1}`, color: "amber" }, group),
    );
    return `${times.length} beat markers added (${Math.round(j.bpm ?? 0)} BPM). Clips snap to them while you drag.`;
  };
  /** Start a new project from a template (the open one stays saved in Projects). */
  const applyTemplate = async (t: Template) => {
    if (
      hasClips &&
      !window.confirm(
        `Start a new project from "${t.name}"? This project stays saved in Projects.`,
      )
    )
      return;
    await createAndOpen(t.build(), t.name);
  };
  /** Start a new project from a broadcast template with optional customizations. */
  const applyBroadcastTemplate = async (
    t: BroadcastTemplate,
    custom?: Record<string, any>,
  ) => {
    if (
      hasClips &&
      !window.confirm(
        `Start a new project from "${t.name}"? This project stays saved in Projects.`,
      )
    )
      return;
    // your own template used straight from its card: its video and sound
    if (t.custom && !custom)
      custom = {
        bgType: "video",
        selectedVideoClip: { assetId: t.custom.video.assetId },
        ...(t.custom.audio
          ? { selectedAudioTrack: { assetId: t.custom.audio.assetId } }
          : {}),
      };

    showStageBusy(`Getting “${t.name}” ready…`, 60_000);
    let audioMeta: VideoMeta | null = null;
    let videoClipMeta: VideoMeta | null = null;

    // 1. Resolve Audio Theme (from metadata, asset ID, or library)
    if (custom?.selectedAudioTrack) {
      if (custom.selectedAudioTrack.audioMeta) {
        audioMeta = custom.selectedAudioTrack.audioMeta as VideoMeta;
      } else if (custom.selectedAudioTrack.assetId) {
        try {
          const res = await fetch(
            `/api/videos/${custom.selectedAudioTrack.assetId}`,
          );
          if (res.ok) audioMeta = (await res.json()) as VideoMeta;
        } catch {}
      } else if (custom.selectedAudioTrack.id) {
        try {
          const rawId = custom.selectedAudioTrack.id;
          const audioId = rawId.startsWith("broadcast-")
            ? rawId
            : `broadcast-${rawId}`;
          const res = await fetch(`/api/library/${audioId}/add?hidden=1`, {
            method: "POST",
          });
          if (res.ok) {
            const j = await res.json();
            audioMeta = (j.video ?? j) as VideoMeta;
          }
        } catch (err) {
          console.error("Failed to add broadcast audio", err);
        }
      }
    }

    // 2. Resolve Background Video Clip (Stock or Custom Uploaded)
    if (custom?.bgType === "video" && custom?.selectedVideoClip) {
      if (custom.selectedVideoClip.videoMeta) {
        videoClipMeta = custom.selectedVideoClip.videoMeta as VideoMeta;
      } else if (custom.selectedVideoClip.assetId) {
        try {
          const res = await fetch(
            `/api/videos/${custom.selectedVideoClip.assetId}`,
          );
          if (res.ok) videoClipMeta = (await res.json()) as VideoMeta;
        } catch {}
      } else if (custom.selectedVideoClip.id) {
        try {
          const res = await fetch("/api/templates/import-clip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clipId: custom.selectedVideoClip.id,
              url: custom.selectedVideoClip.url,
            }),
          });
          if (res.ok) {
            videoClipMeta = (await res.json()) as VideoMeta;
          }
        } catch (err) {
          console.error("Failed to import template video clip", err);
        }
      }
    }

    let built = t.build(custom);

    if (videoClipMeta) {
      const m = mediaLiteOf(videoClipMeta);
      built = addMedia(built, m, { index: 0 }).doc;
    }
    if (audioMeta) {
      const m = mediaLiteOf(audioMeta);
      built = addMedia(built, m, { at: 0 }).doc;
    }

    if (videoClipMeta || audioMeta) {
      setMetas((prev) => ({
        ...prev,
        ...(videoClipMeta ? { [videoClipMeta.id]: videoClipMeta } : {}),
        ...(audioMeta ? { [audioMeta.id]: audioMeta } : {}),
      }));
    }

    await createAndOpen(built, t.name);
    setNotice(`🎬 Loaded "${t.name}" with ready-to-edit broadcast layers!`);
  };

  // a template picked on the website (/editor?template=<id>) starts a project once, on an empty editor
  const templateLinkUsed = useRef(false);
  useEffect(() => {
    const id = props.initialTemplateId;
    if (!id || templateLinkUsed.current || initialProject) return;
    templateLinkUsed.current = true;
    const broadcast = BROADCAST_TEMPLATES_BY_ID.get(id);
    const starter = broadcast ? null : TEMPLATES.find((t) => t.id === id);
    if (broadcast) void applyBroadcastTemplate(broadcast);
    else if (starter) void applyTemplate(starter);
    else setNotice("That template isn't available any more. Pick one from Templates.");
    // runs once for the link that opened the editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Project menu → Duplicate: a copy of this project (saved first), opened. */
  const duplicateProject = async () => {
    if (!sync.project) return;
    await sync.flush();
    const name = `${sync.project.name.slice(0, 75)} copy`;
    // the copy is kept on this computer like the project (the server would leave out files it doesn't have)
    const ws = localWorkspaceManager.getActiveWorkspace();
    if (ws) {
      showStageBusy("Making the copy…");
      try {
        const id = newUuid();
        await ws.saveProject(newProject({ id, name, doc, now: Date.now(), jobId: null }));
        refreshLists();
        await openProject(id);
      } catch (e) {
        showStageBusy(null);
        setNotice((e as Error).message || "Couldn't copy the project.");
      }
      return;
    }
    await createAndOpen(doc, name);
  };
  /**
   * Put a saved version back on the timeline: what's there now is saved as a
   * version first, and it's one undo step (⌘Z brings it back).
   */
  const restoreVersion = async (v: VersionSummary) => {
    const pid = sync.project?.id;
    if (!pid) return;
    await sync.flush();
    const base = `/api/projects/${pid}/versions`;
    const backup = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Before restoring “${v.name.slice(0, 50)}”`,
        auto: true,
      }),
    });
    if (!backup.ok) throw await toApiError(backup);
    const r = await fetch(`${base}/${v.id}`, { cache: "no-store" });
    if (!r.ok) throw await toApiError(r);
    const got = (await r.json()) as { doc: TimelineDoc; media: VideoMeta[] };
    if (!got.doc.tracks.some((t) => t.clips.length > 0))
      throw new Error(
        "This version's videos were deleted, so there's nothing to put back.",
      );
    setMetas((m) => ({
      ...m,
      ...Object.fromEntries(got.media.map((x) => [x.id, x])),
    }));
    dispatchDoc({
      type: "replaceDoc",
      doc: interruptOrphanedGenerations(got.doc),
      media: Object.fromEntries(got.media.map((x) => [x.id, mediaLiteOf(x)])),
    });
    setSelectedId(null);
    setSelTransition(null);
    setLogoSel(false);
    setCropFor(null);
    setMode("program");
    if (clock.get() > docDuration(got.doc)) seekTimeline(0);
    setNotice(
      `Restored “${v.name}”. ${isMac() ? "⌘" : "Ctrl"} Z brings back what you had.`,
    );
  };

  // ---------- areas ----------
  const topBar = (
    <TopBar
      video={video}
      job={job}
      project={sync.project}
      saveState={sync.saveState}
      saveError={sync.error}
      onRename={sync.rename}
      onRetrySave={sync.retry}
      proxyMode={proxyMode}
      onToggleProxy={toggleProxyMode}
      canUndo={hist.past.length > 0}
      canRedo={hist.future.length > 0}
      onUndo={() => dispatchHistory({ type: "undo" })}
      onRedo={() => dispatchHistory({ type: "redo" })}
      onChangeVideo={() => setImportTab("computer")}
      onHome={startOver}
      onExport={() => setExportOpen(true)}
      onShare={() => setShareOpen(true)}
      onQuickExport={quickExport}
      onVideoExport={videoExport}
      onThumbnail={() => {
        // the frame Video 1 shows at the playhead is the starting picture
        const f = mainFrameAt(doc, clock.get());
        setThumbFrame(f ? `/api/videos/${f.mediaId}/frame?t=${f.src.toFixed(3)}` : null);
        setThumbOpen(true);
      }}
      videoDisabled={videoDisabled}
      quickDisabled={exportBlocked("pack") ?? busy}
      onHelp={() => setHelpOpen(true)}
      uploading={uploadBusy}
      clipCount={clipCount(doc)}
      facts={
        hasClips
          ? {
              canvas: doc.canvas,
              duration: docDuration(doc),
              clips: clipCount(doc),
              tracks: doc.tracks.filter((t) => t.clips.length > 0).length,
              onSize: (size) =>
                dispatchDoc(
                  { type: "setCanvas", patch: size },
                  `ratio:${++editSeq.current}`,
                ),
              onFps: (fps) =>
                dispatchDoc(
                  { type: "setCanvas", patch: { fps } },
                  "canvas:fps",
                ),
            }
          : null
      }
      projectMenu={{
        projects: projects.items ?? [],
        onOpen: (id) => void openProject(id),
        onNew: () => startOver(),
        onNewBlank: () => startOver({ withBlank: true }),
        onDuplicate: () => void duplicateProject(),
        onVersions: () => setVersionsOpen(true),
        onChooseFolder: () => void handleChooseFolder(),
        deviceFolderName: deviceFolder,
        onExportVDO: (portable) => void handleExportVDO(portable),
        onAll: () => showPanel("projects"),
        onRefresh: () => void projects.refresh(),
      }}
      nameRef={nameRef}
      onSearch={(withVoice) => {
        setStartWithVoice(!!withVoice);
        setSearchOpen(true);
      }}
      onTemplates={() =>
        setWorkspaceView((v) => (v === "templates" ? "studio" : "templates"))
      }
      isTemplatesActive={workspaceView === "templates"}
      versions={{
        projectId: sync.project?.id ?? null,
        flush: sync.flush,
        onRestore: restoreVersion,
      }}
      onOpenStorage={() => setStorageModalOpen(true)}
      focus={wide ? focus : null}
      onFocus={() => setFocus((f) => !f)}
    />
  );

  /** The Edit panel: the tools for the selected clip (or the Video 1 clip under the playhead). */
  const editPanel = (): {
    target: { name: string; kind: string } | null;
    actions: EditAction[];
    tabs: EditTab[];
  } => {
    const t = clock.get();
    const tools = getEditingTools(
      doc,
      selectedId,
      t,
      ds.media,
      doc.canvas?.fps ?? 30,
    );
    const sel = tools.selected;
    const c = sel?.clip;
    const target = tools.target;
    const pick = (tab?: InspectorTab) => {
      if (c) setSelectedId(c.id);
      if (tab) setInspTab(tab);
    };
    const isPic = !!c && (c.type === "video" || c.type === "image");
    const actions: EditAction[] = [
      {
        id: "split",
        label: "Split",
        icon: "split",
        keys: "S",
        hint: tools.canSplit
          ? "Split at the playhead (S)"
          : "Move playhead over a clip to split",
        onClick: tools.canSplit
          ? () => dispatchDoc({ type: "split", clipId: target!.clip.id, t })
          : null,
      },
      {
        id: "trim-in",
        label: "Trim start",
        icon: "trim",
        keys: "Q",
        hint: tools.canTrimStart
          ? "Trim start to playhead (Q)"
          : "Move playhead over a clip to trim",
        onClick: tools.canTrimStart
          ? () =>
              dispatchDoc(
                { type: "trim", clipId: target!.clip.id, edge: "in", to: t },
                `trim:in:${++editSeq.current}`,
              )
          : null,
      },
      {
        id: "trim-out",
        label: "Trim end",
        icon: "trim",
        keys: "W",
        hint: tools.canTrimEnd
          ? "Trim end to playhead (W)"
          : "Move playhead over a clip to trim",
        onClick: tools.canTrimEnd
          ? () =>
              dispatchDoc(
                { type: "trim", clipId: target!.clip.id, edge: "out", to: t },
                `trim:out:${++editSeq.current}`,
              )
          : null,
      },
      {
        id: "delete",
        label: "Delete",
        icon: "trash",
        keys: "Del",
        hint: tools.canDelete
          ? "Delete the selected clip (Del)"
          : "Select a clip to delete",
        onClick: tools.canDelete ? () => deleteSelected() : null,
      },
      {
        id: "duplicate",
        label: "Duplicate",
        icon: "plus",
        keys: "⌘D",
        hint: tools.canDuplicate
          ? "Copy the selected clip (⌘D)"
          : "Select a clip to duplicate",
        onClick: tools.canDuplicate
          ? () => dispatchDoc({ type: "duplicate", clipId: c!.id })
          : null,
      },
      {
        id: "crop",
        label: "Crop",
        icon: "crop",
        hint: tools.canCrop
          ? "Crop the picture on the preview"
          : "Select a video or picture first",
        onClick: tools.canCrop ? () => startCrop(c!.id) : null,
      },
      {
        id: "speed",
        label: "Speed",
        icon: "speed",
        hint: tools.canSpeed
          ? "Faster or slower (the Speed settings)"
          : "Select a video clip first",
        onClick: tools.canSpeed ? () => pick("speed") : null,
      },
      {
        id: "reverse",
        label: "Reverse",
        icon: "reverse",
        hint: tools.canReverse
          ? "Play the clip backwards"
          : "Select a video clip first",
        onClick: tools.canReverse
          ? () => {
              dispatchDoc(
                {
                  type: "setClip",
                  clipId: c!.id,
                  patch: {
                    reversed: (c as VideoClip).reversed ? undefined : true,
                  },
                },
                `clip:${++editSeq.current}`,
              );
              pick("speed");
            }
          : null,
      },
      {
        id: "freeze",
        label: "Freeze",
        icon: "freeze",
        hint: tools.canFreeze
          ? "Hold the frame at the playhead for 2 seconds"
          : "Move playhead over a Video 1 clip to freeze",
        onClick: tools.canFreeze
          ? () => void freezeAt(target!.clip.id, t)
          : null,
      },
      {
        id: "mask",
        label: "Shape",
        icon: "mask",
        hint: tools.canMask
          ? "Rounded corners, a circle or a camera bubble (the Basic settings)"
          : "Select a video or picture first",
        onClick: tools.canMask ? () => pick("basic") : null,
      },
      {
        id: "silences",
        label: "Silences",
        icon: "waveform",
        hint: tools.canSilences
          ? "Find and cut the pauses in the speech"
          : tools.selected
            ? "This clip has no sound"
            : "Select a clip with speech first",
        onClick: tools.canSilences ? () => setSilenceFor(c!.id) : null,
      },
      {
        id: "detach-audio",
        label: tools.canAttachAudio ? "Attach Audio" : "Detach Audio",
        icon: tools.canAttachAudio ? "attachAudio" : "detachAudio",
        hint: tools.canAttachAudio
          ? "Re-attach audio back into video"
          : tools.canDetachAudio
            ? "Detach audio track from video"
            : "Select a video or detached audio clip first",
        onClick:
          tools.canAttachAudio || tools.canDetachAudio
            ? () =>
                dispatchDoc({
                  type: "toggleAudioDetach",
                  clipId: c!.id,
                  media: ds.media,
                })
            : null,
      },
      {
        id: "keyframe",
        label: "Keyframe",
        icon: "keyframe",
        hint: !tools.selected
          ? "Select a clip first, then add keyframes to move, zoom, turn or fade it"
          : !tools.canKeyframe
            ? "Move the playhead onto the selected clip"
            : tools.keyframeHere
              ? "Remove the keyframe at the playhead"
              : "Add a keyframe at the playhead (place, size, angle, opacity)",
        onClick: tools.canKeyframe
          ? () =>
              dispatchDoc(
                { type: "keyframe", clipId: c!.id, t, op: { kind: "toggle" } },
                `key:toggle:${c!.id}:${++editSeq.current}`,
              )
          : null,
      },
      {
        id: "marker",
        label: "Add Marker",
        icon: "marker",
        keys: "M",
        hint: "Add timeline marker at playhead (M)",
        onClick: () => dispatchDoc({ type: "addMarker", t }),
      },
    ];
    const tabs: EditTab[] = !c
      ? []
      : isPic
        ? tabsFor(c.type as "video" | "image").map((t) => ({
            id: t,
            label: `${TAB_INFO[t].label} · ${TAB_INFO[t].hint}`,
            icon: TAB_INFO[t].icon,
            onClick: () => pick(t),
          }))
        : [
            {
              id: "settings",
              label:
                c.type === "text"
                  ? "Text settings · words, style, place"
                  : c.type === "element"
                    ? "Element settings · colors, words, place"
                    : c.type === "blank"
                      ? "Blank settings · color, length"
                      : "Sound settings · volume, fades, noise",
              icon:
                c.type === "text"
                  ? "text"
                  : c.type === "element"
                    ? "elements"
                    : c.type === "blank"
                      ? "plus"
                      : "audio",
              onClick: () => pick(),
            },
          ];
    return { target: tools.targetInfo, actions, tabs };
  };

  /** Search tools (⌘K): every tool, panel, project and action, for the palette. */
  const commands = (): Command[] => {
    const mod = isMac() ? "⌘" : "Ctrl";
    const trackDisplayName = (t: Track) => {
      if (t.name) return t.name;
      if (t.kind === "main") return "Main track";
      if (t.kind === "overlay") {
        const overlays = doc.tracks.filter((x) => x.kind === "overlay");
        const idx = overlays.findIndex((x) => x.id === t.id);
        return idx >= 0 ? `Overlay ${overlays.length - idx}` : "Video track";
      }
      const audios = doc.tracks.filter((x) => x.kind === "audio");
      const idx = audios.findIndex((x) => x.id === t.id);
      return idx >= 0 ? `Audio ${idx + 1}` : "Audio track";
    };
    const edit = editPanel();
    const noClip = edit.target
      ? ""
      : "Select a clip first (or put the playhead on one).";
    const pl = () => (mode === "clip" ? clipRef.current : programRef.current);
    const list: Command[] = [
      ...edit.actions.map((a) => ({
        id: `tool:${a.id}`,
        label:
          a.label === "Shape" ? "Shape (rounded corners, circle)" : a.label,
        group: "Tools",
        icon: a.icon,
        keys: a.keys,
        hint: a.onClick
          ? a.hint
          : noClip || `Can't use this on the selected clip. ${a.hint}.`,
        keywords: a.hint.split(" "),
        run: a.onClick,
      })),
      {
        id: "audio:smart-mix",
        label: "Smart Audio Mix (Dialogue Ducking)",
        group: "Audio",
        icon: "volume",
        keywords: ["ducking", "dialogue", "voiceover", "speech", "smart mix", "audio balance", "volume automation"],
        hint: "Automatic dialogue ducking between Video & Voiceover",
        run: () => setSmartMixOpen(true),
      },
      ...RAIL_ITEMS.filter((r) => r.id).map((r) => ({
        id: `panel:${r.id}`,
        label: `${r.label} panel`,
        group: "Panels",
        icon: r.icon,
        hint: `Open ${r.label} on the left`,
        run: () => showPanel(r.id as SidePanel | "ai"),
      })),
      {
        id: "add:media",
        label: "Add media (videos, pictures, sound)",
        group: "Add",
        icon: "plus",
        keywords: ["upload", "import", "file"],
        run: () => setImportTab("computer"),
      },
      {
        id: "add:stock",
        label: "Import stock video (Pixabay)",
        group: "Add",
        icon: "download",
        keywords: ["free", "web", "stock"],
        run: () => setImportTab("pixabay"),
      },
      {
        id: "add:camera",
        label: "Record camera",
        group: "Add",
        icon: "camera",
        keywords: ["webcam"],
        run: () => setRecordMode("camera"),
      },
      {
        id: "add:screen",
        label: "Record screen",
        group: "Add",
        icon: "screen",
        run: () => setRecordMode("screen"),
      },
      {
        id: "add:screencam",
        label: "Record screen + camera",
        group: "Add",
        icon: "record",
        run: () => setRecordMode("screenCamera"),
      },
      {
        id: "add:voice",
        label: "Record voice",
        group: "Add",
        icon: "mic",
        keywords: ["microphone", "narration"],
        run: () => setRecordMode("voice"),
      },
      {
        id: "add:blank",
        label: "Add a blank scene after this clip",
        group: "Add",
        icon: "plus",
        keywords: ["scene", "title card", "empty", "slide", "pause"],
        hint: "On Video 1, after the clip at the playhead",
        run: () => {
          const m = mainClipAt(doc, clock.get());
          addBlankAt(m ? m.index + 1 : mainTrack(doc).clips.length);
        },
      },
      {
        id: "add:blank-start",
        label: "Add a blank scene at the start",
        group: "Add",
        icon: "plus",
        keywords: ["scene", "intro", "title card"],
        run: () => addBlankAt(0),
      },
      {
        id: "add:blank-end",
        label: "Add a blank scene at the end",
        group: "Add",
        icon: "plus",
        keywords: ["scene", "outro", "end screen"],
        run: () => addBlankAt(mainTrack(doc).clips.length),
      },
      ...TEXT_STYLES.map((t) => ({
        id: `text:${t.id}`,
        label: `Add text: ${t.label}`,
        group: "Text",
        icon: "text" as const,
        hint: t.hint,
        keywords: ["title", "caption"],
        run: () => addTextAt(t.id),
      })),
      ...ELEMENTS.map((x) => ({
        id: `element:${x.id}`,
        label: `Add element: ${x.label}`,
        group: "Elements",
        icon: "elements" as const,
        keywords: [...(x.keywords ?? []), "shape", "sticker"],
        run: () => addElementAt(x.id),
      })),
      {
        id: "element:emoji",
        label: "Add emoji…",
        group: "Elements",
        icon: "elements",
        keywords: ["emoji", "smiley", "sticker"],
        hint: "Opens Elements with its search box",
        run: () => {
          showPanel("elements");
          requestAnimationFrame(() => elementsSearch.current?.focus());
        },
      },
      {
        id: "ai:image",
        label: "Generate a picture (Gemini)",
        group: "AI",
        icon: "image",
        keywords: ["ai", "image"],
        hint: "Opens the window; nothing is made until you press Generate",
        run: () => setGenImage("picture"),
      },
      {
        id: "ai:video",
        label: "Make a video with Veo (Gemini)",
        group: "AI",
        icon: "film",
        keywords: ["ai", "generate"],
        hint: "Opens the window; nothing is made until you press Generate",
        run: () => setGenVideoOpen(true),
      },
      {
        id: "ai:tts",
        label: "Voice from text",
        group: "AI",
        icon: "voice",
        keywords: ["ai", "speech", "tts"],
        run: () => setTtsOpen(true),
      },
      {
        id: "ai:keys",
        label: "API keys (Gemini, Pexels…)",
        group: "AI",
        icon: "settings",
        keywords: ["settings", "key"],
        run: () => setAiSettingsOpen(true),
      },
      {
        id: "project:rename",
        label: "Rename project",
        group: "Project",
        icon: "pencil",
        run: sync.project
          ? () => requestAnimationFrame(() => nameRef.current?.focus())
          : null,
        hint: sync.project ? undefined : "Add a clip first.",
      },
      {
        id: "project:duplicate",
        label: "Duplicate project",
        group: "Project",
        icon: "plus",
        keywords: ["copy"],
        run: sync.project ? () => void duplicateProject() : null,
        hint: sync.project ? "Make a copy and open it" : "Add a clip first.",
      },
      {
        id: "project:version",
        label: "Save a version…",
        group: "Project",
        icon: "history",
        keywords: ["snapshot", "history", "restore"],
        run: sync.project ? () => setVersionsOpen(true) : null,
        hint: sync.project
          ? "A copy of the project to come back to"
          : "Add a clip first.",
      },
      {
        id: "project:new",
        label: "New project",
        group: "Project",
        icon: "projects",
        run: () => startOver(),
      },
      {
        id: "project:new-blank",
        label: "New project with a blank",
        group: "Project",
        icon: "projects",
        keywords: ["scene", "empty", "title card"],
        hint: "Starts with a 3-second blank scene",
        run: () => startOver({ withBlank: true }),
      },
      ...(projects.items ?? [])
        .filter((x) => x.id !== sync.project?.id)
        .slice(0, 20)
        .map((x) => ({
          id: `open:${x.id}`,
          label: `Open project: ${x.name}`,
          group: "Project",
          icon: "folderOpen" as const,
          run: () => void openProject(x.id),
        })),
      {
        id: "view:focus",
        label: focus
          ? "Leave focus mode (show the panels)"
          : "Focus mode (hide the side panels)",
        group: "View",
        icon: "focus",
        keys: "F",
        run: wide ? () => setFocus((f) => !f) : null,
        hint: wide ? undefined : "On a wider screen.",
      },
      ...THEMES.map((t) => ({
        id: `view:theme:${t.id}`,
        label: `Theme: ${t.label}`,
        group: "View",
        icon: t.icon,
        keywords: ["dark", "light", "mode", "appearance"],
        run: () => setTheme(t.id),
      })),
      {
        id: "view:play",
        label: "Play / pause",
        group: "View",
        icon: "play",
        keys: "Space",
        run: hasClips ? () => pl()?.toggle() : null,
        hint: hasClips ? undefined : "Add a clip first.",
      },
      {
        id: "view:start",
        label: "Go to the start",
        group: "View",
        icon: "prevFrame",
        keys: "Home",
        run: hasClips ? () => seekTimeline(0) : null,
      },
      {
        id: "view:end",
        label: "Go to the end",
        group: "View",
        icon: "nextFrame",
        keys: "End",
        run: hasClips ? () => seekTimeline(docDuration(doc)) : null,
      },
      {
        id: "view:help",
        label: "Help & keyboard shortcuts",
        group: "View",
        icon: "help",
        keys: "?",
        run: () => setHelpOpen(true),
      },
      {
        id: "export:open",
        label: "Export & Share…",
        group: "Export",
        icon: "export",
        keywords: ["download", "render", "save", "mp4"],
        run: () => setExportOpen(true),
      },
      {
        id: "export:mp4",
        label: "Export MP4 at the project size",
        group: "Export",
        icon: "download",
        keywords: ["render", "quick"],
        run: videoDisabled ? null : () => videoExport("project"),
        hint: videoDisabled ?? undefined,
      },
      {
        id: "history:undo",
        label: "Undo",
        group: "Edit",
        icon: "undo",
        keys: `${mod} Z`,
        run: hist.past.length ? () => dispatchHistory({ type: "undo" }) : null,
        hint: hist.past.length ? undefined : "Nothing to undo.",
      },
      {
        id: "history:redo",
        label: "Redo",
        group: "Edit",
        icon: "redo",
        keys: `${mod} Shift Z`,
        run: hist.future.length
          ? () => dispatchHistory({ type: "redo" })
          : null,
        hint: hist.future.length ? undefined : "Nothing to redo.",
      },
      {
        id: "track:motion",
        label: "Motion tracking (attach to moving objects)",
        group: "Tracks",
        icon: "motionTrack" as const,
        keywords: [
          "track",
          "tracking",
          "motion tracking",
          "point tracking",
          "object tracking",
          "attach",
          "follow",
          "pin",
          "stabilize",
        ],
        hint: "Track an object in the video and attach text, stickers, or layers to it",
        run: () => {
          if (selected?.clip.type === "video") {
            setInspTab("tracking");
          } else {
            const main = mainTrack(doc);
            const firstVid = main.clips.find((c) => c.type === "video");
            if (firstVid) {
              setSelectedId(firstVid.id);
              setInspTab("tracking");
            } else {
              setNotice("Select or add a video clip first to use motion tracking.");
            }
          }
        },
      },
      {
        id: "track:add-overlay",
        label: "Add video track",
        group: "Tracks",
        icon: "plus",
        keywords: ["track", "video track", "overlay track", "add track", "layer", "b-roll"],
        hint: "Adds an overlay video track above the timeline",
        run: () => dispatchDoc({ type: "addTrack", kind: "overlay" }),
      },
      {
        id: "track:add-audio",
        label: "Add audio track",
        group: "Tracks",
        icon: "audio",
        keywords: ["track", "audio track", "music track", "sound track", "voice track", "add track"],
        hint: "Adds an extra audio track below the timeline",
        run: () => dispatchDoc({ type: "addTrack", kind: "audio" }),
      },
      {
        id: "track:close-gaps",
        label: "Close all gaps on tracks",
        group: "Tracks",
        icon: "trim",
        keywords: ["track", "gap", "close gaps", "delete gap", "ripple delete", "compact timeline"],
        hint: "Closes blank gaps between clips across all tracks",
        run: () => dispatchDoc({ type: "closeAllGaps" }),
      },
      {
        id: "track:add-subtitles",
        label: "Add subtitles track (Captions)",
        group: "Tracks",
        icon: "subtitles",
        keywords: ["track", "subtitles", "captions", "caption track", "subtitle track", "cc"],
        hint: "Generate or edit auto-captions and subtitles",
        run: () => showPanel("subtitles"),
      },
      ...doc.tracks
        .filter((t) => t.kind !== "main" && t.clips.length === 0)
        .map((t) => {
          const name = trackDisplayName(t);
          return {
            id: `track:remove:${t.id}`,
            label: `Delete empty track (${name})`,
            group: "Tracks",
            icon: "undo" as const,
            keywords: ["track", "delete track", "remove track", name.toLowerCase()],
            hint: `Removes empty ${name}`,
            run: () => dispatchDoc({ type: "removeTrack", trackId: t.id }),
          };
        }),
      ...doc.tracks
        .filter((t) => t.kind === "audio")
        .map((t) => {
          const name = trackDisplayName(t);
          return {
            id: `track:mute:${t.id}`,
            label: `${t.muted ? "Unmute" : "Mute"} track (${name})`,
            group: "Tracks",
            icon: (t.muted ? "volume" : "mute") as const,
            keywords: ["track", "mute track", "unmute track", "audio track", "sound", name.toLowerCase()],
            hint: `${t.muted ? "Enable" : "Silence"} audio on ${name}`,
            run: () =>
              dispatchDoc({
                type: "setTrack",
                trackId: t.id,
                patch: { muted: !t.muted },
              }),
          };
        }),
      ...doc.tracks.map((t) => {
        const name = trackDisplayName(t);
        return {
          id: `track:lock:${t.id}`,
          label: `${t.locked ? "Unlock" : "Lock"} track (${name})`,
          group: "Tracks",
          icon: "settings" as const,
          keywords: ["track", "lock track", "unlock track", name.toLowerCase()],
          hint: `${t.locked ? "Unlock editing" : "Prevent changes"} on ${name}`,
          run: () =>
            dispatchDoc({
              type: "setTrack",
              trackId: t.id,
              patch: { locked: !t.locked },
            }),
        };
      }),
      {
        id: "ai:transcript",
        label: "Transcript editor (edit video by editing text)",
        group: "AI",
        icon: "text",
        keywords: [
          "transcript",
          "text based editing",
          "speech to text",
          "words",
          "cut silence",
          "auto cut",
          "subtitles",
        ],
        hint: "Browse and cut video scenes directly from speech transcripts",
        run: () => setTranscriptEditOpen(true),
      },
      {
        id: "ai:smart-crop",
        label: "Smart crop & auto-reframe (16:9 to 9:16)",
        group: "AI",
        icon: "crop",
        keywords: [
          "smart crop",
          "auto reframe",
          "vertical",
          "tiktok",
          "shorts",
          "reels",
          "resize",
          "crop",
          "aspect ratio",
        ],
        hint: "Auto-tracks and keeps faces and action centered for vertical formats",
        run: () => setSmartCropOpen(true),
      },
      {
        id: "ai:b-roll",
        label: "AI smart B-roll (suggest cutaways)",
        group: "AI",
        icon: "film",
        keywords: [
          "b-roll",
          "broll",
          "smart broll",
          "cutaway",
          "stock footage",
          "overlay video",
        ],
        hint: "Discovers spoken context and automatically finds relevant B-roll footage",
        run: () => setBRollOpen(true),
      },
      {
        id: "ai:translate",
        label: "AI audio translator & dubbing",
        group: "AI",
        icon: "audio",
        keywords: [
          "translate audio",
          "dubbing",
          "voice translate",
          "multilingual",
          "speech translation",
          "languages",
        ],
        hint: "Translate audio and speech into multiple languages with voice dubbing",
        run: () => setAudioTranslatorOpen(true),
      },
      {
        id: "ai:avatar",
        label: "AI talking avatar presenter",
        group: "AI",
        icon: "person",
        keywords: [
          "avatar",
          "talking head",
          "presenter",
          "ai person",
          "virtual host",
          "spokesperson",
        ],
        hint: "Create an AI presenter that speaks your script naturally",
        run: () => setAvatarOpen(true),
      },
      {
        id: "ai:extend",
        label: "AI extend video (generate more frames)",
        group: "AI",
        icon: "resize",
        keywords: [
          "extend video",
          "outpaint",
          "generate more",
          "continue clip",
          "ai video extension",
          "longer",
        ],
        hint: "Extend a clip by generating seamless new frames",
        run: () => setExtendVideoOpen(true),
      },
      {
        id: "ai:remove-object",
        label: "AI object remover & inpainting",
        group: "AI",
        icon: "target",
        keywords: [
          "remove object",
          "object remover",
          "inpaint",
          "erase",
          "clean plate",
          "magic eraser",
          "watermark remover",
        ],
        hint: "Erase unwanted objects or blemishes cleanly from video frames",
        run: () => setObjectRemoverOpen(true),
      },
      {
        id: "ai:upscale",
        label: "AI video upscaler & enhancer (HD / 4K)",
        group: "AI",
        icon: "sparkles",
        keywords: [
          "upscale",
          "enhance",
          "super resolution",
          "4k",
          "clarity",
          "sharpen",
          "denoise",
          "hd",
        ],
        hint: "Increase resolution and clarity using AI enhancement models",
        run: () => setUpscaleOpen(true),
      },
      {
        id: "ai:grok",
        label: "Grok Imagine (xAI image & video generator)",
        group: "AI",
        icon: "magic",
        keywords: [
          "grok",
          "xai",
          "imagine",
          "ai image",
          "flux",
          "generate art",
          "prompt",
        ],
        hint: "Generate custom artistic visuals with xAI Grok Imagine",
        run: () => setGrokOpen(true),
      },
      {
        id: "ai:highlights",
        label: "Auto highlights & viral recap",
        group: "AI",
        icon: "magic",
        keywords: [
          "highlights",
          "recap",
          "viral shorts",
          "summary",
          "extract moments",
          "clips",
        ],
        hint: "Extracts best moments and energetic hooks into quick video clips",
        run: () => runAiTool("highlights"),
      },
      {
        id: "ai:gen-bg",
        label: "Generate background with Gemini AI",
        group: "AI",
        icon: "gradient",
        keywords: [
          "generate background",
          "ai background",
          "studio",
          "backdrop",
          "gemini",
        ],
        hint: "Creates a backdrop for your video scene using Gemini",
        run: () => setGenImage("background"),
      },
      {
        id: "ai:text-to-video",
        label: "Text to video (script to scenes with Veo)",
        group: "AI",
        icon: "film",
        keywords: [
          "text to video",
          "script to video",
          "prompt to video",
          "ai video",
          "veo",
          "storyboard",
        ],
        hint: "Turn a written prompt or script into generated video scenes",
        run: () => setTextToVideoOpen(true),
      },
      {
        id: "canvas:ratio-16-9",
        label: "Aspect ratio: 16:9 Landscape (YouTube)",
        group: "Canvas",
        icon: "monitor",
        keywords: [
          "aspect ratio",
          "16:9",
          "youtube",
          "widescreen",
          "horizontal",
          "canvas",
          "format",
        ],
        hint: "1920 × 1080 standard widescreen format",
        run: () =>
          dispatchDoc(
            { type: "setCanvas", patch: { width: 1920, height: 1080 } },
            "canvas",
          ),
      },
      {
        id: "canvas:ratio-9-16",
        label: "Aspect ratio: 9:16 Vertical (TikTok, Reels, Shorts)",
        group: "Canvas",
        icon: "crop",
        keywords: [
          "aspect ratio",
          "9:16",
          "tiktok",
          "reels",
          "shorts",
          "vertical",
          "portrait",
          "canvas",
          "format",
          "mobile",
        ],
        hint: "1080 × 1920 vertical mobile format",
        run: () =>
          dispatchDoc(
            {
              type: "setCanvas",
              patch: { width: 1080, height: 1920, fit: "fill" },
            },
            "canvas",
          ),
      },
      {
        id: "canvas:ratio-1-1",
        label: "Aspect ratio: 1:1 Square (Instagram post)",
        group: "Canvas",
        icon: "grid",
        keywords: [
          "aspect ratio",
          "1:1",
          "square",
          "instagram",
          "post",
          "canvas",
          "format",
        ],
        hint: "1080 × 1080 square format",
        run: () =>
          dispatchDoc(
            { type: "setCanvas", patch: { width: 1080, height: 1080 } },
            "canvas",
          ),
      },
      {
        id: "canvas:ratio-4-5",
        label: "Aspect ratio: 4:5 Portrait (Instagram)",
        group: "Canvas",
        icon: "crop",
        keywords: [
          "aspect ratio",
          "4:5",
          "portrait",
          "instagram",
          "feed",
          "canvas",
          "format",
        ],
        hint: "1080 × 1350 portrait format",
        run: () =>
          dispatchDoc(
            { type: "setCanvas", patch: { width: 1080, height: 1350 } },
            "canvas",
          ),
      },
      {
        id: "canvas:ratio-21-9",
        label: "Aspect ratio: 21:9 Cinema Ultrawide",
        group: "Canvas",
        icon: "film",
        keywords: [
          "aspect ratio",
          "21:9",
          "cinema",
          "ultrawide",
          "movie",
          "canvas",
          "format",
        ],
        hint: "2560 × 1080 cinematic wide format",
        run: () =>
          dispatchDoc(
            { type: "setCanvas", patch: { width: 2560, height: 1080 } },
            "canvas",
          ),
      },
      {
        id: "timeline:disable",
        label: "Disable / enable selected clip",
        group: "Timeline",
        icon: "eyeOff",
        keys: "D",
        keywords: [
          "disable clip",
          "mute clip",
          "hide clip",
          "toggle clip",
          "turn off",
          "enable clip",
        ],
        hint:
          selectedId || selectedClipIds.size > 0
            ? "Mutes/disables the clip on the timeline (D)"
            : "Select a clip first.",
        run:
          selectedId || selectedClipIds.size > 0
            ? () => toggleDisableSelected()
            : null,
      },
      {
        id: "timeline:fit",
        label: "Fit timeline to screen",
        group: "Timeline",
        icon: "fullscreen",
        keys: "Shift Z",
        keywords: [
          "zoom fit",
          "fit timeline",
          "overview",
          "see all",
          "zoom to fit",
        ],
        hint: "Zooms timeline to show all clips",
        run: () => timelineApiRef.current?.fit(),
      },
      {
        id: "timeline:zoom-in",
        label: "Zoom in timeline",
        group: "Timeline",
        icon: "plus",
        keys: "+",
        keywords: ["zoom in", "magnify timeline", "expand timeline"],
        run: () => timelineApiRef.current?.zoomIn(),
      },
      {
        id: "timeline:zoom-out",
        label: "Zoom out timeline",
        group: "Timeline",
        icon: "resize",
        keys: "-",
        keywords: ["zoom out", "shrink timeline", "timeline zoom"],
        run: () => timelineApiRef.current?.zoomOut(),
      },
      {
        id: "timeline:prev-cut",
        label: "Jump to previous cut",
        group: "Timeline",
        icon: "prevFrame",
        keys: "[",
        keywords: ["cut", "previous edit", "jump back", "clip start", "boundary"],
        run: hasClips ? () => jumpToPrevCut() : null,
      },
      {
        id: "timeline:next-cut",
        label: "Jump to next cut",
        group: "Timeline",
        icon: "nextFrame",
        keys: "]",
        keywords: ["cut", "next edit", "jump forward", "clip end", "boundary"],
        run: hasClips ? () => jumpToNextCut() : null,
      },
      {
        id: "timeline:step-back",
        label: "Step 1 frame backward",
        group: "Timeline",
        icon: "prevFrame",
        keys: "←",
        keywords: ["frame", "step backward", "nudge", "previous frame"],
        run: hasClips
          ? () =>
              seekTimeline(
                Math.max(0, clock.get() - 1 / (doc.canvas.fps || 30)),
              )
          : null,
      },
      {
        id: "timeline:step-forward",
        label: "Step 1 frame forward",
        group: "Timeline",
        icon: "nextFrame",
        keys: "→",
        keywords: ["frame", "step forward", "nudge", "next frame"],
        run: hasClips
          ? () =>
              seekTimeline(
                Math.min(
                  docDuration(doc),
                  clock.get() + 1 / (doc.canvas.fps || 30),
                ),
              )
          : null,
      },
      {
        id: "timeline:select-all",
        label: "Select all clips",
        group: "Timeline",
        icon: "grid",
        keys: `${mod} A`,
        keywords: ["select all", "all clips", "choose all"],
        run: hasClips
          ? () => {
              const ids = doc.tracks.flatMap((t) => t.clips.map((c) => c.id));
              if (ids.length) setSelectedClipIds(new Set(ids));
            }
          : null,
      },
      {
        id: "timeline:deselect",
        label: "Deselect all clips",
        group: "Timeline",
        icon: "close",
        keys: "Esc",
        keywords: ["deselect", "clear selection", "unselect"],
        run:
          selectedId || selectedClipIds.size > 0
            ? () => {
                setSelectedId(null);
                setSelectedClipIds(new Set());
              }
            : null,
      },
      {
        id: "timeline:add-marker",
        label: "Add timeline marker at playhead",
        group: "Timeline",
        icon: "marker",
        keys: "M",
        keywords: ["marker", "bookmark", "flag", "cue", "timestamp", "point"],
        hint: "Places a marker at the playhead position (M)",
        run: () => dispatchDoc({ type: "addMarker", t: clock.get() }),
      },
      {
        id: "timeline:clear-markers",
        label: "Clear all timeline markers",
        group: "Timeline",
        icon: "trash",
        keywords: ["clear markers", "remove markers", "delete markers"],
        hint: doc.markers?.length
          ? undefined
          : "No markers on the timeline.",
        run: doc.markers?.length
          ? () =>
              doc.markers?.forEach((m) =>
                dispatchDoc({ type: "deleteMarker", markerId: m.id }),
              )
          : null,
      },
      {
        id: "transition:apply-all",
        label: "Apply crossfade transition to all cuts",
        group: "Edit",
        icon: "transitions",
        keywords: [
          "transition",
          "crossfade",
          "fade between clips",
          "smooth cuts",
          "dissolve",
          "apply to all",
        ],
        hint:
          mainTrack(doc).clips.length >= 2
            ? "Adds a 0.5s crossfade between all adjacent clips on Video 1"
            : "Add at least 2 clips to Video 1 first.",
        run:
          mainTrack(doc).clips.length >= 2
            ? () => applyTransitionAll({ type: "crossfade", duration: 0.5 })
            : null,
      },
      {
        id: "transition:remove-all",
        label: "Remove all transitions",
        group: "Edit",
        icon: "close",
        keywords: ["transition", "remove transitions", "clear transitions", "cut"],
        run: () => applyTransitionAll(undefined),
      },
      {
        id: "project:share",
        label: "Share project link",
        group: "Project",
        icon: "share",
        keywords: ["share", "link", "collaborate", "publish", "send"],
        run: () => setShareOpen(true),
      },
      {
        id: "project:storage",
        label: "Storage manager & cache cleanup",
        group: "Project",
        icon: "storage",
        keywords: [
          "storage",
          "cache",
          "memory",
          "cleanup",
          "disk",
          "free space",
          "delete uploads",
        ],
        hint: "Inspect local browser storage, cached media, and free up space",
        run: () => setStorageModalOpen(true),
      },
      {
        id: "view:templates",
        label:
          workspaceView === "templates"
            ? "Return to Video Studio"
            : "Browse Video Templates Hub",
        group: "View",
        icon: "templates",
        keywords: [
          "templates",
          "presets",
          "youtube template",
          "tiktok template",
          "broadcast graphics",
        ],
        run: () =>
          setWorkspaceView((v) => (v === "templates" ? "studio" : "templates")),
      },
    ];
    return list;
  };

  const side = sidePanel && (
    <aside
      id={`panel-${sidePanel}`}
      aria-labelledby="side-title"
      className={
        wide ? "panel flex shrink-0 flex-col overflow-hidden" : "bg-surface"
      }
      style={wide ? { width: leftW } : undefined}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 id="side-title" className="text-sm font-semibold">
          {SIDE_TITLES[sidePanel]}
        </h2>
        {wide && (
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink"
            onClick={() => setLeftPanel(null)}
            aria-label="Hide panel"
            title="Hide panel"
          >
            <Icon name="close" className="size-4" />
          </button>
        )}
      </div>
      <div
        className={`relative min-h-0 flex-1 ${
          sidePanel === "library"
            ? "flex flex-col overflow-hidden p-0"
            : "overflow-y-auto p-3"
        }`}
      >
        {sidePanel === "edit" ? (
          <EditPanel
            doc={doc}
            selectedId={selectedId}
            clock={clock}
            media={ds.media}
            onSplit={(clipId, t) => dispatchDoc({ type: "split", clipId, t })}
            onTrim={(clipId, edge, to) =>
              dispatchDoc(
                { type: "trim", clipId, edge, to },
                `trim:${edge}:${++editSeq.current}`,
              )
            }
            onDelete={() => deleteSelected()}
            onDuplicate={(clipId) => dispatchDoc({ type: "duplicate", clipId })}
            onCrop={startCrop}
            onSpeed={(clipId) => {
              setSelectedId(clipId);
              setInspTab("speed");
            }}
            onReverse={(clipId) => {
              const c = findClip(doc, clipId)?.clip;
              if (c && c.type === "video") {
                dispatchDoc(
                  {
                    type: "setClip",
                    clipId,
                    patch: {
                      reversed: (c as VideoClip).reversed ? undefined : true,
                    },
                  },
                  `clip:${++editSeq.current}`,
                );
                setSelectedId(clipId);
                setInspTab("speed");
              }
            }}
            onFreeze={(clipId, t) => void freezeAt(clipId, t)}
            onMask={(clipId) => {
              setSelectedId(clipId);
              setInspTab("basic");
            }}
            onSilences={(clipId) => setSilenceFor(clipId)}
            onKeyframe={(clipId, t) =>
              dispatchDoc(
                { type: "keyframe", clipId, t, op: { kind: "toggle" } },
                `key:toggle:${clipId}:${++editSeq.current}`,
              )
            }
            tabs={(() => {
              const c = selected?.clip;
              if (!c) return [];
              const isPic = c.type === "video" || c.type === "image";
              const pick = (tab?: InspectorTab) => {
                setSelectedId(c.id);
                if (tab) setInspTab(tab);
              };
              return isPic
                ? tabsFor(c.type as "video" | "image").map((t) => ({
                    id: t,
                    label: `${TAB_INFO[t].label} · ${TAB_INFO[t].hint}`,
                    icon: TAB_INFO[t].icon,
                    onClick: () => pick(t),
                  }))
                : [
                    {
                      id: "settings",
                      label:
                        c.type === "text"
                          ? "Text settings · words, style, place"
                          : c.type === "element"
                            ? "Element settings · colors, words, place"
                            : c.type === "blank"
                              ? "Blank settings · color, length"
                              : "Sound settings · volume, fades, noise",
                      icon:
                        c.type === "text"
                          ? "text"
                          : c.type === "element"
                            ? "elements"
                            : c.type === "blank"
                              ? "plus"
                              : "audio",
                      onClick: () => pick(),
                    },
                  ];
            })()}
          />
        ) : sidePanel === "text" ? (
          <TextPanel
            onAdd={addTextAt}
            onElements={() => showPanel("elements")}
          />
        ) : sidePanel === "elements" ? (
          <ElementsPanel
            onAdd={addElementAt}
            onEmoji={(emoji) => addElementAt({ emoji })}
            logo={logoTileState}
            onLogo={logoTile}
            searchRef={elementsSearch}
          />
        ) : sidePanel === "background" ? (
          <BackgroundPanel
            canvas={doc.canvas}
            onCanvas={(patch) =>
              dispatchDoc(
                { type: "setCanvas", patch },
                `backdrop:${++editSeq.current}`,
              )
            }
            assets={assets.items}
            target={
              aiVideo
                ? {
                    name: metas[aiVideo.mediaId]?.fileName ?? "the clip",
                    removalOn:
                      !!clipStudioState(ds, aiVideo.id) &&
                      removalOn(clipStudioState(ds, aiVideo.id)!),
                  }
                : null
            }
            onRemovePerson={removePerson}
            onGenerate={() => setGenImage("background")}
            onUploaded={(v) => {
              setMetas((m) => ({ ...m, [v.id]: v }));
              void assets.refresh();
            }}
          />
        ) : sidePanel === "transitions" ? (
          <TransitionsPanel
            onApply={applyTransition}
            onApplyAll={(type) => applyTransitionAll({ type, duration: 0.5 })}
            onNone={removeTransition}
            onNoneAll={() => applyTransitionAll(undefined)}
            hint={
              mainTrack(doc).clips.length < 2
                ? "Put at least two clips on Video 1: transitions go between them."
                : null
            }
          />
        ) : sidePanel === "brand" ? (
          <div className="flex flex-col gap-4">
            <BrandPanel
              api={brand}
              assets={assets.items}
              watermark={doc.watermark}
              onWatermark={setWatermark}
              duration={docDuration(doc)}
              onAddClip={(v, where) =>
                addToTimeline(v, where === "start" ? { index: 0 } : {})
              }
              onInsertAtPlayhead={(v) => addToTimeline(v)}
              onUploaded={(v) => {
                setMetas((m) => ({ ...m, [v.id]: v }));
                void assets.refresh();
              }}
            />
            <SoonPanel area="brand" actions={soonActions} hideReady />
          </div>
        ) : sidePanel === "audio" ? (
          <div className="flex flex-col gap-4">
            <AudioLibraryPanel
              onAdd={(v) => addToTimeline(v)}
              onRecordVoice={() => setRecordMode("voice")}
              onTts={() => setTtsOpen(true)}
            />
            <SoonPanel area="audio" actions={soonActions} hideReady />
          </div>
        ) : sidePanel === "effects" ? (
          <div className="flex flex-col gap-4">
            {(() => {
              const currentMain =
                (mainClipAt(doc, clock.get())?.clip as VideoClip | ImageClip) ||
                null;
              const effectiveClip = lookClip || currentMain;
              const thumbUrl =
                effectiveClip && "mediaId" in effectiveClip
                  ? (localThumb(effectiveClip.mediaId) ?? `/api/videos/${effectiveClip.mediaId}/thumb`)
                  : null;
              return (
                <EffectsPanel
                  doc={doc}
                  selectedClip={selected?.clip ?? null}
                  targetClip={effectiveClip}
                  thumb={thumbUrl}
                  onChangeColor={(clipId, color, group) =>
                    dispatchDoc(
                      { type: "setClip", clipId, patch: { color } },
                      group ? `${group}:${clipId}` : undefined,
                    )
                  }
                  onApplyAllLooks={lookAll}
                  onAutoColor={
                    selected &&
                    (selected.clip.type === "video" ||
                      selected.clip.type === "image")
                      ? async () => {
                          const c = selected.clip;
                          const r = await fetch(
                            `/api/videos/${(c as VideoClip).mediaId}/autocolor`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(
                                c.type === "video"
                                  ? {
                                      in: (c as VideoClip).in,
                                      out: (c as VideoClip).out,
                                    }
                                  : {},
                              ),
                            },
                          ).catch(() => null);
                          const j = r?.ok ? await r.json() : null;
                          return j?.color ?? null;
                        }
                      : undefined
                  }
                  onPatchClip={(clipId, patch, group) =>
                    dispatchDoc(
                      { type: "setClip", clipId, patch },
                      group ? `${group}:${clipId}` : undefined,
                    )
                  }
                />
              );
            })()}
            <SoonPanel area="effects" actions={soonActions} hideReady />
          </div>
        ) : sidePanel === "subtitles" ? (
          <SubtitlesPanel
            gemini={gemini}
            doc={doc}
            duration={mainDuration(doc)}
            onAddChapters={(chapters) => {
              // each chapter becomes a purple marker named after it, as one undo step
              const group = `chapters:${++editSeq.current}`;
              for (const ch of chapters)
                dispatchDoc(
                  { type: "addMarker", t: ch.t, label: ch.title.slice(0, 80), color: "purple" },
                  group,
                );
            }}
            hasAudio={(id) => !!ds.media[id]?.hasAudio}
            selectedId={selectedId}
            selectedCaptionTrack={
              selected &&
              selected.clip.type === "text" &&
              (selected.track.name ?? "").startsWith("Subtitles")
                ? selected.track.id
                : null
            }
            onAdd={addCaptions}
            onStyleAll={styleAllCaptions}
            onSelectTrack={(trackId) => {
              const t = doc.tracks.find((x) => x.id === trackId);
              if (t?.clips[0]) setSelectedId(t.clips[0].id);
            }}
            onSeek={seekTimeline}
            onSelectClip={(id) => setSelectedId(id)}
            onDeleteClip={(id) =>
              dispatchDoc({ type: "deleteClip", clipId: id })
            }
            onOpenTranscriptEdit={() => setTranscriptEditOpen(true)}
            onEmojiBoost={(trackId) => {
              const tr = doc.tracks.find((x) => x.id === trackId);
              if (!tr) return;
              const group = `caption-emoji:${++editSeq.current}`;
              for (const c of tr.clips) {
                if (c.type !== "text") continue;
                const next = emojiBoost(c);
                if (next.text === c.text) continue;
                dispatchDoc(
                  {
                    type: "setClip",
                    clipId: c.id,
                    patch: { text: next.text, wordTimes: next.wordTimes },
                  },
                  group,
                );
              }
            }}
            onApplyCaptionStyle={(trackId, style) => {
              const tr = doc.tracks.find((x) => x.id === trackId);
              if (!tr) return;
              // (every caption of the track, as one undo step)
              const group = `caption-look:${++editSeq.current}`;
              for (const c of tr.clips) {
                if (c.type === "text") {
                  dispatchDoc(
                    {
                      type: "setClip",
                      clipId: c.id,
                      patch: {
                        style: {
                          ...c.style,
                          highlightStyle: style.highlightStyle,
                          highlightColor: style.highlightColor,
                        },
                      },
                    },
                    group,
                  );
                }
              }
            }}
            onExtractHighlights={() => {
              const targetClip =
                aiVideo ??
                (mainTrack(doc).clips.find((c) => c.type === "video") as
                  | MainClip
                  | undefined);
              if (targetClip && "mediaId" in targetClip) {
                setHighlightsFor(targetClip.mediaId);
              } else {
                setNotice(
                  "Select a video clip with audio first to extract highlights.",
                );
              }
            }}
            onShow={() => showPanel("subtitles")}
          />
        ) : isSoonArea(sidePanel) ? (
          <SoonPanel area={sidePanel} actions={soonActions} />
        ) : sidePanel === "templates" ? (
          <TemplatesGallery
            onUse={(t) => void applyTemplate(t)}
            onSaveCurrentAsTemplate={() => {
              const name = window.prompt(
                "Template name:",
                sync.project?.name || "My Custom Template",
              );
              if (!name?.trim()) return;
              saveCustomTemplate(name.trim(), doc);
              setNotice(`Saved template "${name.trim()}".`);
            }}
          />
        ) : sidePanel === "library" ? (
          <UnifiedLibraryPanel
            onInsertVideo={(m, add) => {
              setMetas((x) => ({ ...x, [m.id]: m }));
              void assets.refresh();
              if (add) addToTimeline(m);
            }}
            onInsertAudio={(meta) => addToTimeline(meta)}
            projectShape={
              doc.canvas.height > doc.canvas.width
                ? "portrait"
                : doc.canvas.width > doc.canvas.height
                  ? "landscape"
                  : "any"
            }
          />
        ) : sidePanel === "media" ? (
          <MediaPanel
            assets={shownAssets}
            listError={assets.error}
            inTimeline={usedMedia}
            upload={uploadState}
            onChoose={openPicker}
            onRecord={setRecordMode}
            onCancelUpload={cancelUpload}
            onDropFile={uploadFile}
            onDropFiles={uploadFiles}
            onDropMeme={importMemeToAssets}
            onAdd={(a) => addToTimeline(a)}
            onDelete={deleteAsset}
            onImport={(tab) => setImportTab(tab)}
            onOpenLibrary={() => showPanel("library")}
          />
        ) : (
          <ProjectsPanel
            projects={projects.items}
            listError={projects.error}
            currentId={projectId}
            onOpen={(id) => void openProject(id)}
            onNew={() => startOver()}
            onRenamed={(id, name) => {
              sync.renamedElsewhere(id, name);
              refreshLists();
            }}
            onDeleted={onProjectDeleted}
            onOpenStorage={() => setStorageModalOpen(true)}
            onDropFiles={(files) => void createProjectFromFiles(files)}
            onDropMeme={(meme) => void createProjectFromMeme(meme)}
            onImportVDOFile={async (file) => {
              const ws = localWorkspaceManager.getActiveWorkspace();
              if (ws) await loadVDOFile(file, ws);
            }}
          />
        )}
      </div>
    </aside>
  );

  const setSplit = (on: boolean) => {
    setSplitOn(on);
    try {
      localStorage.setItem(SPLIT_KEY, on ? "1" : "0");
    } catch {
      /* private window */
    }
    // (both show now: the keys and the playhead go to the Program)
    if (on && mode === "clip") {
      clipRef.current?.pause();
      setMode("program");
    }
  };
  const splitButton = wide && (
    <Tip
      text={
        splitShown
          ? "One preview"
          : "Split view: Program and This clip side by side"
      }
      side="bottom"
      align="left"
    >
      <button
        type="button"
        aria-pressed={splitShown}
        aria-label="Split view: Program and This clip"
        onClick={() => setSplit(!splitShown)}
        className={`flex size-7 items-center justify-center rounded-md border ${splitShown ? "border-primary bg-primary-soft text-ink" : "border-line text-muted hover:border-control hover:text-ink"}`}
      >
        <Icon name="columns" className="size-3.5" />
      </button>
    </Tip>
  );
  const modeTabs = (
    <SegmentedControl<"program" | "clip">
      legend="Preview"
      legendHidden
      variant="tabs"
      size="sm"
      fill={false}
      name="preview-mode"
      value={mode}
      onChange={(m) => {
        setMode(m);
        if (m === "program") programRef.current?.seek(clock.get());
      }}
      options={[
        // icons (the words stay for screen readers and in the tooltip)
        {
          value: "program",
          label: (
            <>
              <Icon name="film" className="size-3.5" />
              <span className="sr-only">Program</span>
            </>
          ),
          title: "Program: the whole timeline, as it will be exported",
        },
        {
          value: "clip",
          label: (
            <>
              <Icon name="video" className="size-3.5" />
              <span className="sr-only">This clip</span>
            </>
          ),
          title: "This clip: one video clip, to tune its background removal",
          disabled: !activeClip,
        },
      ]}
    />
  );
  const previewTools = (
    <>
      {!splitShown && modeTabs}
      {hasClips && splitButton}
      {hasClips && (
        <RatioMenu
          canvas={doc.canvas}
          onCanvas={(size) =>
            dispatchDoc(
              { type: "setCanvas", patch: size },
              `ratio:${++editSeq.current}`,
            )
          }
        />
      )}
      {bgButton}
      <button
        type="button"
        onClick={toggleProxyMode}
        className={`flex items-center gap-1.5 px-2 py-0.5 text-[0.6875rem] font-medium rounded transition-colors ${
          proxyMode
            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
            : "bg-surface-2/60 text-ink-muted hover:text-ink hover:bg-surface-2 border border-line/40"
        }`}
        title={
          proxyMode
            ? "Proxy Mode: Active (720p). Playback and scrubbing are optimized. Final export always uses 100% original master quality."
            : "Proxy Mode: Off. Click to enable 720p fast-seeking proxies for smooth editing."
        }
        aria-pressed={proxyMode}
        data-testid="proxy-toggle"
      >
        <span
          className={`inline-block size-1.5 rounded-full ${
            proxyMode ? "bg-amber-400 animate-pulse" : "bg-ink-muted/40"
          }`}
        />
        <span>Proxy</span>
      </button>
    </>
  );

  /** The clip view (This clip): alone, or on the right of the split view. */
  const clipPane = (toolbar: ReactNode) =>
    video && activeClip ? (
      <PreviewPane
        toolbarStart={toolbar}
        proxyMode={proxyMode}
        localSrc={localSrc(video.id) && !(proxyMode && !notOnServer(video.id)) ? localSrc(video.id) : null}
        sound={activeSound}
        key={activeClip.id}
        fit={wide}
        clock={clipClock}
        playerRef={clipRef}
        segments={[
          { id: activeClip.id, in: activeClip.in, out: activeClip.out },
        ]}
        videoId={video.id}
        size={size}
        duration={video.info.duration}
        fps={video.info.fps}
        hasAudio={video.info.hasAudio}
        live={liveParams}
        removalOn={on}
        exact={preview}
        edgeOpsActive={
          state.method === "color"
            ? kp.edgeShift !== 0 || kp.feather > 0
            : state.method === "ai" &&
              (aiParams(state).edgeShift !== 0 ||
                aiParams(state).feather > 0 ||
                aiParams(state).smooth > 0)
        }
        view={view}
        onViewChange={setView}
        aiMode={aiOn}
        packedSrc={aiOn ? aiMask.packed : null}
        blurBehind={
          aiOn && aiParams(state).background === "blur"
            ? (aiParams(state).blur ?? 12)
            : null
        }
        picking={pickingOn}
        detectedKey={state.detectedKey}
        onPick={onPick}
        onCancelPick={() => {
          setPicking(false);
          if (pickReturnMode === "program") setMode("program");
          setPickReturnMode(null);
          if (on) setView("removed");
        }}
        onPausedTimeChange={(pt) => {
          setPausedT(pt);
          if (pt !== null) setLastT(pt);
        }}
        cropBox={
          crop.status === "ready" && crop.box && crop.frame
            ? { box: crop.box, frame: crop.frame }
            : null
        }
        bg={bg}
        bgMedia={bg === "image" || bg === "video" ? bgMedia[bg] : undefined}
        custom={custom}
        highlight={highlight}
        final={single ? final : null}
      />
    ) : null;
  const programPane = (
    <ProgramPlayer
      doc={doc}
      proxyMode={proxyMode}
      localVersion={localVer}
      media={playerMedia}
      clock={clock}
      playerRef={programRef}
      liveOf={liveOf}
      packedOf={packedOf}
      blurOf={blurOf}
      sourceOf={sourceOf}
      speech={speech}
      reversedOf={reversedOf}
      fit={wide}
      bg={bg}
      custom={custom}
      bgMedia={bg === "image" || bg === "video" ? bgMedia[bg] : undefined}
      toolbar={previewTools}
      selectedId={selectedId}
      onSelect={selectClip}
      onTransform={(clipId, transform, group) =>
        editAtPlayhead(clipId, { transform }, group)
      }
      onEditText={(id) => {
        const c = findClip(doc, id)?.clip;
        document
          .getElementById(
            c?.type === "element"
              ? c.el.kind === "emoji"
                ? "element-emoji"
                : "element-text"
              : "text-content",
          )
          ?.focus();
      }}
      onStretch={stretchAt}
      onRadius={radiusAt}
      cropId={cropFor}
      onCropDone={() => setCropFor(null)}
      patchEdit={patchEdit}
      onPatchDone={() => setPatchEdit(null)}
      logoSelected={logoShown}
      onSelectLogo={(on) => {
        setLogoSel(on);
        if (on) {
          setSelectedId(null);
          setSelTransition(null);
          setCropFor(null);
          setPatchEdit(null);
        }
      }}
      onWatermark={(w, group) => setWatermark(w, group)}
      onDropAt={dropOnPreview}
      onPatchBox={(clipId, patchId, box, group) => {
        const f = findClip(doc, clipId);
        const list = f && "patches" in f.clip ? (f.clip.patches ?? []) : [];
        dispatchDoc(
          {
            type: "setClip",
            clipId,
            patch: {
              patches: list.map((x) =>
                x.id === patchId ? { ...x, ...box } : x,
              ),
            },
          },
          group,
        );
      }}
      trackingPoints={
        selected?.clip.type === "video"
          ? (selected.clip as VideoClip).tracking?.points
          : undefined
      }
      activeTrackingPointId={
        selected?.clip.type === "video"
          ? (selected.clip as VideoClip).tracking?.activePointId
          : undefined
      }
      isTrackingOpen={inspTab === "tracking"}
      isTracking={isTracking}
      trackingProgress={trackingProgress}
      onMoveTrackingPoint={handleMoveTrackingPoint}
      onSelectTrackingPoint={handleSelectTrackingPoint}
      onStartTracking={handleStartTracking}
      onCancelTracking={handleCancelTracking}
    />
  );

  const previewArea = (
    <section
      aria-label="Preview"
      className={`panel relative flex min-w-0 flex-col overflow-hidden ${wide ? "min-h-0 flex-1" : ""} ${dragging ? "ring-2 ring-primary" : ""}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        const insideStage = !!target.closest("[data-testid='program-stage']");
        const isInteractive =
          !!target.closest("button") ||
          !!target.closest("input") ||
          !!target.closest("select") ||
          !!target.closest("a") ||
          !!target.closest("[role='menu']") ||
          !!target.closest("[role='group']");
        if (!insideStage && !isInteractive && (selectedId || logoShown)) {
          selectClip(null);
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        // (the program picture may have used it already: a picture placed like a logo, or dropped text/element)
        const used = e.defaultPrevented;
        e.preventDefault();
        setDragging(false);
        if (used) return;
        const textStyleId =
          e.dataTransfer.getData(TEXT_DRAG) || textDrag()?.styleId;
        if (textStyleId) {
          addTextAt(textStyleId);
          return;
        }
        const elRaw = e.dataTransfer.getData(ELEMENT_DRAG);
        const activeEl = elementDrag();
        if (elRaw || activeEl) {
          try {
            const parsed = elRaw ? JSON.parse(elRaw) : activeEl;
            if (parsed?.presetId) {
              addElementAt(parsed.presetId);
              return;
            }
            if (parsed?.emoji) {
              addElementAt({ emoji: parsed.emoji });
              return;
            }
          } catch {
            if (elRaw) {
              addElementAt(elRaw);
              return;
            }
          }
        }
        uploadFiles([...e.dataTransfer.files]);
      }}
    >
      {stageBusy && <SpinnerOverlay label={stageBusy} />}
      {working && !stageBusy && (
        <span role="status" className="pointer-events-none absolute left-1/2 top-12 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-xs text-white shadow-lg" data-testid="stage-working">
          <Spinner size="xs" /> {working}
        </span>
      )}
      {notice && (
        <div className="p-2">
          <Notice
            tone="warning"
            title={notice}
            actions={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setNotice(null)}
              >
                OK
              </button>
            }
          />
        </div>
      )}
      {hasClips && uploadState.kind === "error" && (
        <div className="p-2">
          <Notice
            tone="error"
            role="alert"
            title="That file can't be used"
            actions={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearUploadError}
              >
                Dismiss
              </button>
            }
          >
            {uploadState.message}
          </Notice>
        </div>
      )}
      {!hasClips || (uploadBusy && !hasClips) ? (
        <div className={wide ? "min-h-0 flex-1" : ""}>
          <EmptyPreview
            state={uploadState}
            onChoose={openPicker}
            onCancel={cancelUpload}
            dragging={dragging}
            onRecord={setRecordMode}
            onText={() => addTextAt("title")}
            onElements={() => showPanel("elements")}
            onBlank={() => addBlankAt(0)}
          />
        </div>
      ) : splitShown ? (
        // side by side: starting one pauses the other (never two sounds)
        <div
          data-testid="split-view"
          className="flex min-h-0 flex-1 gap-px bg-line"
        >
          <div
            data-testid="split-program"
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
            onPointerDownCapture={() => clipRef.current?.pause()}
          >
            {programPane}
          </div>
          <div
            data-testid="split-clip"
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
            onPointerDownCapture={() => programRef.current?.pause()}
          >
            {clipPane(
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/30 bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-medium text-link">
                <Icon name="video" className="size-3 text-primary" /> Clip
              </span>,
            ) ?? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 bg-[#0c1527] p-4 text-center">
                <Icon name="video" className="size-6 text-muted" />
                <p className="text-sm font-medium text-white/85">This clip</p>
                <p className="text-xs text-white/60">
                  Select a video clip to see it here.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : mode === "clip" && video && activeClip ? (
        clipPane(previewTools)
      ) : (
        programPane
      )}
    </section>
  );

  // choosing AI Removal shows the result next to the original
  const panelDispatch = (a: StudioAction, group?: string) => {
    if (a.type === "setMethod" && a.method === "ai") {
      setMode("clip");
      setView((v) => (v === "original" ? "removed" : v));
    }
    dispatch(a, group);
  };

  const toolPanel = (
    <tool.Panel
      bare
      state={state}
      keyParams={kp}
      dispatch={panelDispatch}
      video={video}
      seeThrough={seeThrough}
      crop={crop}
      aiMask={aiMask}
      onRetryAi={() => setAiAttempt((n) => n + 1)}
      keyControl={{
        picking: pickingOn,
        pickWarning,
        onStartPick: () => {
          setPickReturnMode(mode);
          setMode("clip");
          setPicking(true);
          setView("original");
        },
        onCancelPick: () => {
          setPicking(false);
          if (pickReturnMode === "program") setMode("program");
          setPickReturnMode(null);
          if (on) setView("removed");
        },
        onHexCommit: (hex) => {
          dispatch({ type: "setKey", hex, source: "typed" });
          setPickWarning(null);
          setView((v) => (v === "original" ? "removed" : v));
        },
        onResetDetected: () => {
          dispatch({ type: "resetKey" });
          setPickWarning(null);
        },
        onDismissWarning: () => setPickWarning(null),
        onUseDetected: useDetected,
      }}
    />
  );

  const selectedName =
    selected && "mediaId" in selected.clip
      ? (metas[selected.clip.mediaId]?.fileName ?? "")
      : "";
  // crop, auto color… for the selected picture clip
  const selMedia =
    selected && "mediaId" in selected.clip
      ? ds.media[selected.clip.mediaId]
      : undefined;
  const selVideo =
    selected?.clip.type === "video" ? (selected.clip as VideoClip) : null;
  const clipTools = {
    onLookAll: lookAll,
    size: selMedia ? { width: selMedia.width, height: selMedia.height } : null,
    stabilize: selVideo
      ? {
          blocked: hasAi(selVideo)
            ? "Stabilize can't be combined with AI Removal yet (the AI cut-out is made from the original frames)."
            : null,
          percent: selVideo.stabilize
            ? (stab.percent[selVideo.mediaId] ?? 0)
            : null,
          ready: !!(selVideo.stabilize && stab.url[selVideo.mediaId]),
        }
      : undefined,
    watermark:
      selected &&
      (selected.clip.type === "video" || selected.clip.type === "image")
        ? {
            onEdit: (patchId: string) => {
              setMode("program");
              setCropFor(null);
              setPatchEdit({ clipId: selected.clip.id, patchId });
            },
            pictures: (assets.items ?? [])
              .filter((a) => a.kind === "image")
              .map((a) => ({ id: a.id, name: a.fileName })),
            editing:
              patchEdit?.clipId === selected.clip.id ? patchEdit.patchId : null,
          }
        : undefined,
    reverse: selVideo
      ? {
          blocked: hasAi(selVideo)
            ? "Reverse can't be combined with AI Removal yet."
            : selVideo.out - selVideo.in > 120
              ? "Reverse works on parts up to 2 minutes: split the clip first."
              : null,
          percent: selVideo.reversed ? (rev.percent[selVideo.id] ?? 0) : null,
          ready: !!(selVideo.reversed && rev.url[selVideo.id]),
          error: rev.error[selVideo.id] ?? null,
        }
      : undefined,
    onCropMode:
      selected &&
      (selected.clip.type === "video" || selected.clip.type === "image")
        ? () => startCrop(selected.clip.id)
        : undefined,
    onAutoColor:
      selected &&
      (selected.clip.type === "video" || selected.clip.type === "image")
        ? async () => {
            const c = selected.clip;
            const r = await fetch(
              `/api/videos/${(c as VideoClip).mediaId}/autocolor`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  c.type === "video"
                    ? { in: (c as VideoClip).in, out: (c as VideoClip).out }
                    : {},
                ),
              },
            ).catch(() => null);
            const j = r?.ok ? await r.json() : null;
            return j?.color ?? null;
          }
        : undefined,
  };
  const trClip = selTransition ? findClip(doc, selTransition) : null;
  const trSorted = trClip
    ? trClip.track.kind === "main"
      ? trClip.track.clips
      : [...(trClip.track.clips as (AnyClip & { start: number })[])].sort(
          (a, b) => a.start - b.start,
        )
    : [];
  const trIndex = trClip
    ? trSorted.findIndex((c) => c.id === trClip.clip.id)
    : -1;
  const trPrev = trIndex > 0 ? (trSorted[trIndex - 1] as AnyClip) : null;
  const nameOf = (c: AnyClip) =>
    "mediaId" in c
      ? (metas[c.mediaId]?.fileName ?? "clip")
      : c.type === "blank"
        ? "blank"
        : c.type === "text"
          ? "text"
          : "element";
  /** A change from the inspector (a badge whose words or font changed gets as wide as its words). */
  const patchClip = (
    clip: AnyClip,
    patch: Record<string, unknown>,
    group?: string,
  ) => {
    let pt = patch;
    if (clip.type === "element" && patch.el) {
      const fit = refitBadge(
        { ...clip, el: patch.el as ElementLook },
        browserMeasure(),
        doc.canvas.width,
        doc.canvas.height,
      );
      if (fit)
        pt = {
          ...patch,
          el: { ...(patch.el as ElementLook), aspect: fit.aspect },
          transform: fit.transform,
        };
    }
    dispatchDoc(
      { type: "setClip", clipId: clip.id, patch: pt },
      group ? `${group}:${clip.id}` : undefined,
    );
  };
  const inspector = (
    <BrandContext.Provider value={brand.brand}>
      {/* the main card fills the column (full height), anything else sits under it; one-row sliders everywhere on the right */}
      <SliderDensity.Provider value="compact">
        <div className="flex flex-1 flex-col gap-2 [&>:first-child]:flex-1">
          {smartMixOpen ? (
            <SmartMixPanel
              doc={doc}
              onApply={handleApplySmartMix}
              onReset={handleResetSmartMix}
              onClose={() => setSmartMixOpen(false)}
              isAnalyzing={isAnalyzingMix}
            />
          ) : (
            <>
          {trClip &&
          trPrev &&
          "transitionIn" in trClip.clip &&
          trClip.clip.transitionIn ? (
            <TransitionCard
              between={`${nameOf(trPrev)} → ${nameOf(trClip.clip)}`}
              transition={trClip.clip.transitionIn}
              maxLength={
                Math.min(clipLength(trPrev), clipLength(trClip.clip)) / 2
              }
              onChange={(t, g) => {
                const patch: Record<string, unknown> = { transitionIn: t };
                if (trClip.track.kind === "overlay") {
                  const prevEnd =
                    (trPrev as AnyClip & { start: number }).start +
                    clipLength(trPrev);
                  const curStart = (trClip.clip as AnyClip & { start: number })
                    .start;
                  const oldDur = trClip.clip.transitionIn?.duration ?? 0.5;
                  if (Math.abs(prevEnd - curStart - oldDur) <= 0.15) {
                    patch.start = Math.max(
                      (trPrev as AnyClip & { start: number }).start,
                      prevEnd - t.duration,
                    );
                  }
                }
                dispatchDoc(
                  { type: "setClip", clipId: trClip.clip.id, patch },
                  g ? `${g}:${trClip.clip.id}` : undefined,
                );
              }}
              onRemove={() => removeTransition()}
              onApplyAll={() =>
                "transitionIn" in trClip.clip &&
                trClip.clip.transitionIn &&
                applyTransitionAll(trClip.clip.transitionIn)
              }
            />
          ) : logoShown && doc.watermark ? (
            <section
              aria-labelledby="logo-card-title"
              className="panel flex flex-col"
              data-testid="logo-card"
            >
              <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Icon name="brand" className="size-4 shrink-0 text-muted" />
                <h2
                  id="logo-card-title"
                  className="flex-1 text-sm font-semibold"
                >
                  Logo
                </h2>
                <button
                  type="button"
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted hover:bg-danger-soft hover:text-danger"
                  onClick={() => setWatermark(undefined)}
                  aria-label="Remove the logo from this video"
                  title="Remove the logo from this video"
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </header>
              <div className="flex flex-col gap-2.5 p-3">
                <p className="text-[0.6875rem] text-muted">
                  Your Brand Kit logo, on the whole video. Drag it on the
                  preview; it snaps to the corners (Alt: anywhere).
                </p>
                <LogoControls
                  wm={doc.watermark}
                  onChange={(w, g) => setWatermark(w, g)}
                  colors={brand.brand?.colors ?? []}
                  duration={docDuration(doc)}
                />
              </div>
            </section>
          ) : selected &&
            (selected.clip.type === "video" ||
              selected.clip.type === "image") ? (
            <ClipInspector
              clip={selected.clip}
              name={selectedName}
              tab={inspTab}
              onTab={setInspTab}
              media={ds.media[selected.clip.mediaId]}
              motion={motionFor(selected.clip.id)}
              onPatch={(patch, group) =>
                dispatchDoc(
                  { type: "setClip", clipId: selected.clip.id, patch },
                  group ? `${group}:${selected.clip.id}` : undefined,
                )
              }
              onDelete={deleteSelected}
              {...clipTools}
              background={
                selected.clip.type === "video" ? (
                  <div inert={!video}>{toolPanel}</div>
                ) : undefined
              }
              tracking={
                selected.clip.type === "video" ? (
                  <MotionTrackingPanel
                    clip={selected.clip as VideoClip}
                    currentTime={(() => {
                      const clip = selected.clip as VideoClip;
                      const clipStart =
                        selected.track.kind === "main"
                          ? mainStarts(mainTrack(doc).clips)[selected.index]
                          : ((clip as unknown as { start: number }).start ?? 0);
                      return Math.max(
                        0,
                        (clock.get() - clipStart) * (clip.speed ?? 1),
                      );
                    })()}
                    duration={clipLength(selected.clip)}
                    onClose={() => setInspTab("basic")}
                    onAddPoint={handleAddTrackingPoint}
                    onSelectPoint={handleSelectTrackingPoint}
                    onUpdatePoint={handleUpdateTrackingPoint}
                    onDeletePoint={handleDeleteTrackingPoint}
                    onStartTracking={handleStartTracking}
                    onCancelTracking={handleCancelTracking}
                    isTracking={isTracking}
                    trackingProgress={trackingProgress}
                    lostTargetInfo={lostTargetInfo}
                    onRecoverTarget={handleRecoverTarget}
                    onAttach={handleAttach}
                    onUpdateAttachment={handleUpdateAttachment}
                    onDetach={handleDetach}
                    onBakeKeyframes={handleBakeKeyframes}
                    onAutoDetectFace={handleAutoDetectFace}
                    onApplyDisguise={handleApplyDisguise}
                    currentDisguise={currentDisguise}
                    timelineClips={(() => {
                      const list: { id: string; name: string; type: string }[] =
                        [];
                      for (const track of doc.tracks) {
                        for (const c of track.clips) {
                          if (selected && c.id === selected.clip.id) continue;
                          let name = c.id;
                          if (c.type === "text") {
                            name = `Text: "${c.text.slice(0, 16)}"`;
                          } else if (c.type === "element") {
                            const elLook = (c as ElementClip).el;
                            name = `Element: ${elLook?.preset || elLook?.kind || "shape"}`;
                          } else if (c.type === "image") {
                            name = `Image (${c.id.slice(0, 6)})`;
                          } else if (c.type === "video") {
                            name = `Video (${c.id.slice(0, 6)})`;
                          }
                          list.push({ id: c.id, name, type: c.type });
                        }
                      }
                      return list;
                    })()}
                    onSeek={(clipT) => {
                      const clip = selected.clip as VideoClip;
                      const clipStart =
                        selected.track.kind === "main"
                          ? mainStarts(mainTrack(doc).clips)[selected.index]
                          : ((clip as unknown as { start: number }).start ?? 0);
                      clock.set(clipStart + clipT / (clip.speed ?? 1));
                    }}
                  />
                ) : undefined
              }
              info={
                video && selected.clip.type === "video" ? (
                  <details className="rounded-md border border-line px-2 py-1">
                    <summary className="flex min-h-8 cursor-pointer items-center text-xs font-semibold">
                      Video info
                    </summary>
                    <div className="pb-2 text-sm">
                      <VideoInfoCard
                        info={video.info}
                        fileName={video.fileName}
                        suggestedKey={video.suggestedKey}
                        headingId="video-info-heading"
                      />
                    </div>
                  </details>
                ) : null
              }
              smartMix={
                <SmartMixPanel
                  doc={doc}
                  onApply={handleApplySmartMix}
                  onReset={handleResetSmartMix}
                  onClose={() => setInspTab("audio")}
                  isAnalyzing={isAnalyzingMix}
                />
              }
              onSmartMix={() => setSmartMixOpen(true)}
            />
          ) : selected ? (
            <ClipPropsCard
              clip={selected.clip}
              name={selectedName}
              onPatch={(patch, group) => patchClip(selected.clip, patch, group)}
              onDelete={deleteSelected}
              {...clipTools}
              motion={motionFor(selected.clip.id)}
              onBlankTitle={() => blankTitle(selected.clip.id)}
              onBlankElement={() => blankElement(selected.clip.id)}
              onSmartMix={() => setSmartMixOpen(true)}
              onBeatMarkers={(every) => addBeatMarkers(selected.clip, every)}
            />
          ) : null}
          {!selected && (
            <ProjectCard
              canvas={doc.canvas}
              onCanvas={(c) =>
                dispatchDoc({ type: "setCanvas", patch: c }, "canvas")
              }
              onSmartMix={() => setSmartMixOpen(true)}
              smartMixActive={!!doc.smartMix?.enabled}
            />
          )}
          {/* desktop: the output settings fold in under Project (phones have their own tab) */}
          {!selected && wide && (
            <details className="panel group" data-testid="output-details">
              <summary className="flex min-h-hit cursor-pointer items-center justify-between px-3 text-sm font-semibold">
                Output settings
                <Icon
                  name="chevronDown"
                  className="size-4 text-muted transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-line p-3">
                <OutputSettings
                  output={doc.output}
                  info={single && video ? video.info : null}
                  patch={patchOutput}
                  crop={crop}
                />
                {!single && hasClips && (
                  <p className="mt-2 text-xs text-muted">
                    Size and frame rate come from the project canvas (
                    {doc.canvas.width} × {doc.canvas.height}, {doc.canvas.fps}{" "}
                    fps).
                  </p>
                )}
              </div>
            </details>
          )}
            </>
          )}
        </div>
      </SliderDensity.Provider>
    </BrandContext.Provider>
  );

  const outputCard = (
    <section
      aria-labelledby="output-title"
      className="panel flex flex-col"
      id="panel-output"
    >
      <header className="border-b border-line px-3 py-2">
        <h2 id="output-title" className="text-sm font-semibold">
          Output Settings
        </h2>
      </header>
      <div className="p-3">
        <OutputSettings
          output={doc.output}
          info={single && video ? video.info : null}
          patch={patchOutput}
          crop={crop}
        />
        {!single && hasClips && (
          <p className="mt-2 text-xs text-muted">
            Size and frame rate come from the project canvas ({doc.canvas.width}{" "}
            × {doc.canvas.height}, {doc.canvas.fps} fps).
          </p>
        )}
      </div>
    </section>
  );

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="file-input"
      multiple
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        uploadFiles(files);
      }}
    />
  );

  const silenceClip = silenceFor ? findClip(doc, silenceFor) : null;
  const silenceMedia =
    silenceClip && "mediaId" in silenceClip.clip
      ? ds.media[silenceClip.clip.mediaId]
      : null;
  const dialogs = (
    <>
      {searchOpen && (
        <SearchPalette
          open={searchOpen}
          onClose={() => {
            setSearchOpen(false);
            setStartWithVoice(false);
          }}
          autoStartVoice={startWithVoice}
          commands={searchOpen ? commands() : []}
        />
      )}
      {versionsOpen && (
        <VersionsDialog
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          projectId={sync.project?.id ?? null}
          flush={sync.flush}
          onRestore={restoreVersion}
        />
      )}
      {exportOpen && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          video={single ? video : null}
          spec={
            single && exportFormat === "pack"
              ? single.spec
              : { version: 1, ops: [], output: doc.output }
          }
          patchOutput={patchOutput}
          job={job}
          connection={connection}
          starting={starting}
          startError={startError}
          onCancel={cancel}
          onShowFinal={() => {
            setMode("clip");
            setView("final");
            setExportOpen(false);
          }}
          crop={crop}
          project={
            hasClips
              ? {
                  width: doc.canvas.width,
                  height: doc.canvas.height,
                  duration: docDuration(doc),
                  transparent:
                    doc.canvas.background === "transparent" &&
                    !doc.canvas.backdrop,
                  at: clock.get(),
                }
              : null
          }
          format={exportFormat}
          onFormat={setExportFormat}
          blockedOf={exportBlocked}
          onGenerate={(id) => {
            const v = id ? videoPreset(id) : null;
            void generate(
              undefined,
              v ? { width: v.width, height: v.height } : undefined,
            );
          }}
          onSwitchSize={(id) => {
            const v = videoPreset(id);
            if (v)
              dispatchDoc(
                {
                  type: "setCanvas",
                  patch: { width: v.width, height: v.height },
                },
                `canvas:${++editSeq.current}`,
              );
          }}
          sizeBasis={sizeBasis}
          hasSound={docHasSound}
          master={!!doc.output.master}
        />
      )}
      {helpOpen && (
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      )}
      {ttsOpen && (
        <VoiceoverStudioDialog
          open={ttsOpen}
          onClose={() => setTtsOpen(false)}
          onAdd={(m) => addToTimeline(m)}
          initialMode={voiceoverMode}
        />
      )}
      {aiSettingsOpen && (
        <AiSettingsDialog
          open={aiSettingsOpen}
          onClose={() => setAiSettingsOpen(false)}
        />
      )}
      {grokOpen && (
        <GrokImagineDialog
          onClose={() => setGrokOpen(false)}
          onAddMedia={(m) => {
            addToTimeline(m);
            setNotice(`Added ${m.fileName} to timeline.`);
          }}
        />
      )}
      {shareOpen && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          projectName={sync.project?.name ?? "My Video"}
          projectId={sync.project?.id ?? "current"}
        />
      )}
      {thumbOpen && (
        <ThumbnailDialog
          open={thumbOpen}
          onClose={() => setThumbOpen(false)}
          frameUrl={thumbFrame}
          brandColors={brand.brand?.colors ?? []}
          projectName={sync.project?.name ?? "thumbnail"}
        />
      )}
      {transcriptEditOpen && (
        <TranscriptEditorDialog
          open={transcriptEditOpen}
          onClose={() => setTranscriptEditOpen(false)}
          doc={doc}
          onCutRanges={(ranges, dropWords) => {
            // timeline seconds: cut from whichever Video 1 clips they fall on (trim and
            // speed applied); subtitles and graphics after a cut move back with it, and
            // the cut words leave the subtitle text
            dispatchDoc({ type: "cutTimelineRanges", ranges, dropWords });
          }}
        />
      )}
      {!!importTab && (
        <ImportDialog
          open={!!importTab}
          onClose={() => setImportTab(null)}
          tab={importTab ?? "computer"}
          onTab={setImportTab}
          projectShape={
            doc.canvas.height > doc.canvas.width
              ? "portrait"
              : doc.canvas.width > doc.canvas.height
                ? "landscape"
                : "any"
          }
          onChooseFiles={() => {
            setImportTab(null);
            openPicker();
          }}
          onDropFiles={(files) => {
            setImportTab(null);
            uploadFiles(files);
          }}
          onImported={(m, add) => {
            setMetas((x) => ({ ...x, [m.id]: m }));
            void assets.refresh();
            if (add) addToTimeline(m);
          }}
        />
      )}
      {!!genImage && (
        <GenerateImageDialog
          open={!!genImage}
          onClose={() => setGenImage(null)}
          gemini={gemini}
          purpose={genImage ?? "picture"}
          canvas={doc.canvas}
          onMade={(m) => {
            setMetas((x) => ({ ...x, [m.id]: m }));
            void assets.refresh();
          }}
          onAddToTimeline={(m) => {
            addToTimeline(m);
            setGenImage(null);
          }}
          onUseAsBackground={(m) => {
            dispatchDoc(
              {
                type: "setCanvas",
                patch: { backdrop: { kind: "media", mediaId: m.id } },
              },
              `backdrop:${++editSeq.current}`,
            );
            setGenImage(null);
            setMode("program");
          }}
        />
      )}
      {genVideoOpen && (
        <GenerateVideoDialog
          open={genVideoOpen}
          onClose={() => setGenVideoOpen(false)}
          gemini={gemini}
          canvas={doc.canvas}
          pictures={assets.items ?? []}
          job={veo.id ? veo.job : null}
          onStarted={(id) => veo.setId(id)}
          onAddToTimeline={(m, atPlayhead) => {
            addToTimeline(m, atPlayhead ? { at: clock.get() } : {});
            veo.setId(null);
            setGenVideoOpen(false);
          }}
          onNew={() => veo.setId(null)}
        />
      )}
      {textToVideoOpen && (
        <TextToVideoDialog
          open={textToVideoOpen}
          onClose={() => setTextToVideoOpen(false)}
          gemini={gemini}
          canvas={doc.canvas}
          onStarted={(id) => {
            veo.setId(id);
            setGenVideoOpen(true);
          }}
        />
      )}
      {bRollOpen && (
        <BRollDialog
          open={bRollOpen}
          onClose={() => setBRollOpen(false)}
          gemini={gemini}
          canvas={doc.canvas}
          onAddToTimeline={(m) => {
            addToTimeline(m, { overlay: true });
            setNotice("B-Roll cutaway added to timeline.");
          }}
        />
      )}
      {smartCropOpen && (
        <SmartCropDialog
          open={smartCropOpen}
          onClose={() => setSmartCropOpen(false)}
          clip={aiVideo}
          source={
            aiVideo && aiVideo.type === "video" && ds.media[aiVideo.mediaId]
              ? { width: ds.media[aiVideo.mediaId].width, height: ds.media[aiVideo.mediaId].height }
              : null
          }
          onApplyCrop={(crop, note) => {
            if (!aiVideo) return;
            const group = `smart-crop:${++editSeq.current}`;
            dispatchDoc(
              {
                type: "setClip",
                clipId: aiVideo.id,
                patch: {
                  transform: {
                    ...(aiVideo.transform ?? {
                      fit: "fit",
                      x: 0,
                      y: 0,
                      scale: 1,
                    }),
                    crop,
                  },
                },
              },
              group,
            );
            setNotice(`Smart Reframe applied. ${note}`);
          }}
        />
      )}
      {audioTranslatorOpen && (
        <DubbingDialog
          open={audioTranslatorOpen}
          onClose={() => setAudioTranslatorOpen(false)}
          gemini={gemini}
          clip={aiSound && (aiSound.type === "video" || aiSound.type === "audio") ? aiSound : null}
          clipStart={(() => {
            const f = aiSound ? findClip(doc, aiSound.id) : null;
            if (!f) return 0;
            return f.track.kind === "main"
              ? mainStarts(mainTrack(doc).clips)[f.index]
              : (f.clip as { start: number }).start;
          })()}
          onShow={() => setAudioTranslatorOpen(true)}
          onDone={(r, opts) => {
            // the dubbed lines on the sound tracks, the original turned down, as one undo step
            const group = `dub:${++editSeq.current}`;
            for (const line of r.lines) addToTimeline(line.meta, { at: line.at, group });
            if (opts.duck && aiSound)
              dispatchDoc({ type: "setClip", clipId: aiSound.id, patch: { volume: 0.2 } }, group);
            if (opts.subtitles)
              addCaptions(`Subtitles (${languageLabel(r.language)})`.slice(0, 40), r.captions);
            setNotice(
              `Dubbed ${r.lines.length} lines into ${languageLabel(r.language)}.${opts.duck ? " The original is turned down to 20% underneath." : ""}`,
            );
          }}
        />
      )}
      {avatarOpen && (
        <AiAvatarDialog
          open={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          gemini={gemini}
          onAddToTimeline={(m) => {
            addToTimeline(m, { overlay: true });
            setNotice("AI Presenter added to timeline.");
          }}
        />
      )}
      {extendVideoOpen && (
        <ExtendVideoDialog
          open={extendVideoOpen}
          onClose={() => setExtendVideoOpen(false)}
          clip={aiVideo}
          gemini={gemini}
          onStarted={(id) => {
            veo.setId(id);
            setGenVideoOpen(true);
          }}
        />
      )}
      {objectRemoverOpen && (
        <ObjectRemoverDialog
          open={objectRemoverOpen}
          onClose={() => setObjectRemoverOpen(false)}
          clip={aiPicture}
          onApplyErase={(objectDesc) => {
            if (!aiPicture) return;
            const pid = `w${++editSeq.current}`;
            const group = `object-remove:${++editSeq.current}`;
            dispatchDoc(
              {
                type: "setClip",
                clipId: aiPicture.id,
                patch: {
                  patches: [...(aiPicture.patches ?? []), newPatch(pid)],
                },
              },
              group,
            );
            // (honest: a cover box that blends the pixels around it, not AI inpainting)
            setNotice(
              `Added a cover box for “${objectDesc}”. Move and resize it on the preview over the object; it blends the pixels around it (Beta, not AI inpainting).`,
            );
          }}
        />
      )}
      {upscaleOpen && (
        <UpscaleEnhanceDialog
          open={upscaleOpen}
          onClose={() => setUpscaleOpen(false)}
          clip={aiVideo}
          onApplyEnhance={({ targetRes, sharpen }) => {
            if (!aiVideo) return;
            const group = `upscale:${++editSeq.current}`;
            const color = { ...(aiVideo.color ?? {}), sharpen };
            dispatchDoc(
              { type: "setClip", clipId: aiVideo.id, patch: { color } },
              group,
            );
            // (what really happens: Lanczos enlarging + sharpening in the export at the size you pick)
            setNotice(
              `Enhance is on for this clip: sharper, and enlarged with high-quality Lanczos scaling. For a ${targetRes} file, pick ${targetRes === "4K" ? "3840 px" : "1920 px"} in Export ▸ All formats & settings.`,
            );
          }}
        />
      )}
      {!!recordMode && (
        <RecordDialog
          open={!!recordMode}
          initialMode={recordMode ?? "camera"}
          onClose={() => setRecordMode(null)}
          maxSeconds={LIMITS.maxDurationSec}
          onAdd={addRecording}
        />
      )}
      {!!silenceClip && (
        <SilenceDialog
          open={!!silenceClip}
          onClose={() => {
            setSilenceFor(null);
            setSilenceMarks(null);
          }}
          videoId={silenceMedia?.id ?? null}
          hasAudio={!!silenceMedia?.hasAudio}
          segments={
            silenceClip &&
            (silenceClip.clip.type === "video" ||
              silenceClip.clip.type === "audio")
              ? [
                  {
                    id: silenceClip.clip.id,
                    in: silenceClip.clip.in,
                    out: silenceClip.clip.out,
                  },
                ]
              : []
          }
          onPreview={setSilenceMarks}
          onApply={(ranges) => {
            if (silenceFor)
              dispatchDoc({ type: "removeRanges", clipId: silenceFor, ranges });
            setSelectedId(null);
          }}
        />
      )}
      {!!highlightsFor && (
        <HighlightsDialog
          open={!!highlightsFor}
          onClose={() => setHighlightsFor(null)}
          video={
            assets.items?.find((a) => a.id === highlightsFor) ??
            (ds.media[highlightsFor]
              ? ({
                  id: highlightsFor,
                  fileName: "Video",
                  info: ds.media[highlightsFor],
                } as any)
              : null)
          }
          hasAudio={!!ds.media[highlightsFor]?.hasAudio}
          geminiReady={gemini === "ready" || gemini === "fake"}
          onApplyReel={(selectedHighlights, targetAspect) => {
            const group = `ai-tool:highlight-reel:${++editSeq.current}`;
            const targetMediaId = highlightsFor!;
            const mInfo = ds.media[targetMediaId];
            if (!mInfo) return;

            const plainOps = () =>
              DEFAULT_SPEC.ops.map((o) => ({ ...o, enabled: false }));
            const newClips: MainClip[] = selectedHighlights.map((h, i) => {
              const base = videoClipOf(
                `hl-${i + 1}-${newId(doc)}`,
                { ...mInfo, id: targetMediaId },
                plainOps(),
                h.start,
                h.end,
              );
              return targetAspect === "vertical"
                ? {
                    ...base,
                    transform: { ...base.transform, fit: "fill" as const },
                  }
                : base;
            });

            const newCanvas = {
              ...doc.canvas,
              ...(targetAspect === "vertical"
                ? { width: 1080, height: 1920, fit: "fill" as const }
                : targetAspect === "square"
                  ? { width: 1080, height: 1080, fit: "fill" as const }
                  : {}),
            };

            const main = mainTrack(doc);
            const newTracks: Track[] = doc.tracks.map((t) =>
              t.id === main.id ? ({ ...t, clips: newClips } as Track) : t,
            );
            const newDoc: TimelineDoc = {
              ...doc,
              canvas: newCanvas,
              tracks: newTracks,
            };

            dispatchDoc(
              { type: "replaceDoc", doc: newDoc, media: ds.media },
              group,
            );
            seekTimeline(0);
            setNotice(
              `🎬 Created ${selectedHighlights.length}-clip highlight reel on timeline!`,
            );
          }}
          onInsertClip={(h) => {
            const targetMediaId = highlightsFor!;
            const foundAsset = assets.items?.find(
              (a) => a.id === targetMediaId,
            );
            const mediaLite =
              ds.media[targetMediaId] ??
              (foundAsset ? mediaLiteOf(foundAsset) : null);
            if (!mediaLite) return;
            const cid = newId(doc);
            const group = `ai-tool:insert-highlight:${++editSeq.current}`;
            dispatchDoc(
              {
                type: "addMedia",
                media: mediaLite,
                options: {
                  at: clock.get(),
                  id: cid,
                },
              },
              group,
            );
            dispatchDoc(
              {
                type: "setClip",
                clipId: cid,
                patch: { in: h.start, out: h.end },
              },
              group,
            );
            setNotice(`Added highlight "${h.title}" to timeline!`);
          }}
          onSaveAsset={async (h, targetAspect) => {
            const targetMediaId = highlightsFor!;
            const res = await fetch(`/api/videos/${targetMediaId}/extract`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                start: h.start,
                end: h.end,
                title: h.title,
                aspect: targetAspect,
              }),
            });
            if (res.ok) {
              await assets.refresh();
              setNotice(`Saved "${h.title}" to My Assets!`);
            } else {
              setNotice("Failed to save highlight to My Assets.");
            }
          }}
          onOpenSettings={() => setAiSettingsOpen(true)}
        />
      )}
      {storageModalOpen && (
        <StorageManagerModal onClose={() => setStorageModalOpen(false)} />
      )}
      {sync.pendingRecovery && (
        <RecoveryNotice
          recovery={sync.pendingRecovery}
          onRecover={(recDoc) => {
            dispatchDoc(
              { type: "replaceDoc", doc: recDoc, media: ds.media },
              `recovery:${++editSeq.current}`,
            );
            sync.dismissRecovery();
            setNotice("Restored unsaved edits from previous session.");
          }}
          onDismiss={sync.dismissRecovery}
        />
      )}
      {aiTooltipState.isOpen && (
        <UniversalAiTooltip
          isOpen={aiTooltipState.isOpen}
          onClose={() => setAiTooltipState({ isOpen: false })}
          anchor={aiTooltipState.anchor}
          target={aiTooltipState.target}
          initialMediaType={aiTooltipState.initialMediaType}
          projectAssets={Object.values(ds.media)}
          onOpenStock={() => {
            setAiTooltipState({ isOpen: false });
            setImportTab("pixabay");
          }}
          onGenerate={(req) => {
            void aiGenManager.startGeneration(req);
            setNotice(`Generating AI ${req.mediaType} for timeline...`);
          }}
        />
      )}
    </>
  );

  const timeline = (
    <Timeline
      doc={doc}
      media={ds.media}
      clock={clock}
      selectedId={selectedId}
      onSelect={selectClip}
      onSeek={seekTimeline}
      onSplit={(clipId, t) => dispatchDoc({ type: "split", clipId, t })}
      onDelete={(clipId) => {
        const nextDoc = deleteClip(doc, clipId);
        const nextDur = docDuration(nextDoc);
        dispatchDoc({ type: "deleteClip", clipId });
        if (clipId === selectedId) setSelectedId(null);
        if (clock.get() > nextDur) clock.set(Math.max(0, nextDur));
      }}
      onDuplicate={(clipId) => dispatchDoc({ type: "duplicate", clipId })}
      onCopy={(clipId) => copyClip(clipId)}
      onCut={(clipId) => copyClip(clipId, true)}
      onPaste={hasCopy ? () => pasteAt(clock.get()) : null}
      onTrim={(clipId, edge, to, group) =>
        dispatchDoc({ type: "trim", clipId, edge, to }, group)
      }
      onMove={(clipId, to, group) =>
        dispatchDoc({ type: "move", clipId, to }, group)
      }
      onDropMedia={dropMedia}
      onDropMeme={(item, trackId, at, index) =>
        void addMemeToTimeline(item, { trackId, at, index })
      }
      onDropFile={uploadFile}
      onSetTrack={(trackId, patch) =>
        dispatchDoc({ type: "setTrack", trackId, patch })
      }
      onAddTrack={(kind) => dispatchDoc({ type: "addTrack", kind })}
      onRemoveTrack={(trackId) => dispatchDoc({ type: "removeTrack", trackId })}
      onReorderTrack={(sourceId, targetId, position) =>
        dispatchDoc({ type: "reorderTrack", sourceId, targetId, position })
      }
      onSilences={(clipId) => setSilenceFor(clipId)}
      onDetachAudio={(clipId) =>
        dispatchDoc({ type: "toggleAudioDetach", clipId, media: ds.media })
      }
      onAttachAudio={(clipId) =>
        dispatchDoc({ type: "attachAudio", clipId })
      }
      onToggleAudioDetach={(clipId) =>
        dispatchDoc({ type: "toggleAudioDetach", clipId, media: ds.media })
      }
      onAddMarker={(t, label, color) =>
        dispatchDoc({ type: "addMarker", t, label, color })
      }
      onDeleteMarker={(markerId) =>
        dispatchDoc({ type: "deleteMarker", markerId })
      }
      onUpdateMarker={(markerId, patch) =>
        dispatchDoc({ type: "updateMarker", markerId, patch })
      }
      onDeleteMany={(clipIds) => {
        dispatchDoc({ type: "deleteClips", clipIds });
        setSelectedId(null);
      }}
      onCloseAllGaps={() => dispatchDoc({ type: "closeAllGaps" })}
      onCrop={startCrop}
      onPatchClip={(clipId, patch) => {
        dispatchDoc(
          { type: "setClip", clipId, patch },
          `clip:${++editSeq.current}`,
        );
        // Speed / Reverse from the timeline: the inspector shows its Speed tab
        if ("speed" in patch || "reversed" in patch) {
          setSelectedId(clipId);
          setInspTab("speed");
        }
      }}
      onFreeze={(clipId, t) => void freezeAt(clipId, t)}
      onKeyframe={(clipId, t, op, group) =>
        dispatchDoc(
          { type: "keyframe", clipId, t, op },
          group ?? `key:${op.kind}:${clipId}:${++editSeq.current}`,
        )
      }
      onMask={maskClip}
      onTransition={openTransition}
      onInsertBlank={addBlankAt}
      onCopyStyle={copyClipStyle}
      onPasteStyle={pasteClipStyle}
      hasCopiedStyle={hasCopiedStyle}
      onCancelGeneration={aiGenManager.cancelGeneration}
      onRetryGeneration={aiGenManager.retryGeneration}
      onOpenAiGen={(params) => {
        setAiTooltipState({
          isOpen: true,
          anchor: params.anchor,
          target: params.target,
        });
      }}
      selectedTransition={selTransition}
      onChoose={openPicker}
      highlights={
        silenceFor && silenceMarks
          ? { clipId: silenceFor, ranges: silenceMarks }
          : null
      }
      timelineRef={timelineApiRef}
      selectedClipIds={selectedClipIds}
      onSelectClips={onSelectClips}
      onMotionTracking={() => {
        if (selected?.clip.type === "video") {
          setInspTab("tracking");
        } else {
          const main = mainTrack(doc);
          const firstVid = main.clips.find((c) => c.type === "video");
          if (firstVid) {
            setSelectedId(firstVid.id);
            setInspTab("tracking");
          }
        }
      }}
      isMotionTrackingOpen={inspTab === "tracking"}
    />
  );

  if (workspaceView === "templates") {
    return (
      <div className="relative flex h-dvh flex-col overflow-hidden bg-app">
        {topBar}
        {fileInput}
        <div className="relative flex min-h-0 flex-1 gap-2 p-2">
          <Rail
            wide={wide}
            active="templates"
            onSelect={onRail}
            onDropOnTab={handleRailDrop}
          />
          <div className="flex-1 overflow-hidden panel">
            <TemplateHub
              onUseTemplate={async (template, custom) => {
                setWorkspaceView("studio");
                await applyBroadcastTemplate(template, custom);
              }}
              onClose={() => setWorkspaceView("studio")}
            />
          </div>
        </div>
        {dialogs}
      </div>
    );
  }

  if (!wide) {
    // phones and small tablets: preview on top, then one section at a time
    return (
      <div className="flex min-h-dvh flex-col bg-app">
        {topBar}
        {fileInput}
        <main
          id="main"
          className={`p-2 ${hasClips ? "sticky top-0 z-90 bg-app" : ""}`}
        >
          {previewArea}
        </main>
        <Rail
          wide={false}
          active={phoneTab}
          onSelect={onRail}
          onDropOnTab={handleRailDrop}
        />
        <div className="flex flex-col gap-2 p-2">
          {side}
          {phoneTab === "edit" && (
            <>
              {hasClips && <div className="h-64">{timeline}</div>}
              {inspector}
            </>
          )}
          {phoneTab === "output" && outputCard}
          {phoneTab === "ai" && (
            <div className="flex h-[36rem] flex-col">{aiPanel}</div>
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  // desktop: one fixed screen (nothing scrolls but the panels themselves). "relative" everywhere a panel
  // scrolls, so screen-reader-only labels inside can't stretch the page.
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-app">
      {topBar}
      {fileInput}
      <div
        className="relative flex min-h-0 flex-1 gap-2 p-2"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.target === e.currentTarget && (selectedId || logoShown)) {
            selectClip(null);
          }
        }}
      >
        <Rail
          wide
          active={focus ? null : railActive}
          onSelect={onRail}
          onDropOnTab={handleRailDrop}
        />
        {!focus && side}
        {!focus && side && (
          <PanelSplitter
            label="Panel width"
            side="left"
            value={leftW}
            onChange={setLeftW}
            min={200}
            max={560}
            reset={256}
          />
        )}
        <main
          id="main"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            if (e.target === e.currentTarget && (selectedId || logoShown)) {
              selectClip(null);
            }
          }}
        >
          {previewArea}
          <TimelineResizer height={timelineH} onChange={setTimelineH} />
          <div className="shrink-0" style={{ height: timelineH }}>
            {timeline}
          </div>
        </main>
        {focus ? null : aiOpen ? (
          <PanelSplitter
            label="AI Tools width"
            side="right"
            value={aiW}
            onChange={setAiW}
            min={420}
            max={1100}
            reset={defaultAiW()}
          />
        ) : (
          <PanelSplitter
            label="Inspector width"
            side="right"
            value={rightW}
            onChange={setRightW}
            min={260}
            max={560}
            reset={xwide ? 336 : 304}
          />
        )}
        {focus ? null : aiOpen ? (
          <aside
            aria-label="AI Tools panel"
            className="relative flex shrink-0 flex-col"
            style={{ width: aiW }}
          >
            {aiPanel}
          </aside>
        ) : (
          <aside
            aria-label="Inspector"
            className="relative flex shrink-0 flex-col gap-2"
            style={{ width: rightW }}
          >
            {/* (export lives in the top bar: Export ▾ and its dialog) */}
            <div
              data-testid="inspector-scroll"
              className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
            >
              {inspector}
            </div>
          </aside>
        )}
      </div>
      {dialogs}
    </div>
  );
}
