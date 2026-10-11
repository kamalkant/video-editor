# Walkthrough: Full Performance & Runtime Optimization

We conducted an exhaustive full-stack performance audit and completed all optimizations agreed upon during the planning phase: unblocking production builds, code-splitting heavyweight modal dialogs via `next/dynamic`, decoupling the Timeline playhead needle to eliminate 60/120 FPS React DOM thrashing, and removing WebGL garbage collection allocations.

---

## 1. Key Results & Performance Impact

| Metric                                  | Before Optimization                      | After Optimization                      | Improvement                 |
| :-------------------------------------- | :--------------------------------------- | :-------------------------------------- | :-------------------------- |
| **First Contentful Paint (FCP)**        | `392.0 ms`                               | **`172.0 ms`**                          | 🚀 **56.1% faster**         |
| **Time to First Byte (TTFB)**           | `99.7 ms`                                | **`63.5 ms`**                           | 📉 **36.3% faster**         |
| **First Paint (FP)**                    | `240.0 ms`                               | **`124.0 ms`**                          | ⚡ **48.3% faster**         |
| **DOM Interactive**                     | `217.7 ms`                               | **`92.6 ms`**                           | ⚡ **57.5% faster**         |
| **Load Event End**                      | `717.2 ms`                               | **`149.0 ms`**                          | ⚡ **79.2% faster**         |
| **Timeline Re-renders During Playback** | 60–120 full tree renders/sec             | **~5 throttled renders/sec**            | 📉 **>90% CPU render drop** |
| **Playhead Needle Motion**              | Coupled with entire tree                 | **Isolated unthrottled 60/120 FPS**     | 🧈 Silky smooth gliding     |
| **WebGL Matrix Allocations**            | `new Float32Array` + `flatMap` per frame | **0 allocations (preallocated buffer)** | 🧹 Zero GC spikes           |
| **Production Build Status**             | 🔴 44 TypeScript build blockers          | 🟢 **100% Passing (`npm run build`)**   | ⚡ Compiles in 2.8s         |
| **Unit & Integration Tests**            | 41 suites                                | **41 passed, 342 tests (100%)**         | 🟢 2.6s run time            |

---

## 2. Changes Made

### 2.1 Production Build & TypeScript Fixes

- [probe.ts](file:///Users/kamalkant/Desktop/VDO/lib/ffmpeg/probe.ts): Added optional `size?: number` to `VideoInfo` to support asset size display and sorting.
- [Studio.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/Studio.tsx): Fixed `playhead` reference in `EffectsPanel` to use `clock.get()` and correctly resolved `mainClipAt(doc, clock.get())?.clip`.
- [Timeline.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/Timeline.tsx): Corrected type narrowing on overlay track clips and removed unreachable `"audio"` checks in `trackIcon`.
- [storage.ts](file:///Users/kamalkant/Desktop/VDO/lib/storage.ts) & [library.ts](file:///Users/kamalkant/Desktop/VDO/lib/library.ts): Added `/*turbopackIgnore: true*/` to dynamic path resolution to resolve Turbopack filesystem tracing warnings.
- [tests/unit/](file:///Users/kamalkant/Desktop/VDO/tests/unit/): Updated mock typings across `timeline-space.test.ts`, `overlay-track-audio.test.ts`, `editing-tools-sync.test.ts`, `drag-drop-preview.test.ts`, and `projects-assets-view-multiselect.test.ts`.

### 2.2 Client Bundle Code Splitting ([Studio.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/Studio.tsx))

- Converted 11 modal dialogs and secondary galleries into `next/dynamic` lazy chunks with `{ ssr: false }`:
  - `ExportDialog`, `HelpDialog`, `VersionsDialog`, `SilenceDialog`, `SearchPalette`, `TtsDialog`, `GenerateImageDialog`, `GenerateVideoDialog`, `AiSettingsDialog`, `ImportDialog`, `RecordDialog`, `TemplatesGallery`.
- Rendered dialogs conditionally based on open state so that JavaScript is only fetched over the wire when the user invokes the feature.

### 2.3 Timeline Playhead Decoupling ([Timeline.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/Timeline.tsx))

- Introduced `<PlayheadNeedle>`: An isolated component subscribing directly to the playback `Clock` at 60/120 FPS.
- Introduced `useThrottledClock`: Throttles the parent `Timeline`'s React subscription during active playback (updating editing tool state every ~150ms and immediately upon pause/scrub), eliminating continuous re-rendering of all tracks, lanes, clips, and waveforms.

### 2.4 WebGL Shader Allocation Optimization ([glLook.ts](file:///Users/kamalkant/Desktop/VDO/lib/player/glLook.ts))

- Replaced per-frame `new Float32Array(...)` and `flatMap` matrix allocations with a pre-allocated `Float32Array(16)` buffer (`matBuf`) on the `GlLook` instance, eliminating garbage collection stalls during 60 FPS video playback.

---

## 3. Verification & Validation

### Automated Verification

- `npm run typecheck` (`tsc --noEmit`): **Exited with code 0 (0 errors)**.
- `npm run test:unit`: **All 41 test files and 342 tests passed in 2.63s**.
- `npm run build`: **Next.js 16.3.6 (Turbopack) production build passed in 2.8s**.

### Browser Verification

- Verified on `http://127.0.0.1:3000/` using live performance APIs.
- First Contentful Paint dropped from 392ms to **172ms**.
- Verified on-demand lazy loading by opening the `HelpDialog` dynamically:

![Help Dialog Lazy Loaded](file:///Users/kamalkant/.gemini/antigravity-ide/brain/cf916e33-ad41-4dca-ad5b-869fb5c7ab48/help_dialog_loaded_1790712535094.png)

---

## 4. Authentication, Per-User Permissions, Session Sync & Rebranding

### 4.1 Mandatory Login & Direct Editor Access

- **Unauthenticated Redirection**: Added a server-side authentication gate in [`app/page.tsx`](file:///Users/kamalkant/Desktop/VDO/app/page.tsx). Any unauthenticated visitor visiting `/` is automatically redirected with HTTP 307 to `/login?next=/`.
- **Regular User Routing**: Regular authenticated users (`role: 'user'`) are routed directly to the Video Editor (`/`) after login, without unnecessary stops in the administrative panel.
- **Clean Login Screen**: Removed the "Default Super Admin Credentials" demo banner from [`app/login/page.tsx`](file:///Users/kamalkant/Desktop/VDO/app/login/page.tsx).

### 4.2 Per-User Feature & Tool Granular Control

- **Database Schema**: Added `user_feature_overrides` table in [`lib/db/schema.ts`](file:///Users/kamalkant/Desktop/VDO/lib/db/schema.ts) with `(user_id, tool_id)` primary key, `enabled` state (0/1), and audit timestamps.
- **Resolution Hierarchy**: Implemented in [`lib/db/features.ts`](file:///Users/kamalkant/Desktop/VDO/lib/db/features.ts):
  1. _Global Master Switch_ (`enabled_global = 0` restricts access unless `super_admin`).
  2. _Individual User Override_ (`user_feature_overrides` can explicitly Grant or Revoke access per user).
  3. _Role Default_ (`allowed_roles` JSON array on the feature flag).
- **Admin Users UI**: Added a dedicated **Tools** modal in [`app/admin/users/page.tsx`](file:///Users/kamalkant/Desktop/VDO/app/admin/users/page.tsx). Administrators can inspect and toggle access for all 12 tools (Library, Elements, Effects, AI Tools, Text, Transitions, Audio, Subtitles, Templates, Brand Kit, Background, Export) with 3-way segmented buttons:
  - **Default**: Resets to the user's role permissions.
  - **Grant**: Explicitly enables the tool for this user.
  - **Revoke**: Explicitly blocks the tool for this user.
- **REST Endpoints**:
  - `GET /api/admin/users/[id]/features`: Returns all tools, user overrides, and computed effective permissions.
  - `PATCH /api/admin/users/[id]/features`: Updates tool override (`enabled: true | false | null`) with audit logging.

### 4.3 Session State Sync & Profile Avatar

- **Stale State Elimination**: Fixed client-side auth context caching by synchronizing `initialUser` in [`lib/auth/AuthContext.tsx`](file:///Users/kamalkant/Desktop/VDO/lib/auth/AuthContext.tsx) and navigating with full location href on login and on the Admin "Open Studio" button in [`app/admin/layout.tsx`](file:///Users/kamalkant/Desktop/VDO/app/admin/layout.tsx).
- **User Profile Avatar**: TopBar's [`UserMenu.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/UserMenu.tsx) reliably displays user initials and role badge, with a smooth loading skeleton state.

### 4.4 Rebranding

- Rebranded all user-facing branding and titles from **VDO** to **Studio** across `app/login/page.tsx`, `app/signup/page.tsx`, `app/admin/layout.tsx`, and `app/layout.tsx`.

---

## 5. Timeline Layer Dragging & Vertical Reordering

### 5.1 Track Layer Reordering

- **Drag Handle (`⋮⋮`)**: Added a dedicated drag handle icon on each track header (for all overlay and audio tracks) in [`components/studio/Timeline.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/Timeline.tsx).
- **Live Insertion Guide**: Displays a prominent blue drop indicator line (`-top-0.5` or `-bottom-0.5`) across both the track headers column and the timeline lanes to give instant visual feedback on target placement (`before` / `after`).
- **Category Constraints**: Implemented in [`lib/edit/docEdit.ts`](file:///Users/kamalkant/Desktop/VDO/lib/edit/docEdit.ts) `reorderTracks`:
  - Overlay tracks reorder exclusively among overlay tracks (re-stacking visual z-order on the canvas).
  - Audio tracks reorder exclusively among audio tracks.
  - The magnetic Main Track (`Video 1`) remains fixed as the anchor between video layers and audio layers.
- **Dynamic Track Numbering**: Track names automatically recalculate dynamically based on visual layer height (`Overlay N` down to `Overlay 1`), while preserving any custom names assigned by the user.

### 5.2 Vertical Clip Dragging Across Layers

- **Cross-Layer Movement**: Clips can be dragged up and down across tracks.
- **Auto-Track Creation**:
  - Dragging an overlay clip above the topmost overlay track automatically provisions a new overlay track at the top (`"new-overlay"`).
  - Dragging an audio clip below the lowest audio track provisions a new audio track at the bottom (`"new-audio"`).
  - Dropping onto an existing occupied timestamp automatically resolves collisions cleanly.
- **Main Track & Overlay Interop**:
  - Video and image clips can be dragged from Main to Overlay tracks (converting to timestamped `start` and snapping Main closed).
  - Overlay video and image clips can be dragged into Main track (inserting at magnetic position).

---

## 6. Broadcast News Graphics, Motion Elements & Brand Kit Video Library

### 6.1 Real-Time Animated Motion Elements

- **`live-pulse`**: Continuous real-time animated LIVE broadcast beacon featuring expanding radar ripple waves that fade out gracefully, surrounding an inner high-intensity beacon core with editable "LIVE" or custom status words.
- **`audio-wave`**: 60 FPS broadcast equalizer wave bars simulating live audio activity with multi-harmonic sine waves, complete with header labeling ("LIVE AUDIO FEED").
- **`market-ticker`**: Real-time ticker crawl displaying stock/crypto market indices (Dow, S&P 500, NASDAQ, BTC, Crude Oil) with green/red directional indicators.
- **60 FPS Canvas Rendering**: Hooked into [`lib/elements/draw.ts`](file:///Users/kamalkant/Desktop/VDO/lib/elements/draw.ts) `movesByItself` and [`ProgramPlayer.tsx`](file:///Users/kamalkant/Desktop/VDO/components/editor/ProgramPlayer.tsx) to render continuous frame-accurate animations during active playback and timeline scrubbing.

### 6.2 High-Impact Broadcast Lower Thirds & Bug Overlays

- **`breaking-lower-third`**: Two-tier broadcast graphic featuring an angled category tab ("BREAKING NEWS"), a dark translucent headline banner with a left vertical color accent, primary headline typography, and secondary live story sub-headline.
- **`location-bug`**: Broadcast location & timestamp bug ("NEW DELHI · LIVE 10:45 AM") with an integrated live indicator dot and sleek translucent pill geometry.
- **`developing`**: High-urgency amber badge with broadcast slant.
- **`fact-check`**: Verified green badge with rounded corners and bold status typography.
- **`special-report`**: Regal purple slanted badge for high-priority news updates.

### 6.3 Element Inspector Controls ([ClipCards.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/ClipCards.tsx))

- Added full editing support for lower thirds and location bugs:
  - Tab label input (e.g. "BREAKING NEWS").
  - Primary headline and sub-headline text inputs.
  - Location and timestamp / live status inputs.
  - Dedicated color pickers for tab background, headline banner background, tab text color, headline text color, and sub-headline / timestamp color.

### 6.4 Brand Kit Video Library & Direct Video Uploads ([BrandPanel.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/BrandPanel.tsx))

- **Brand Videos Library**:
  - Supports up to 20 reusable brand video assets stored persistently within the Brand Kit schema.
  - Video cards with duration badges, filenames, and resolution metadata.
  - 1-click timeline actions: **Insert at playhead**, **At start**, **At end**, **Set as intro**, and **Set as outro**.
- **Direct Video Uploads**:
  - Direct video file uploader for Brand Videos directly within the Brand Kit panel (bypassing the need to navigate to My Assets first).
  - Direct video file uploaders for **Intro clip** and **Outro clip** directly inside the Intro & Outro section.
- **Storage Protection**:
  - Updated [`lib/storage.ts`](file:///Users/kamalkant/Desktop/VDO/lib/storage.ts) to mark Brand Kit videos as protected project references, exempting them from automatic cleanup sweeps.

---

## 7. Preview Canvas Top-Most Layer Direct Selection

### 7.1 The Issue

- When a video was selected in the preview player, clicking directly on shapes, text, or overlay layers sitting on top of the video failed to select them.
- The video remained selected, and the mouse pointer dragged the video instead of switching to the clicked overlay.
- Users were previously forced to click outside the stage to unselect the video before they could select any overlay.

### 7.2 Root Cause & Resolution

- **Root Cause**: In [`components/editor/ProgramPlayer.tsx`](file:///Users/kamalkant/Desktop/VDO/components/editor/ProgramPlayer.tsx) `onStageDown`, hit-testing prioritized the currently selected clip (`inside(selRect, pt) && selLayer ? selLayer : ...`). Because a video's bounding rectangle spans the entire canvas, every click anywhere on the canvas returned the video.
- **Resolution**:
  - Replaced the biased ternary check with visual z-order search:
    ```typescript
    const hit = [...visible].reverse().find((l) => inside(rectOf(l), pt));
    ```
  - Clicks now hit-test layers in front-to-back order:
    1. Clicking any overlay (shape, sticker, text, or PIP video) selects and immediately initiates dragging on that overlay.
    2. Clicking background video areas (where no overlay covers it) selects the video.
    3. Clicking empty canvas space deselects the active clip.
    4. Clicking an already-selected layer continues to drag it seamlessly.
- **Automated Tests**: Added [`tests/unit/preview-selection.test.ts`](file:///Users/kamalkant/Desktop/VDO/tests/unit/preview-selection.test.ts) covering stacked layer hit-testing, overlapping overlays, and background video selection.

---

## 8. Camera Viewfinder & HUD Elements Suite

### 8.1 Overview & Reference Matching

Matching the reference camera viewfinder HUD requested by the user, we implemented a full suite of camera framing, autofocus, battery indicators, and retro camcorder HUD elements:

- **`camera-viewfinder`**: Full cinematic 4K camera viewfinder with 4 outer corner brackets, blinking red REC dot (1s cycle), top-right battery indicator with dynamic color-graded level bar and terminal nub, center autofocus brackets with red crosshair (`+`), bottom-left live running timecode (`HH:MM:SS`), bottom-center lens aperture meter with tick scale and pointer (`f 1.8`), and bottom-right resolution badge (`4K HD`).
- **`focus-target`**: Dedicated camera autofocus target box with 4 corner brackets and a pulsing center crosshair (`+`) with subtle animated focus breathing.
- **`camera-battery`**: Standalone modular battery HUD indicator with customizable percentage level (0–100%), color grading (green >40%, amber 20–40%, red <20%), and custom shell color.
- **`cctv-hud`**: Surveillance / security camera overlay with green night-vision HUD styling, custom camera label ("CAM 02"), REC indicator, and "1080P" badge.
- **`camcorder-vhs`**: Retro VHS tape camcorder overlay with amber HUD brackets, "PLAY ▶" status, "SP" recording speed mode, and "AUTO" resolution badge.

### 8.2 Elements Panel Organization ([ElementsPanel.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/ElementsPanel.tsx))

- Added a dedicated `"camera"` group labeled **`"Camera & Viewfinders"`** positioned right below News Graphics for prominent access.
- Updated `thumbLook` to display viewfinders at proper 16:9 widescreen aspect and battery indicators at 2.2 aspect ratio.
- Added comprehensive search keywords (`camera`, `viewfinder`, `hud`, `rec`, `crosshair`, `battery`, `focus`, `cctv`, `vhs`, `4k`).

### 8.3 Element Inspector Controls ([ClipCards.tsx](file:///Users/kamalkant/Desktop/VDO/components/studio/ClipCards.tsx))

- **Mode / Camera ID**: Directly editable text (e.g. "REC", "CAM 02", "PLAY ▶", "STANDBY").
- **Aperture / Sub-text**: Lens aperture gauge text (e.g. `f 1.8`, `f 2.8`, `SP`, `REC [●]`).
- **Resolution Badge**: Resolution tag text (e.g. `4K HD`, `1080P`, `AUTO`).
- **Battery Charge**: Labeled slider (0% to 100%) that updates the HUD battery bar in real-time.
- **Timecode Start**: Labeled slider (0s to 3600s) to calibrate the starting running timecode.
- **Frame & Accent Colors**: Dedicated color pickers for brackets/frame, REC dot/crosshairs, and frame thickness slider.

### 8.4 60 FPS Dynamic Animation & Top-Most Layer Interaction

- Updated `movesByItself` in [`lib/elements/draw.ts`](file:///Users/kamalkant/Desktop/VDO/lib/elements/draw.ts) so `viewfinder` and `focusTarget` automatically trigger 60 FPS re-rendering during playback, driving real-time REC blinking and ticking timecode advance.
- Seamlessly integrates with the top-most layer selection engine in [`ProgramPlayer.tsx`](file:///Users/kamalkant/Desktop/VDO/components/editor/ProgramPlayer.tsx) allowing users to drag and scale viewfinders and focus targets without blocking underlying layers.

### 8.5 Automated Verification

- Unit test suite in [`tests/unit/camera-elements.test.ts`](file:///Users/kamalkant/Desktop/VDO/tests/unit/camera-elements.test.ts): **All 7 tests passed (100%)**.
- Full test suite: **All 47 test files and 388 unit tests passed**.
- Full type check: **`npm run typecheck` passed with 0 errors**.

---

## 9. Video Highlights & Transcript Clip Extraction Suite

### 9.1 Overview & Architecture

We implemented a complete end-to-end AI Video Highlights & Transcript Clip Extraction Suite in VDO, fulfilling all user requirements:

- **Automatic Highlights & Viral Hook Detection**: Evaluates spoken dialogue, vocal energy, emotional intensity, and pacing using Gemini AI to score and extract the most engaging moments (virality scores up to 99%, categorized as `hook`, `insight`, `climax`, `story`, `reaction`, or `qa`).
- **Interactive Transcript-Based Clip Extraction**: Displays a searchable, interactive sentence-by-sentence transcript with timecode badges, play-from-sentence auditioning, and instant one-click clip insertion.
- **Smart Aspect Reframing**: Formats extracted clips for Original (16:9 widescreen), Vertical Reel/Shorts (9:16), or Square (1:1).
- **Multi-Action Production Workflows**:
  1. **Create Recap Reel**: Concatenates selected highlights sequentially directly onto the main editing timeline.
  2. **Insert at Playhead**: Drops any highlighted moment at the exact cursor position.
  3. **Save to Assets**: Trims and exports sub-clips into "My Assets" using server-side FFmpeg (`/api/videos/[id]/extract`).

---

### 9.2 Key Components & Backend Services

| Component / File                                                                                                       | Purpose                                                                                                                                                                                   |
| :--------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`lib/ai/highlights.ts`](file:///Users/kamalkant/Desktop/VDO/lib/ai/highlights.ts)                                     | Core highlight extraction engine with Gemini structured JSON output schema, speech boundary snapping, per-media disk caching (`highlights-[hash].json`), and fallback heuristic chunking. |
| [`lib/ai/fake.ts`](file:///Users/kamalkant/Desktop/VDO/lib/ai/fake.ts)                                                 | Deterministic mock engine providing realistic viral hook highlights for test suites and offline environments.                                                                             |
| [`app/api/ai/highlights/route.ts`](file:///Users/kamalkant/Desktop/VDO/app/api/ai/highlights/route.ts)                 | Validates video existence and audio presence, returning structured highlight items and time-coded transcript segments.                                                                    |
| [`app/api/videos/[id]/extract/route.ts`](file:///Users/kamalkant/Desktop/VDO/app/api/videos/[id]/extract/route.ts)     | High-performance server-side FFmpeg sub-clip extraction endpoint with aspect reframing (16:9, 9:16, 1:1) and library asset import.                                                        |
| [`components/studio/HighlightsDialog.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/HighlightsDialog.tsx) | Responsive modal dialog with dual tabs (AI Highlights cards and Interactive Transcript), goal selector, aspect picker, inline video preview, and nudge buttons (±0.5s).                   |
| [`components/studio/AiToolsPanel.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/AiToolsPanel.tsx)         | Added `"Auto Highlights & Recap"` tool card under "Modify & Edit with AI".                                                                                                                |
| [`components/studio/SubtitlesPanel.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/SubtitlesPanel.tsx)     | Added direct access to extract highlights from existing subtitles/transcripts.                                                                                                            |
| [`components/studio/Studio.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/Studio.tsx)                     | Dynamic code-split lazy loading of `<HighlightsDialog>`, wired to reel assembly, clip insertion, and library asset creation.                                                              |

---

### 9.3 Verification & Quality Assurance

- **Unit Tests**: [`tests/unit/highlights.test.ts`](file:///Users/kamalkant/Desktop/VDO/tests/unit/highlights.test.ts) covering roadmap registration, realistic fake generation, bounds validation, and error handling.
- **Regression Suite**: All 48 test suites and 392 tests passed cleanly:
  ```
  Test Files  48 passed (48)
  Tests       392 passed (392)
  Duration    3.04s
  ```
- **Type Safety**: `npm run typecheck` (`tsc --noEmit`) passed with **0 errors**.

---

## 10. Default Empty Timeline 15s Duration & Drop Container Visibility Fix

### 10.1 Overview

Per user preference, the default empty canvas duration on the timeline has been updated to **15 seconds (`0:15`)**, and the _"Drop media here to start editing"_ container has been fixed to be **100% visible and non-scrollable** on the empty timeline.

### 10.2 Architectural Changes

- **Constant Exported**: Updated `DEFAULT_EMPTY_TIMELINE_SECONDS = 15` in [`components/studio/Timeline.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/Timeline.tsx).
- **Auto-fit Scale for Empty Viewport**:
  - Replaced the static fallback scale with `fitScale(lanesW - 24, DEFAULT_EMPTY_TIMELINE_SECONDS)` so the 15-second span dynamically fits 100% within the visible viewport width without exceeding `lanesW`.
- **Eliminated Unwanted Scrollbars**:
  - Locked out scrolling on the empty timeline: `scroller` now uses `${empty ? "overflow-hidden" : "overflow-auto"}`.
  - Set inner lanes width to `width: empty ? "100%" : Math.max(lanesW, inner + 24)`.
  - Hidden the bottom scrollbar compensation spacer when empty (`{!empty && <div className="h-4" />}`).
- **Drop Container Styling & Centering**:
  - Positioned the empty drop container with `inset-x-4 inset-y-2` inside the 100% visible lanes area so all text, the film icon, and the "choose a file" link are completely visible, centered, and never clipped.
- **Dynamic Snapping Preserved**: As soon as any media clip is added, the timeline continues to automatically resize to the true project duration (`docDuration(doc)`).

### 10.3 Automated Tests & Verification

- Updated [`tests/unit/timeline-space.test.ts`](file:///Users/kamalkant/Desktop/VDO/tests/unit/timeline-space.test.ts) to assert `DEFAULT_EMPTY_TIMELINE_SECONDS === 15`.
- All 48 test files and 392 tests passed cleanly:
  ```
  Test Files  48 passed (48)
  Tests       392 passed (392)
  Duration    2.96s
  ```
- TypeScript check passed with 0 errors (`npm run typecheck`).

---

## 11. Timeline Track Hide & Eye/EyeOff Icon Toggle (Main & Overlay Layers)

### 11.1 Overview

Added the ability to hide both the **Main Video Track (Video 1)** and all **Overlay Tracks**, and upgraded the hide button to dynamically toggle between an open eye (`eye`) and a slashed eye (`eyeOff`) icon with visual track dimming.

### 11.2 Key Changes

- **Icon Library ([`Icon.tsx`](file:///Users/kamalkant/Desktop/VDO/components/ui/Icon.tsx))**:
  - Added standard 24×24 stroke SVG path for `eyeOff` (eye with diagonal slash).
  - Exported `PATHS` object for component and test consumption.
- **Data Model ([`lib/edit/doc.ts`](file:///Users/kamalkant/Desktop/VDO/lib/edit/doc.ts))**:
  - Added `hidden: z.boolean().optional()` to the `main` track schema in `trackSchema`.
  - Initialized `hidden: false` on the `v1` track in `emptyDoc`.
- **Timeline UI ([`Timeline.tsx`](file:///Users/kamalkant/Desktop/VDO/components/studio/Timeline.tsx))**:
  - Rendered the hide button for both `tr.kind === "overlay"` and `tr.kind === "main"`.
  - Switched the icon dynamically based on hidden state: `icon={"hidden" in tr && tr.hidden ? "eyeOff" : "eye"}`.
  - Track lane visual feedback: dimmed hidden lanes to `opacity-40` (`${"hidden" in tr && tr.hidden ? "opacity-40" : ""}`).
- **Program Player & Render Pipeline**:
  - [`ProgramPlayer.tsx`](file:///Users/kamalkant/Desktop/VDO/components/editor/ProgramPlayer.tsx): In `layersAt`, skips `main.clips` when `main.hidden` is true; disables Video 1 transitions in `mt`.
  - [`lib/render/compose.ts`](file:///Users/kamalkant/Desktop/VDO/lib/render/compose.ts): In `visualLayers`, skips `main.clips` when `main.hidden` is true.

### 11.3 Automated Tests & Verification

- Added test coverage in [`tests/unit/track-reorder.test.ts`](file:///Users/kamalkant/Desktop/VDO/tests/unit/track-reorder.test.ts) testing:
  - Hiding and unhiding `main` (Video 1) and overlay tracks via `setTrack`.
  - Omitting hidden clips from `visualLayers`.
  - Verifying `PATHS.eye` and `PATHS.eyeOff` SVG definitions.
- All 48 unit test files and 393 tests passed cleanly (`npm run test:unit`).
- Type safety verified with 0 errors (`npm run typecheck`).

---

## 12. Thumbnail Border Refinement, Keyframe Line Color & Rounded Corners

### 12.1 Overview

Addressed user feedback across three areas:

1. **Thin (1px) Selection Border on Project & Media Cards**: Removed thick `ring-2` focus rings from selected cards and refined the border in `globals.css` to a crisp 1px `rgba(255, 255, 255, 0.85)` border (with `box-shadow: none !important`), eliminating visual blooming on dark themes.
2. **Keyframe Connector Line Color Match**: Removed `border-y border-black/40` on the timeline keyframe connector line (`data-testid="keyframe-line"`) so its amber color matches the keyframe diamond dots (`bg-amber-300`) cleanly without muddy dark borders.
3. **Clip & Timeline Rounded Corners (Bottom-Left Corner Fix)**:
   - Added `overflow-hidden` to the Timeline section panel and `rounded-bl-xl` to the track headers column.
   - Added `isolate` and `overflow-hidden` to `ClipBlock` on the timeline.
   - Added `rounded-l-md` and `rounded-r-md` to the trim edge sliders (`edge === "in"` and `edge === "out"`), preventing unrounded rectangles from bleeding past the rounded clip border.
   - Added `overflow-hidden` to `KeyframeBar` and `ClipInspector`.

### 12.2 Automated Tests & Verification

- `npm run typecheck`: **0 errors**.
- `npm run test:unit`: **All 48 test files and 394 tests passed**.
- Live visual verification via browser subagent confirmed crisp 1px borders on selected cards, exact yellow color match between keyframe line and dots, and smooth rounded corners across all clip edges.

---

## 13. Google Vids Starting Clip Trimming & Handle Alignment

### 13.1 Overview

Aligned timeline clip trimming behavior with Google Vids based on frame-by-frame analysis of `prototypes/timeline-google-vid.mp4` vs `prototypes/timeline-vdo.mp4`:

1. **Left Trim Start Offset & Leading Gap Support**:
   - In [doc.ts](file:///Users/kamalkant/Desktop/VIDO/lib/edit/doc.ts), updated `mainClipSchema` to support an optional `start?: number` property on main track clips, and updated `mainStarts` to initialize track start time with `t = (clips[0] as any)?.start ?? 0`.
   - In [docEdit.ts](file:///Users/kamalkant/Desktop/VIDO/lib/edit/docEdit.ts), updated `trimClip` for `edge === "in"`: when trimming the starting clip, `newStart = Math.max(0, end - clipLength(next))` and sets `next.start = newStart`. The right edge (`end`) remains fixed, leaving empty space from `0:00` to the trimmed start point.
   - When trimming `edge === "out"`, preserved the clip's existing `start` offset, maintaining magnetic continuity for subsequent clips.
2. **Floating Duration Badge & Vertical Guide**:
   - In [Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx), added `activeTrimTip` state tracking the active clip, trimmed edge, live duration, and timeline timestamp.
   - Rendered a floating dark pill tooltip (e.g., `5.7s`) with subtle downward pointer arrow directly above the active handle during drag, alongside a vertical alignment guide across the timeline lanes.
3. **Google Vids Handle Bar with Double-Arrow Indicator**:
   - Updated trim slider handles with a Google Vids-style bar and subtle double-arrow indicator (`< |` for start, `| >` for end) with clean SVG chevrons and hover highlights.
4. **Live Canvas Preview Seeking**:
   - In [Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx), added `p.onSeek(Math.max(0, targetTime))` on pointer move and keyboard trim, ensuring the video canvas preview seeks in real-time to display the exact frame at the trimmed timestamp.

### 13.2 Automated Tests & Verification

- Added new test suite in [timeline-start-trim.test.ts](file:///Users/kamalkant/Desktop/VIDO/tests/unit/timeline-start-trim.test.ts) covering:
  - Trimming starting clip left handle to the right, keeping end invariant and leaving empty space at `0:00`.
  - Preserving starting clip offset when subsequent `out` edge is trimmed.
  - Allowing trimming `in` edge back to `0:00` to restore no leading gap.
  - Clamping trimming to source media bounds without exceeding `0` or minimum length.
- Ran all timeline tests (`tests/unit/timeline-start-trim.test.ts`, `tests/unit/timeline-scaling-mechanism.test.ts`, `tests/unit/timeline-controls-productivity.test.ts`, `tests/unit/timeline-space.test.ts`, `tests/unit/timeline-ui-refinements.test.ts`, `tests/unit/editing-tools-sync.test.ts`): **All 6 test suites and 24 tests passed**.

---

## 14. Google Vids Starting Clip Trim Refinements (Thumbnail, Frame Preview & 0:00 Shift)

### 14.1 Overview

Implemented three core refinements following user review and Google Vids prototype alignment:

1. **Clip Thumbnail First-Tile Alignment**:
   - In [film.ts](file:///Users/kamalkant/Desktop/VIDO/lib/editor/film.ts), updated `filmTiles` so tile 0 (`k === 0`) at the clip's left edge samples `srcIn` directly (`posInClip = 0`). The first thumbnail tile immediately reflects the trimmed start frame (`c.in`) without an arbitrary multi-second offset.
   - In [Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx), added a fallback background thumbnail (`url(/api/videos/${c.mediaId}/thumb)`) for video clips in `ClipBlock` to ensure visual continuity while filmstrip sprites generate or load.

2. **Elimination of Transparent Background During Trim (Start & End Points)**:
   - In [Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx), updated seek logic in `onPointerMove` and `onKeyTrim`:
     - When trimming `edge === "in"`: seeks to `activeTime + 1e-4`, landing directly on the start frame of the trimmed clip (`c.in`).
     - When trimming `edge === "out"`: seeks to `Math.max(s, activeTime - 1 / fps)`, landing on the last visible frame of the clip just before `c.out`.
   - In [ProgramPlayer.tsx](file:///Users/kamalkant/Desktop/VIDO/components/editor/ProgramPlayer.tsx), added boundary tolerance to `layersAt` (`t >= s - 1e-5` and end boundary `t <= s + len + 1e-5` for the sequence end), completely preventing blank or transparent canvas flashes.

3. **Starting Clip Shift to 0:00 on Trim Completion**:
   - In [Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx), on `onPointerUp`, when the user finishes dragging the starting clip's left trim handle, `p.onPatchClip?.(d.id, { start: 0 })` shifts the clip flush to `0:00` on the timeline, maintaining magnetic sequence continuity, and calls `p.onSeek(0)` to place the playhead at the new beginning frame.

### 14.2 Automated Tests & Verification

- Added comprehensive test coverage in [timeline-start-trim.test.ts](file:///Users/kamalkant/Desktop/VIDO/tests/unit/timeline-start-trim.test.ts):
  - `samples exact srcIn for tile 0 in filmTiles so the first thumbnail matches the start frame`.
  - `shifts starting clip to 0:00 timeline after trim completion with playhead at 0:00 (Google Vids model)`.
  - `verifies safe preview frame seek offsets within clip boundaries (no out-of-bounds blank frames)`.
- Ran all 6 timeline test suites: **All 27 tests passed** (`npx vitest run tests/unit/timeline* tests/unit/editing-tools-sync.test.ts`).
- Clean compilation: **0 type errors** in modified files (`npx tsc --noEmit`).

---

## 15. Device Folder `NotAllowedError` Resolution & Permission Lifecycle

### 15.1 Root Cause Analysis

The error:
```
NotAllowedError: Failed to execute 'getFileHandle' on 'FileSystemDirectoryHandle': The request is not allowed by the user agent or the platform in the current context. (lib/storage/deviceFolder.ts:238:13)
```
occurred because:
1. In the Web File System Access API, stored `FileSystemDirectoryHandle` objects in IndexedDB persist across browser sessions, but their write permission resets to `"prompt"` upon page reload.
2. In [deviceFolder.ts](file:///Users/kamalkant/Desktop/VIDO/lib/storage/deviceFolder.ts), `verifyFolderPermission(handle, false)` checked `queryPermission({ mode: "readwrite" })`. When the browser returned `"prompt"`, the function reached a fallback `return true;`.
3. Because `hasPerm` was mistakenly treated as `true`, background autosaves (`writeToDeviceFolder`) called `handle.getFileHandle(..., { create: true })` without an active user gesture, which the browser rejected with `NotAllowedError`.
4. Additionally, system-restricted directories (e.g. root volumes or macOS system folders) reject direct file handles.

### 15.2 Key Fixes & Architecture

1. **Permission Check Correction**:
   - In [deviceFolder.ts](file:///Users/kamalkant/Desktop/VIDO/lib/storage/deviceFolder.ts), updated `verifyFolderPermission`: returns `false` when `status` is `"prompt"` or `"denied"` and `request` is `false`. Background autosave will not attempt unauthorized write calls.
2. **Safe Exception Handling in `writeToDeviceFolder`**:
   - Caught `NotAllowedError` and `SecurityError` gracefully, returning `false` without throwing unhandled errors or polluting console logs. The workspace continues uninterrupted with its built-in sandboxed OPFS/IndexedDB storage.
3. **Folder Writeability Probing during Selection**:
   - In `pickDeviceFolder`, added an immediate probe (`getFileHandle(".vdo_probe")`) upon folder selection. If the browser or OS restricts the location, the user is immediately prompted with a clear message: *"The browser or OS restricts writing to this specific folder. Please choose a regular user folder (such as Documents or Desktop)."*
4. **Session Re-authorization UI in Storage Manager**:
   - Added `requestFolderPermission` and rendered a **"Grant Permission"** button with a *"Permission Needed"* status badge in [StorageManagerModal.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/StorageManagerModal.tsx). Users can re-authorize folder access in a single click in response to a user gesture.

### 15.3 Automated Tests & Verification

- Added 4 new test cases in [device-folder.test.ts](file:///Users/kamalkant/Desktop/VIDO/tests/unit/device-folder.test.ts):
  - `denies permission check when status is prompt and request is false`
  - `requests permission when request is true`
  - `handles NotAllowedError in writeToDeviceFolder gracefully without throwing`
  - `detects OS/browser restricted directory during folder picking and warns user`
- All 10 tests in `device-folder.test.ts` passed (`10 passed`).
- Total suite of 7 test files (37 tests) passed cleanly.

---

## 16. Duration-Bounded Video Motion Tracking & Range Selection

### 16.1 Overview & Requirements
Addressed user request: *"Ye video motion tracking mein ek cheez aur add kar do ki agar mujhe kuch duration pe hi tracking karni ho suppose 2-4 second, 10 second ya kewal ek selected duration ke beech mein hi tracking karni ho kaise karenge wo bhi add kar do"*

Users can now track moving objects or censor faces for specific duration windows (e.g. 2s, 4s, 10s, custom duration, or from playhead) rather than forcing full-clip tracking.

### 16.2 Core Capabilities Delivered

1. **Range Selection Modes in Motion Tracking Panel (Step 3)**:
   - **From Playhead** (default): Tracks from the current playhead position forward by a specified duration.
   - **Full Clip**: Tracks the entire clip duration.
   - **Custom Range**: Explicit Start and End numerical seconds inputs with dedicated **"Playhead"** stamp buttons to instantly set either boundary to current playhead time.
2. **One-Tap Quick Duration Presets & Input**:
   - Quick preset chips: `2s`, `4s`, `10s`, and `To End`.
   - Custom seconds input field with live range recalculation.
3. **Interactive Visual Range Bar**:
   - Displays full clip duration timeline (`0.0s` to `end`).
   - Sky-blue highlighted active tracking span showing `start → end (duration)`.
   - Orange playhead needle indicating current playback position.
4. **Bounded Computer Vision Tracking Engine**:
   - `lib/tracking/tracker.ts`: Restricts video frame extraction and Lucas-Kanade optical flow tracking strictly between `startTime` and `endTime`.
   - Merges keyframes non-destructively: only overwrites keyframes within the re-tracked `[startTime, endTime]` window, preserving any existing keyframes outside that interval.
5. **Keyframe-Bounded Active Duration (Canvas Preview & Export Parity)**:
   - `lib/tracking/types.ts`: `trackingAt(point, t)` returns `null` outside the active keyframe span (`t < k[0].t - 0.05` or `t > k[last].t + 0.05`) and during untracked gaps (`dt > TRACKING_GAP_THRESHOLD_SEC = 2.5s`).
   - `components/editor/ProgramPlayer.tsx`: Blur, mosaic, and attachments automatically hide when playback is outside the tracked range.
   - `lib/tracking/render.ts`: FFmpeg export filtergraph injects dynamic `enable='between(t, ...)'` expressions so rendered output strictly matches live canvas preview.

### 16.3 Automated Unit Tests & Regressions

- Created [tests/unit/duration-tracking.test.ts](file:///Users/kamalkant/Desktop/VIDO/tests/unit/duration-tracking.test.ts) covering:
  - Initial position fallback when no keyframes exist (setup/reticle mode)
  - Interpolated positions inside tracked keyframe spans
  - Strict `null` return before start and after end of tracked duration
  - Interior gap detection between disjoint tracked runs
  - FFmpeg `enable='between(t, ...)'` filtergraph syntax generation
  - Non-destructive keyframe retention and merging logic
- Verified all tracking and audio test suites pass cleanly:
  - `duration-tracking.test.ts`: **6/6 passed**
  - `motion-tracking.test.ts`: **29/29 passed**
  - `streamlined-tracking.test.ts`: **4/4 passed**
  - `smart-audio-mix.test.ts`: **10/10 passed**
  - Total: **49/49 tests passed**
- Clean TypeScript verification: **0 type errors** in all modified tracking files.

### 16.4 Visual Verification Evidence

- `tracking_range_ui_1791423936667.png`: Tracking Range selector showing `From Playhead`, `4s` preset chip, visual duration bar (`0.0s → 4.0s (4.0s)`), and `Track 4.0s Range` primary button.
- `tracking_completed_status_1791423957930.png`: Active blur censor locked to target with `✓ 1 kfs` status, duration bar, and `Re-Track 2.0s` button.
- `custom_range_controls_1791424002266.png`: Custom Range mode with numerical Start/End inputs and `Playhead` buttons.
- Browser test recording: `duration_tracking_test_1791423898979.webp`.

---

## 17. Timeline Clip High-Contrast White Selection Border in Dark Mode

### 17.1 Problem & User Request
- **User Audio Feedback**: *"Dark mode mein timeline pe agar koi clip hai to us clip ko select karne pe border visible nahi ho raha hai. I think wo white border hona chahiye jisse selection pata chale."*
- **Root Cause**:
  1. Timeline clips previously used `ring-2 ring-[#1a73e8]` (Google blue `#1a73e8`) which blended into dark mode timeline tracks (`#070b17` / `#0f172a`), creating almost zero visible contrast.
  2. Outer container had `ring-1 ring-black` which added a dark outline, further diminishing visibility in dark mode.
  3. `ring-2` on a child without `ring-inset` was partially clipped by `overflow: hidden` on the parent clip container.

### 17.2 Solution & Implementation
1. **Dynamic Theme-Aware Selection Border in [Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx)**:
   - Added `data-selected={p.selected ? "true" : "false"}` to `ClipBlock` container for CSS attribute targeting.
   - Container `className`: In dark mode (`!isLight`), applies `z-10 ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_0_12px_rgba(255,255,255,0.45)]` instead of `ring-black`.
   - Selection overlay span: In dark mode, applies `ring-2 ring-inset ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_0_10px_rgba(255,255,255,0.45)]`.
   - In light mode (`isLight`), preserves the clean `#1a73e8` blue ring.
2. **Global CSS Rules in [globals.css](file:///Users/kamalkant/Desktop/VIDO/app/globals.css)**:
   - Added `:root:not([data-theme="light"]) [data-clip][data-selected="true"]` with `outline: 2px solid #ffffff !important; outline-offset: -2px !important;` and dark halo glow.
   - Guarantees that all timeline clip types (video, audio, text, image, elements, blanks, subtitles) immediately display an unmistakable white border when selected in dark mode.

### 17.3 Automated Verification & Visual Evidence
- TypeScript validation: **0 errors** in `Timeline.tsx` and modified files.
- Automated tests: **49/49 unit tests passed** (`vitest`).
- Browser verification screenshot: `white_selection_border_dark_mode_1791424311563.png` demonstrating the high-contrast white border on the selected clip.
- Session recording: `verify_white_border_1791424277435.webp`.

---

## 18. Bidirectional "Detach Audio" and "Attach Audio" Toggle

### 18.1 User Problem & Intent
When editing videos in VDO Studio, users frequently detach audio from video clips to manipulate, trim, or adjust audio independently. However, previously:
- The "Detach" button only performed a one-way extraction.
- Once audio was detached, there was no way to re-attach or re-link the audio track back into the video clip.
- Users requested a bidirectional toggle button:
  > *"Jo audio detach ka button hai wo ek tarah se toggle hona chahiye. Kyunki jab main audio detach karta hoon, aur wapas se main attach nahi kar pata hoon, to us case mein kya kar sakte hain? Ya to use toggle hi bana sakte hain, ek click pe attach, ek click pe detach. Attach and detach."*

### 18.2 Architecture & Implementation

1. **Clip Document Schema ([lib/edit/doc.ts](file:///Users/kamalkant/Desktop/VIDO/lib/edit/doc.ts))**:
   - `videoClipSchema`: Added `detachedAudioId: localId.optional()` to track the detached audio clip associated with this video.
   - `audioClipSchema`: Added `detachedFromClipId: localId.optional()` to record the originating video clip.

2. **Bidirectional Editing Operations ([lib/edit/docEdit.ts](file:///Users/kamalkant/Desktop/VIDO/lib/edit/docEdit.ts))**:
   - `detachAudio(doc, clipId)`:
     - Extracts the audio to an audio track at the exact same start time, duration, speed, volume, and fades.
     - Sets `muted: true` on the video clip and links `detachedAudioId` and `detachedFromClipId`.
   - `attachAudio(doc, clipId)`:
     - Resolves the pair whether the user triggers the action on the video clip or on the detached audio clip.
     - Un-mutes the video clip (`muted: false`) and restores volume, fade in/out curves, and automation keyframes.
     - Removes the detached audio clip from the audio track.
     - Cleans up empty audio tracks that were created for the detached audio, keeping the timeline clean.
     - Clears the linking ID references (`detachedAudioId: undefined`).
   - `toggleAudioDetach(doc, clipId)`:
     - Automatically inspects the current state: if detached, re-attaches; if attached, detaches. Single idempotent toggle operation.

3. **History Reducer & State Management ([lib/editor/docReducer.ts](file:///Users/kamalkant/Desktop/VIDO/lib/editor/docReducer.ts))**:
   - Added actions `attachAudio` and `toggleAudioDetach` ensuring full Undo (`Cmd+Z`) and Redo (`Cmd+Shift+Z`) support.

4. **Timeline Toolbar & Context Menus ([components/studio/Timeline.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Timeline.tsx), [components/studio/Studio.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/Studio.tsx))**:
   - **Dynamic Toolbar Button**:
     - When audio is attached: Displays **"Detach"** with the `detachAudio` icon in normal state.
     - When audio is detached: Displays **"Attach"** with the new `attachAudio` icon and active blue highlight (`bg-primary-soft text-primary font-medium`).
     - Clicking the toolbar button toggles between Detach and Attach seamlessly.
   - **Context Menu & Command Palette**:
     - Right-clicking video clip: Shows *"Detach audio"* or *"Attach audio"*.
     - Right-clicking detached audio clip: Shows *"Attach to video"*.
     - Command palette (`Cmd+K`): Displays dynamic *"Detach Audio"* / *"Attach Audio"*.
   - **New Icon ([components/ui/Icon.tsx](file:///Users/kamalkant/Desktop/VIDO/components/ui/Icon.tsx))**:
     - Designed `attachAudio` SVG icon depicting an audio note merging back into a track.

### 18.3 Verification & Visual Evidence

- **Unit Tests ([tests/unit/detach-audio.test.ts](file:///Users/kamalkant/Desktop/VIDO/tests/unit/detach-audio.test.ts))**:
  - `✓ detaches audio from video clip onto an audio track with matching timing and volume`
  - `✓ re-attaches audio back into video clip and removes the detached audio clip`
  - `✓ re-attaches audio when invoked directly on the detached audio clip`
  - `✓ toggleAudioDetach toggles bidirectionally with single function calls`
  - `✓ updates editingTools flags correctly: canDetachAudio vs canAttachAudio / isAudioDetached`
  - `✓ returns null if clip has no audio`
  - All 6 tests passing (100% pass rate).

- **Visual Evidence**:
  1. **Detached State (Active "Attach" toggle button & extracted audio clip)**:
     ![Detached Audio State](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/detached_audio_result_1791425364043.png)
  2. **Re-attached State (Audio merged back, video un-muted, button returns to "Detach")**:
     ![Re-attached Audio State](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/attached_audio_result_1791425386090.png)
  3. **End-to-End Browser Interaction Recording**:
     Session recording saved at `toggle_audio_detach_demo_1791425213917.webp`.

---

## 19. VDO Ecosystem: 3D Marketing Website, Standalone Pro Player & Studio Architecture

### 19.1 Overview & Architecture

To address the complete vision outlined in the product strategy, VDO was expanded into a unified, three-tiered ecosystem:

```text
VDO Ecosystem
│
├── vdo-player/              ← Main Standalone Pro Player (/player)
│   ├── Dual-Mode Playback (Viewer vs Review & AI)
│   ├── Alpha WebM & ProRes 4444 Transparency (Checkerboard, Dark, Light)
│   ├── Frame-accurate stepping & J/K/L scrubbing
│   ├── Social Media Safe Area Guides (Shorts, Reels, TikTok)
│   ├── Media Debugger & Codec Inspection Panel
│   ├── Timestamped notes & Inspector drawer
│   └── 1-click bridge to VDO Studio & Web Embed Snippets
│
├── vdo-editor/              ← Existing NLE Studio (/editor)
│   ├── Multi-layer timeline (Video, Overlay, Audio)
│   ├── Smart Dialogue Ducking & Attach/Detach Audio
│   ├── Duration-bounded motion tracking
│   ├── Backward-compatible auto-redirect from legacy /?p= and /?v=
│   └── Ecosystem portal switcher in TopBar
│
└── vdo-website/             ← 3D/WebGL Marketing Landing Page (/)
    ├── Native WebGL 2.0 / Canvas 3D particle universe & floating player rig
    ├── 15-Chapter product storytelling
    ├── Exploded 3D layer disassembly (Canvas, Overlay, Shader, Decode)
    ├── Interactive in-browser Player Lab
    ├── Community & Pro conversion offers
    └── Zero-dependency 60 FPS momentum scroll
```

### 19.2 Implemented Features & Components

1. **3D WebGL Marketing Website ([components/website/](file:///Users/kamalkant/Desktop/VIDO/components/website/))**:
   - **[WebGlStage.tsx](file:///Users/kamalkant/Desktop/VIDO/components/website/canvas/WebGlStage.tsx)**: Hardware-accelerated 3D particle field, floating wireframe player box with mouse-parallax tilt and dynamic audio waveform ducking visualizer.
   - **[TopNav.tsx](file:///Users/kamalkant/Desktop/VIDO/components/website/dom/TopNav.tsx)**: Minimalist glassmorphic top navigation with direct ecosystem links to Player and Studio.
   - **[StoryChapters.tsx](file:///Users/kamalkant/Desktop/VIDO/components/website/dom/StoryChapters.tsx)**: Exploded 3D player rig, transparent web avatars, smart audio ducking showcase, and Apple VideoToolbox 10x hardware acceleration benchmark.
   - **[InteractivePlayerLab.tsx](file:///Users/kamalkant/Desktop/VIDO/components/website/dom/InteractivePlayerLab.tsx)**: Working in-page interactive player with live backdrop switching (Checkerboard, Black, White) and aspect ratio transformations (16:9, 9:16).
   - **[ConversionOffers.tsx](file:///Users/kamalkant/Desktop/VIDO/components/website/dom/ConversionOffers.tsx)**: Clear product pricing and value proposition for creators and developers.
   - **[FooterCTA.tsx](file:///Users/kamalkant/Desktop/VIDO/components/website/dom/FooterCTA.tsx)**: High-impact conversion finale directing users to try the Player or launch the Studio.

2. **Standalone Dual-Mode Pro Player ([components/player/](file:///Users/kamalkant/Desktop/VIDO/components/player/))**:
   - **[StandalonePlayer.tsx](file:///Users/kamalkant/Desktop/VIDO/components/player/StandalonePlayer.tsx)**:
     - **Dual Mode**: Quick toggle between **Viewer Mode** (clean playback) and **Review & AI Mode** (inspector, media facts, reviewer notes).
     - **Alpha Transparency**: Instant toggle between Checkerboard, Black, and White backdrops.
     - **Keyboard Shortcuts**: `Space` / `K` (Play/Pause), `ArrowLeft` / `ArrowRight` (Frame step), `J` / `L` (Scrub -2s / +2s), `A` (Cycle alpha backdrops), `S` (Toggle safe guides), `M` (Mute), `F` (Fullscreen).
     - **Drag & Drop**: Direct local media playback for MP4, WebM, MOV, and alpha formats.
   - **[SocialSafeGuides.tsx](file:///Users/kamalkant/Desktop/VIDO/components/player/SocialSafeGuides.tsx)**: Safe area HUD overlay for YouTube Shorts, Instagram Reels, and TikTok (90% action safe, 80% title safe, right-rail reaction simulation).
   - **[MediaDebuggerModal.tsx](file:///Users/kamalkant/Desktop/VIDO/components/player/MediaDebuggerModal.tsx)**: Deep media stream debugger displaying resolution, FPS, codecs, pixel format (`yuva420p`), bitrate, and client browser capability matrix (WebM VP9 Alpha, ProRes 4444, WebCodecs, VideoToolbox).
   - **[ReviewDrawer.tsx](file:///Users/kamalkant/Desktop/VIDO/components/player/ReviewDrawer.tsx)**: Inspector panel displaying 4K specs, duration, and timestamped reviewer notes with click-to-seek synchronization.
   - **[EmbedModal.tsx](file:///Users/kamalkant/Desktop/VIDO/components/player/EmbedModal.tsx)**: Embed snippet generator for Standard HTML5, Transparent Web Avatar, and Responsive iFrames.

3. **Backward-Compatible Routing & Studio Navigation**:
   - **[app/page.tsx](file:///Users/kamalkant/Desktop/VIDO/app/page.tsx)**: Inspects query parameters (`?p=`, `?v=`, `?job=`) and seamlessly redirects existing project links to `/editor`, rendering the marketing landing page on clean root visits.
   - **[app/player/page.tsx](file:///Users/kamalkant/Desktop/VIDO/app/player/page.tsx)**: Dedicated standalone player portal at `/player`.
   - **[app/editor/page.tsx](file:///Users/kamalkant/Desktop/VIDO/app/editor/page.tsx)**: Dedicated full NLE Studio portal at `/editor`.
   - **[components/studio/TopBar.tsx](file:///Users/kamalkant/Desktop/VIDO/components/studio/TopBar.tsx)**: Added Ecosystem Portal Switcher (`Studio` | `Player` | `Website`) allowing creators to navigate between all 3 portals with 1 click.

### 19.3 Automated Unit Tests

- **[tests/unit/ecosystem-portals.test.tsx](file:///Users/kamalkant/Desktop/VIDO/tests/unit/ecosystem-portals.test.tsx)**:
  - `✓ EmbedModal generates responsive iframe and transparent alpha code snippets`
  - `✓ ReviewDrawer displays media specs and allows adding timestamped notes`
  - `✓ MediaDebuggerModal renders deep codec inspection and browser support matrix`
  - `✓ SocialSafeGuides renders action-safe and title-safe overlays`
  - 100% test pass rate across all 31 core vitest tests.

### 19.4 Browser Verification & Visual Evidence

1. **VDO 3D Marketing Homepage (Hero Banner & Nav)**:
   ![Marketing Homepage Hero](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_home_hero_1791469696883.png)
2. **Exploded 3D Player Rig & Hardware Architecture**:
   ![Exploded 3D Rig](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_home_architecture_1791469711378.png)
3. **Interactive Player Lab (Live 9:16 & Alpha Backdrop Switcher)**:
   ![Interactive Player Lab](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_home_player_lab_1791469820729.png)
4. **VDO Pro Player (Viewer Mode with Alpha Checkerboard & 4K Reel)**:
   ![VDO Pro Player Initial](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_player_initial_1791469906001.png)
5. **Review & AI Inspector Drawer with Timestamped Notes**:
   ![Review Drawer](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_player_review_drawer_1791469962305.png)
6. **Media Debugger & Video Info Modal (Deep Tech Specs)**:
   ![Media Debugger Modal](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_player_info_specs_modal_1791470003114.png)
7. **Social Media Safe Area Guides HUD (Shorts / Reels Overlay)**:
   ![Safe Area Guides HUD](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/vdo_player_safe_guides_active_1791470052241.png)
8. **End-to-End Ecosystem Verification Recording**:
   Session recording saved at `vdo_ecosystem_verification_1791469664525.webp`.

---

## 20. Revamped 3D Scroll Website: 6 Storyboard Chapters & Atmospheric WebGL

### 20.1 Overview & Design Alignment

Following the design mock and references provided (inspired by [Ricardo Chance Scroll-Driven WebGL](https://experiments.ricardochance.com/scroll-driven-webgl) and [Tympanus DepthGallery](https://tympanus.net/Tutorials/DepthGallery/)), the marketing landing page (`/`) was completely transformed into an interactive 6-chapter 3D cinematic experience:

1. **Chapter 01: Hero Section ("Video Playback Reimagined.")**:
   - Floating 3D perspective glass player with play controls and timecode (`0:00 / 0:27`).
   - Layered preview cards floating in background depth with mouse-parallax tilt.
   - Smooth mirror reflection on a polished dark studio floor.
   - Primary CTA button: `Try VDO Player >` (links to `/player`).

2. **Chapter 02: Scroll Timeline ("Every Frame a Story.")**:
   - Curving 3D filmstrip ribbon looping through space with cinematic frames.
   - Glowing vertical blue playhead marker pinned at active timecode (`00:10`).
   - Interactive timecode scrubber (`00:00`, `00:05`, `00:10`, `00:15`, `00:20`) that highlights and focuses frames on click.

3. **Chapter 03: Feature Showcase ("More Than Playback.")**:
   - Exploded 3D layered glass sandwich tilted in isometric perspective:
     - `Video Layer` (Surfer riding barrel wave)
     - `Overlay Layer` (Frosted glass HUD & tracking bounds)
     - `Controls` (Play/pause, scrub bar, settings)
     - `Timeline` (Thumbnail strip)
     - `Audio Waveform` (Neon blue glowing pulsing spectrum)
   - Interactive layer selection: hovering or clicking elevates the layer in 3D (`translateZ`) and marks it active.

4. **Chapter 04: Alpha Video ("Video Without a Background.")**:
   - Floating fashion avatar draped in sheer iridescent silk fabric breaking the frame.
   - Split backdrop preview (left half straight alpha checkerboard, right half dark).
   - Live interactive backdrop switcher: `Checkerboard`, `Image`, `Video`, `AI Background`.
   - Bottom avatar thumbnail carousel with `+` custom upload trigger.

5. **Chapter 05: 3D Thumbnail Gallery ("See More Possibilities.")**:
   - Atmospheric depth gallery with 5 perspective cards arranged with depth on a glossy dark floor with mirror reflections.
   - Filter pills: `All`, `AI Video`, `Transparent`, `4K`, `Shorts`, `Cinematic`.
   - Center focused card with glowing cyan border and badge: `AI Generated · 4K · 00:15`.

6. **Chapter 06: Formats & Versatility ("One Player. Every Format.")**:
   - Multiple 3D display devices standing upon an illuminated circular glowing stage pedestal:
     - `16:9 Landscape Screen` (Cinema mountain vista)
     - `9:16 Vertical Smartphone Frame` (Portrait reel avatar)
     - `1:1 Square Card` (Purple flower macro)
     - `Alpha Transparent Card` (Silk avatar on checkerboard)
   - Bottom format pills: `16:9`, `9:16`, `1:1`, `4K`, `Alpha`, `WebM`, `MP4` with active pedestal spotlighting.

7. **Ecosystem CTA & Footer**:
   - Grand finale conversion cards for **VDO Pro Player** and **VDO Studio Editor**, linking all 3 ecosystem branches together.

### 20.2 Automated Unit Testing

- **[tests/unit/website-storyboard.test.tsx](file:///Users/kamalkant/Desktop/VIDO/tests/unit/website-storyboard.test.tsx)**:
  - `✓ 01 HeroSection renders headline, subtitle, and CTA link to player`
  - `✓ 02 TimelineSection renders 3D filmstrip timeline and scrubbable timecodes`
  - `✓ 03 ExplodedLayerSection renders all exploded layers and allows inspection`
  - `✓ 04 AlphaVideoSection renders transparent avatar and backdrop switcher`
  - `✓ 05 DepthGallerySection renders atmospheric 3D gallery with filter pills`
  - `✓ 06 FormatsPedestalSection renders multi-device stage on illuminated circular pedestal`
  - 100% test pass rate across all 10 ecosystem & storyboard vitest tests.

### 20.3 Browser Verification & Visual Evidence

1. **Chapter 01: Hero Section (3D Perspective Player)**:
   ![Hero Section](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/hero_section_1791471730372.png)
2. **Chapter 02: Scroll Timeline (3D Curving Filmstrip Ribbon)**:
   ![Timeline Section](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/timeline_section_1791471802640.png)
3. **Chapter 02: Scrubbed Timeline to 00:15 ("Cinematic Rush")**:
   ![Timeline Scrubbed](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/timeline_scrubbed_0015_1791471843782.png)
4. **Chapter 03: Exploded 3D Layer Rig (Video, Overlay, Controls, Timeline, Neon Waveform)**:
   ![Exploded Layer Rig](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/exploded_layers_1791471924061.png)
5. **Chapter 03: Exploded Rig with Overlay Layer Selected**:
   ![Exploded Overlay Selected](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/exploded_layers_overlay_1791472017113.png)
6. **Chapter 04: Alpha Video (Transparent Silk Avatar & Split Checkerboard)**:
   ![Alpha Video Section](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/alpha_video_1791472059787.png)
7. **Chapter 04: Alpha Video with Live Image Backdrop Switched**:
   ![Alpha Video Image BG](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/alpha_video_image_bg_1791472087139.png)
8. **Chapter 05: 3D Thumbnail Gallery (Atmospheric Depth & Floor Reflections)**:
   ![3D Thumbnail Gallery](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/gallery_section_1791472144525.png)
9. **Chapter 05: 3D Gallery with 4K Filter Pill Active**:
   ![3D Gallery 4K Active](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/gallery_4k_filtered_1791472192974.png)
10. **Chapter 06: Formats & Versatility (Devices on Illuminated Circular Pedestal)**:
    ![Formats Pedestal](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/formats_pedestal_view_1791472249506.png)
11. **Chapter 06: Formats Pedestal with Alpha Format Pill Selected**:
    ![Formats Alpha Selected](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/formats_alpha_selected_1791472274210.png)
12. **Ecosystem CTA & Footer**:
    ![Footer Section](file:///Users/kamalkant/.gemini/antigravity-ide/brain/3a680ada-a58b-4266-8cac-748aa3a65cd5/footer_section_1791472303545.png)
13. **Full End-to-End Browser Walkthrough Recording**:
    Session recording saved at `vdo_storyboard_3d_scroll_1791471706951.webp`.
