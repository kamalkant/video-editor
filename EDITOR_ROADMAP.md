# VDO Studio Roadmap — what we build next, sprint by sprint

**Name:** VDO Studio (previously VDO Studio / VDO Video Editor; internal names such as the `VDO:` storage keys stay).

**Last updated:** 27 Sep 2026 (the Easy and Medium features: crop, presets, color, backdrops, stabilize, speed, transitions, masks, looks, Brand Kit, templates, music library — see [3c](#3c-full-editor-many-clips-google-vids-ideas-sept-2026))

**Goal:** turn VDO into a proper video editor like the "AI Studio" mockup. Build it one sprint at a time, **easy and immediate things first**, and leave complicated things for later.

This file is the working order. The big picture (all 52 features, AI and platform phases) is in [PRODUCT_PLAN.md](PRODUCT_PLAN.md). The tested video recipe is in [ROADMAP.md](ROADMAP.md).

---

## Contents

1. [Rules for picking features](#1-rules-for-picking-features)
2. [Where we are today](#2-where-we-are-today)
3. [Sprint plan (in order)](#3-sprint-plan-in-order) · [3a. Empty screen](#3a-empty-screen-before-any-upload) · [3b. AI Smart Background Removal](#3b-ai-smart-background-removal-no-green-screen)
4. [Feature board: every mockup feature and its sprint](#4-feature-board-every-mockup-feature-and-its-sprint)
5. [Later: medium features (Phase 2B)](#5-later-medium-features-phase-2b)
6. [Much later: hard features (Phase 2C)](#6-much-later-hard-features-phase-2c)
7. [Not now: Phase 3 and 4](#7-not-now-phase-3-and-4)
8. [How each sprint works](#8-how-each-sprint-works)

---

## 1. Rules for picking features

A feature is **"immediate"** (picked now) when all of these are true:

- ✅ It works **on your Mac**, with the FFmpeg you already have. No new paid services, API keys or cloud.
- ✅ It needs **one video track** only. The multi-track timeline comes later.
- ✅ It can be built and tested in **about 1–2 weeks**.
- ✅ It fits the mockup's layout, so nothing we build is thrown away later.

Anything else goes to **Later (2B)** or **Much later (2C)**.

Complexity labels used below:

| Label     | Meaning                                                                    |
| --------- | -------------------------------------------------------------------------- |
| 🟢 Easy   | A few days. Uses what already exists                                       |
| 🟡 Medium | About 1–2 weeks. Needs one new building block                              |
| 🔴 Hard   | Several weeks. Needs a big new engine (e.g. multi-layer real-time preview) |

---

## 2. Where we are today

**Done:**

- **Editor frame like the mockup (dark theme):**
  - top bar with project name, autosave status, main menu, undo/redo, Help and Export ▾;
  - left rail; Media panel (Upload · My Assets) and Projects panel;
  - two previews side by side (Original Video | Transparent Preview) with player bar and preview backgrounds;
  - tool strip + timeline (Video 1 clip with filmstrip, sound waveform, playhead you can drag);
  - inspector (Background Removal, Background & Overlays);
  - Output Settings column; Templates strip; Export & Share box.
  - Parts not built yet are shown but disabled ("Soon").
- **Projects:** saved automatically on this computer, rename, delete, open again (`?p=` link); videos used by a project are kept.
- **My Assets:** every upload with thumbnail and length; click to use; delete (refused while a project uses it).
- **Background removal:**
  - Color Key: magnifier picker, auto-detected green/blue (also for smoke and powder clips), presets, Green removal, Edge softness, spill removal, edge shrink, feather, see-through warning, "Effects" mode;
  - Black background mode for fire, sparks and fireworks (exact "unmult");
  - a clear message when a clip has no green screen.
- **Preview:** Side by side / Result / Original / Before-After (draggable) / Alpha / Final file; hold to compare; zoom; full screen; live GPU preview while playing, exact FFmpeg frame when paused; checker / white / black / custom / image / video backgrounds.
- **Export:** WebM (VP9 + alpha) + MOV (HEVC + alpha), poster, zip, optional ProRes; size estimate; crop empty area; Export dialog, quick presets, embed code (pause button, reduced motion), test page, QR.
- 111 unit/integration tests and 19 browser tests (the browser tests use their own server and storage).

---

## 3. Sprint plan (in order)

Time estimates are rough guesses for one developer.

### Sprint 0 — Finish Phase 1 (pending items) · ~1 week · 🟢 — ✅ Batch A done 26 Sep 2026 (0.2–0.6, 0.9)

| #      | Item                                                                      | Level | Notes                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1    | **Test 3–5 real Veo clips** and tune defaults                             | 🟢    | White top, loose hair, fast hands, a darker shot. You upload them; I measure and adjust                                                                                                                       |
| 0.2 ✅ | **Crop to the person** (auto-crop empty area) + padding                   | 🟢    | Two-pass `bbox` on alpha → `crop`. The biggest file-size saving                                                                                                                                               |
| 0.3 ✅ | **File-size estimate** before export                                      | 🟢    | Encode 1 second, then multiply. Shown in the Export panel (like the mockup's "Estimated size")                                                                                                                |
| 0.4 ✅ | **Side-by-side view** (Original next to Removed)                          | 🟢    | Like the mockup's two previews, as one extra view option                                                                                                                                                      |
| 0.5 ✅ | **Image / Video** tiles in Preview background                             | 🟢    | Check the avatar over a screenshot of your own website                                                                                                                                                        |
| 0.6 ✅ | Embed code options: **pause button**, poster, reduced motion              | 🟢    | Small additions to the snippet                                                                                                                                                                                |
| 0.7    | Browser check on **Firefox, Windows Chrome/Edge, Android, a real iPhone** | 🟢    | Use the test page + QR; write results in ROADMAP §10. Automatic Firefox testing doesn't start on this Mac (Playwright's Firefox fails with "Could not find profile folder"), so Firefox is a manual check too |
| 0.8    | _Only if 0.1 shows the need:_ "Shadowed background" mode, alpha clean-up  | 🟡    | Tested on synthetic clips; add only if real clips need it                                                                                                                                                     |
| 0.9 ✅ | **On/off switch for Background Removal** (header of the panel)            | 🟢    | Like the mockup's toggle. The operation already has an `enabled` flag                                                                                                                                         |

**Batch A+ (from your real clips) — ✅ done 26 Sep 2026**

| #      | Item                                                                        | Notes                                                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A+1 ✅ | **Better green detection for effect clips**                                 | If the border isn't green (smoke, holi powder, a muzzle flash reaching the edge), VDO looks at the whole frame. A blue shirt or a grey room is not picked as the key                                                                                       |
| A+2 ✅ | **"What's in the clip?" → Effects (smoke, fire, sparks)**                   | No see-through warning for smoke and glow, which are meant to be partly see-through. Chosen automatically when the green was found inside the frame. The warning also has an "This is an effects clip" button                                              |
| A+3 ✅ | **Clear message when there is no green/blue screen**                        | "No green or blue background found"; removal starts **off**, so nothing is removed by mistake. Picking a color switches it on                                                                                                                              |
| A+4 ✅ | **Remove black background** (fire, sparks, fireworks, light leaks on black) | New _Background type → Black background_. Uses the exact "unmult" method: see-through = brightness, and the color is restored, so glow stays bright on white websites ("Keep glow brightness"). Clips with a black border start in this mode automatically |

Note: detection runs when a clip is uploaded, so **re-upload older clips** to get it.

**Done when:** your real clips look clean on Chrome, Safari and iPhone, and the file size is shown before export.

---

### Sprint 1 — Editor layout, media library, projects · ~2 weeks · 🟡 — ✅ done 26 Sep 2026 (Batch B, with the dark mockup design)

This builds the **frame of the mockup**, so every later feature has a place to live.

| #      | Item                                                                    | Level | Notes                                                                                              |
| ------ | ----------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| 1.1 ✅ | **New layout like the mockup**                                          | 🟡    | Left rail → side panel → preview → tool strip → timeline area → inspector                          |
| 1.2 ✅ | **Media panel** (Upload · My Assets)                                    | 🟢    | Thumbnail grid with duration; click to use; drag and drop (Stock comes later, it needs an API key) |
| 1.3 ✅ | **Projects**: save automatically, project list, rename, delete          | 🟡    | Saved locally (SQLite). The "Projects" rail item. A reload or restart keeps your work              |
| 1.4 ✅ | **Project model v2** (tracks → clips → effects)                         | 🟡    | Today's settings move into it automatically. Nothing breaks                                        |
| 1.5 ✅ | **Export dialog** (moves output settings off the screen)                | 🟢    | Presets + size estimate + progress + downloads, like "Export & Share"                              |
| 1.6 ✅ | **Empty states for every area** (full editor visible before any upload) | 🟢    | See [Section 3a](#3a-empty-screen-before-any-upload)                                               |
| 1.7 ✅ | **Export ▾ menu** (quick presets from the button)                       | 🟢    | "Website transparent pack", "MP4 16:9", "MP4 9:16 (Reels/Shorts)"                                  |

**Done when:** you can open VDO, see your projects and media, continue where you left off, and export as today. ✅

Notes on what was built:

- Projects are JSON files in `storage/projects/` (not SQLite: nothing to install). Autosave 0.6 s after the last change; unsaved changes are also sent when the tab closes.
- Project model v2: tracks → clips → effects. Old links (`?v=…&job=…`, `/results/…`) open in a new project automatically.
- The 24-hour cleanup keeps every video and export a project uses.
- Export ▾: MP4 at the project size (recommended) and 4 social sizes, the 2 see-through website packs, and "All formats & settings…" (27 Sep).
- Help (`?` key) lists all shortcuts.

---

### Sprint 2 — Timeline v1 (one video track) · ~2 weeks · 🟡 — ✅ done 26 Sep 2026

| #      | Item                                                                              | Level | Notes                                                             |
| ------ | --------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------- |
| 2.1 ✅ | **Timeline**: time ruler, playhead, clip with thumbnails (filmstrip), zoom in/out | 🟡    | One video track, like the mockup's "Video 1" row                  |
| 2.2 ✅ | **Trim** (drag the clip's start/end)                                              | 🟢    | FFmpeg `trim` + `setpts`                                          |
| 2.3 ✅ | **Split** at the playhead                                                         | 🟢    | One clip becomes two                                              |
| 2.4 ✅ | **Cut / Delete** a part                                                           | 🟢    | Split twice, delete the middle; the rest joins up                 |
| 2.5 ✅ | **Keyboard shortcuts**                                                            | 🟢    | Space play/pause, J/K/L, S split, Delete, ⌘Z / ⇧⌘Z, ← → one frame |
| 2.6 ✅ | Track **eye / lock** icons                                                        | 🟢    | Like the mockup                                                   |

**Done when:** you can trim a Veo clip, cut out a bad part, and export only what's left. ✅

Notes on what was built:

- **The timeline holds the kept parts of the clip**, in order and back to back.
  - Split (S), Cut (select a part, then Delete) and Trim (drag a part's edge; Q / W trim to the playhead; the arrow keys on an edge move one frame, Shift one second).
  - Undo/redo and autosave work, and the parts are saved in the project as clips on Video 1.
- **The preview plays only the kept parts.** It jumps over cuts, and its time bar shows timeline time.
- **The export cuts picture and sound together** (FFmpeg `select` / `aselect`). An uncut clip exports exactly as before.
- **Timeline controls:**
  - zoom 1×–16× (it follows the playhead while playing);
  - length shown in tenths ("0:02.7 · 2 parts");
  - Audio track mute (= Remove audio);
  - Video 1 lock (no edits).
  - Video 2 / Text / Effects stay empty for now.
- **Shortcuts:** Space, J/K/L, ← → (Shift: 1 s), Home/End, S, Delete, Q/W. They're listed in Help (?).
- **Not yet:** dragging parts to reorder them, and different effects per part. Every part shares the same background removal.

---

### Sprint 3 — Frame & background · ~2 weeks · 🟢/🟡

| #   | Item                                                                 | Level | Notes                                                                                               |
| --- | -------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| 3.1 | **Crop** (drag a box on the preview + ratio presets)                 | 🟢    | FFmpeg `crop`                                                                                       |
| 3.2 | **Resize / canvas**: 16:9, 9:16, 1:1, 4:5 with fit/fill and position | 🟢    | FFmpeg `scale` + `pad`. For Shorts/Reels                                                            |
| 3.3 | **Rotate / flip**                                                    | 🟢    | FFmpeg `transpose` / `hflip`                                                                        |
| 3.4 | **Background panel**: Transparent · Color · Gradient · Image         | 🟡    | The mockup's "Background & Overlays". The keyed person is placed over the new background            |
| 3.5 | **MP4 export** (finished video with background)                      | 🟢    | H.264 + AAC, in 16:9 / 9:16 / 1:1                                                                   |
| 3.6 | **Blur background** (keep the original background, blurred)          | 🟢    | We already have the person's matte: the person goes over a blurred copy of the same video (`gblur`) |

**Done when:** you can put the presenter on a color or image background, make a 9:16 version for Reels, and export an MP4 that matches the preview.

---

### Sprint 4 — Speed & sound · ~1–2 weeks · 🟢

| #   | Item                                                          | Level | Notes                                              |
| --- | ------------------------------------------------------------- | ----- | -------------------------------------------------- |
| 4.1 | **Speed** 0.25×–4× (sound pitch kept)                         | 🟢    | `setpts` + `atempo`                                |
| 4.2 | **Reverse**                                                   | 🟢    | `reverse` / `areverse` (fine for clips up to 60 s) |
| 4.3 | **Freeze frame** (hold one frame for N seconds)               | 🟢    | Split + hold frame                                 |
| 4.4 | **Clip audio**: volume, mute, fade in/out, normalize loudness | 🟢    | `volume`, `afade`, `loudnorm`                      |

**Done when:** you can slow down or speed up part of the clip, freeze a moment, and even out the sound.

---

### Sprint 5 — Look (Adjust & Filters) · ~1–2 weeks · 🟡

| #   | Item                                                            | Level | Notes                                                                        |
| --- | --------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| 5.1 | **Adjust**: brightness, contrast, saturation, temperature, tint | 🟡    | FFmpeg `eq` / `colorbalance`, plus the same math on the GPU for live preview |
| 5.2 | **Filters** (8–12 presets: Warm, Cool, B&W, Vivid, Cinematic…)  | 🟢    | Presets of Adjust values, or `.cube` LUTs via `lut3d`                        |
| 5.3 | Before/after for adjustments                                    | 🟢    | Reuses hold-to-compare                                                       |

**Done when:** you can match the avatar's colors to your website and pick a filter.

---

✅ **After Sprint 5** VDO is a real single-track video editor: projects, media library, timeline, trim/split/cut, crop, resize, rotate, background, speed, reverse, freeze, audio, colors, filters, plus transparent and MP4 export.

---

## 3a. Empty screen (before any upload)

From the second mockup. The **whole editor is visible from the start**, and each area says what to do. This is built in Sprint 1 (1.6). Today VDO shows only one big upload box.

| Area             | Empty-state text (plain words)                                                  | Action                           |
| ---------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| Media panel      | "No media yet — upload a video to get started"                                  | Drag & drop box, **Choose file** |
| Original preview | "No video loaded — upload a video to see the original"                          | —                                |
| Removed preview  | "Transparency preview — upload a video and pick the background color"           | —                                |
| Timeline         | "Drop media here to start editing" (tracks already shown: Video 1, Text, Audio) | Drop target                      |
| Inspector        | Settings shown but disabled until a video is loaded                             | —                                |
| Templates        | Grey placeholder cards (real templates in 2B)                                   | —                                |
| Export           | "No video loaded — upload and edit a video to see the estimated size"           | Generate and Download disabled   |

Keep from our tested version (the mockup still shows the old values):

- Green removal 0.05 / Edge softness 0.15;
- no "Green Shade Tolerance" and no "Edge Cleanup" sliders;
- sound kept when detected;
- the Safari file is always made together with the WebM (not a single choice).

---

## 3b. AI Smart Background Removal (no green screen)

Asked for on 26 Sep 2026: remove the background from **any** video (a room, a street, a newsroom, moving camera), keep only the person or object, with stable edges across frames.

**Status: AI-1 ✅ done 26 Sep 2026.** It's the "AI Removal" tab. It was tested on your temple clip (video.mp4, 33 s): the mask was ready in about 32 s and the playing preview about 15 s later. The prototype results are in [scripts/vision-matte/README.md](scripts/vision-matte/README.md).

**How it can run here, for free:** Apple's Vision framework is built into macOS and runs on the Mac's Neural Engine. There is nothing to install and no cloud or API key.

- **Person segmentation** for people, with Apple's own frame-to-frame smoothing.
- **Subject lifting** ("foreground instance masks") for any object, and separate masks per person or object. Click-to-select uses these.

Step order (easy first):

| #       | Step                                                                                            | Level | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-1 ✅ | **AI Removal (auto)**: keep the person (and what they hold), remove everything else             | 🟡    | What it does:<br>• "What to keep": Person + what they hold (hybrid) / Person only (soft hair) / Main object.<br>• Quality Balanced / Accurate; remove specks & watermark.<br>• Refine: flicker smoothing Off/Light/Strong, edge shrink, feather, edge hardness.<br>How it works:<br>• The mask is made once per clip and setting (lossless FFV1), with progress.<br>• The paused preview works at once from a one-frame mask.<br>• Playing uses a picture-over-mask H.264 preview.<br>• Export has a "Finding the subject (AI)" step.<br>• Crop and the size estimate use the mask too.<br>• "No green screen found" offers "Use AI Removal" |
| AI-2    | **AI Cutout: click to select a subject** (Person A only, a product, a car)                      | 🟡    | Click in the preview. VDO follows that subject through the clip (frame-to-frame overlap). Multiple subjects: click more                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AI-3    | **Mask preview + refinement**: Hair detail, Edge quality, Motion edge presets                   | 🟡    | Presets map to the mask quality level and smoothing strength                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AI-4    | **Correction brushes**: Keep / Remove / Eraser / Restore                                        | 🔴    | Paint on one frame; carrying it through the clip needs tracking (optical flow or a video model)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AI-5    | **Background after removal**: Blur (keep the original background, blurred), Color, Image, Video | 🟡    | Same as Sprint 3 "Background & Overlays"; needs MP4 export for non-transparent results                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AI-6    | **AI-generated background from a prompt**                                                       | 🔴    | Needs an image-generation service (API key, paid)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| AI-7    | **Live (webcam) removal**                                                                       | 🔴    | In the browser (MediaPipe/ONNX, not Apple Vision); prepare the "Live" mode only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Also in the request, and already covered by other sprints:

- MP4 H.264/HEVC output (Batch D).
- Resolutions 640–3840 and custom.
- Advanced CRF, bitrate and preset (these stay behind "Advanced").
- "Keep original canvas" next to crop.
- Spill for red and blue as well as green.

Not planned, because testing showed they don't help: "Color tolerance" and "Edge cleanup" in Color Key. They have no real filter behind them; see ROADMAP §6.

---

## 3c. Full editor: many clips, Google Vids ideas (Sept 2026)

You asked for this on 26 Sep 2026: "this is not only a background removal tool". The timeline should expand and take many clips, and the Google Vids ideas should be added. The plan is in milestones M0–M6.

| Milestone                                                  | Status                                                         | What works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** Quick wins                                          | ✅                                                             | Name **VDO Video Editor**. The timeline can be made taller or shorter (drag bar, remembered). Right-click menu on clips. Snapping to edges and the playhead (hold Alt to turn it off). **Remove silences** (finds pauses with FFmpeg, shows them in red, cuts them in one undo step)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **M1** Many clips + media                                  | ✅                                                             | Timeline model v3: canvas + tracks. Overlay tracks (pictures, picture-in-picture) sit above the magnetic **Video 1**; audio tracks sit below. Old projects convert automatically. Uploads can be **videos, pictures (PNG/JPG/WebP) and sound (MP3/WAV/M4A)**; a video can be up to 10 min. My Assets: click "+" or drag onto a track. Clips: select, move, reorder on Video 1, trim edges, split, cut (the gap closes on Video 1), duplicate (⌘D). Tracks: add, remove (when empty), lock, hide, mute. Background removal is set **per video clip**. Inspector per selection: Picture (length, fit/fill, size, position, fades), Sound (volume, fades, "quieter while someone speaks"), Clip (sound, volume, position, fades), Project (canvas size, background color or transparent). Several files can be chosen or dropped at once (they upload one after another)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **M2** Program preview                                     | ✅ (partly)                                                    | "Program" plays the whole timeline on the canvas: clips back to back, pictures on top, each clip with its own background removal (live GPU key), fades and position. "This clip" is the exact per-clip preview (Side by side, Result, Before/After, Alpha, exact frame). Music and voiceover clips play along (volume and fades). Ducking is heard in the preview too (27 Sep)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **M3** Export                                              | ✅ (partly)                                                    | One FFmpeg "compose" command: canvas color (MP4, H.264 + AAC) or transparent (WebM + Safari MOV website pack, ProRes). Pictures, fades, volumes and ducking are included. A single video exports exactly as before (all old tests pass). MP4 presets are in Export ▾ (27 Sep). **Still missing:** size estimate and "crop empty area" for multi-clip timelines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **M4** Text and titles                                     | ✅                                                             | **Text** panel (rail and top menu) with 5 styles: Title, Lower third (name + role bars), Breaking news bar, Caption, Plain. Click one to add it at the playhead on a free overlay track. Text card: words, style, font (5 system fonts), size, bold, align, text/box/second colors, shadow, length, position. **Animations** in and out (Fade, Slide, Rise) for text and pictures. **On the preview:** click a clip to select it, drag to move (snaps to the middle; Alt turns it off), drag a corner to resize, arrow keys / + − to nudge; double-click a text to edit it; each drag is one undo step. Export: the browser draws each text as a PNG (this FFmpeg has no text support) with the same code as the preview, so the file matches; the animation curves are the same maths in the preview and in FFmpeg. A transparent canvas with only text and pictures (a see-through lower third) can be exported too. Your own brand fonts work since 27 Sep. **Still missing:** text on Video 1, per-word animations                                                                                                                                                                                                                                                                                                                          |
| **M5** Music and voiceover                                 | ✅ (mostly)                                                    | Audio tracks with volume and fades, in the preview and the export; ducking in the export. **Record** (below) gives voiceovers and a teleprompter. Ducking is heard in the preview too; a music library and sound effects (27 Sep)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **R1** Pro layout + reliable preview (26 Sep 2026)         | ✅                                                             | **One fixed screen** (the page no longer scrolls: hidden slider labels escaped their scroll box). **Bigger preview** (≈725×408 at 1440×900, was 330×185): Templates strip → Templates panel in the rail; preview background → a "Background ▾" popover in the preview toolbar; Output settings → Export dialog + a fold-out under Project; Export & Share at the bottom of the right column. **No side-by-side**: one preview with Result / Original / Before–After / Alpha (since 28 Sep an optional split view shows Program next to This clip). **Preview engine**: a small shared pool of video elements per file (was one per clip, max 40 → black clips after many cuts); the next clip and the next file seek early; the last frame is held until the new one is ready (no black or old frames at cuts); every AI Removal clip gets its own playing preview. **Timeline**: fixed scale (adding clips no longer squeezes it; it grows and scrolls), zoom slider, Fit, ⌘+scroll zoom, sticky ruler and track names, the selected clip's track scrolls into view                                                                                                                                                                                                                                                                            |
| **R2** Record                                              | ✅                                                             | **Record** button (top bar), Media panel and the start screen: **Camera**, **Screen** (+ tab/computer sound), **Screen + camera** (two clips: screen on Video 1, camera box on an overlay, same start), **Voice only** (at the playhead). Device pickers, mic level, mirror, 3-2-1, pause/resume, 10-min limit, read-along script, review → Add / Retake / Discard. The server re-encodes each recording once (constant 30 fps H.264 via VideoToolbox + AAC, or M4A) so editing is smooth                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **R3** AI Tools panel (from `prototypes/AI tools UI.png`)  | ✅                                                             | Wide panel on the right; preview on top, timeline below. All 26 tools shown in 5 sections; "Describe what you want to do…" finds the tool (locally). **Working:** Remove Background (AI), Green Screen, **Blur Background** (new: AI mask + blurred copy, solid → MP4), **Remove Background Noise** (new: FFmpeg afftdn, Light / Strong, heard in the preview via a cached cleaned sound), **Remove Silences**, **Text to Speech** (new: the Mac's own voices incl. Indian English, offline). The rest: Soon / Later (cloud AI)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **R4** Everything planned is visible                       | ✅                                                             | `lib/roadmap.ts` lists every feature (ready / next / later). Rail and top-menu items not built yet (Background, Elements, Audio, Subtitles, Brand Kit, Effects, Transitions, Templates) open panels of their planned features with "Soon" badges; ready ones there are clickable. **`/roadmap`**: a shareable "What's coming" page (linked from Help, AI Tools and every panel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **E1–E6** Easy features (27 Sep 2026)                      | ✅                                                             | **Crop, rotate, flip** (clip card and crop mode on the preview, rotate handle). **Export presets** (YouTube 16:9, Shorts 9:16, Square, Instagram 4:5; the project stays as it is). **Color** (brightness, contrast, saturation, temperature, sharpen) and **Auto Color / Enhance**. **Replace Background**: a backdrop under everything (gradient, 8 built-in studio sets, a picture or a looping video) in a real Background panel. **Stabilize** (a cached steadied copy). **Ducking you can hear in the preview** (same speech ranges as the export)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **M1–M7** Medium features (27 Sep 2026)                    | ✅                                                             | **Speed** 0.25×–4× (keeps the pitch), **Reverse** (a cached backwards copy), **Freeze frame**. **Transitions** on Video 1 (crossfade, dip to black/white, slides, pushes; the clips overlap; marker + card on the timeline). **Shape masks**: rounded, circle, round camera bubble (timeline Mask tool, clip card; Screen + camera recordings get the bubble). **Looks**: 8 filters + vignette (clip card and Effects panel, "use on every clip"). **Brand Kit**: logo on the video (corner, size, opacity), brand colors next to every text color picker, your own fonts (TTF/OTF/WOFF) in the font list, intro and outro. **Templates**: 9 ready-made projects (news, social, business). **Music library**: 6 music beds + 10 sound effects made on this Mac, plus your own music folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **X** Extras asked for on the way                          | ✅                                                             | Track names editable, names column draggable. Preview ratio (16:9, 9:16, 4:3, 1:1, 4:5, 21:9 or typed). **Watermark & logo remover** (remove / blur / cover with a picture). Draggable dividers between the panels (no extra gap). Preview sound on by default. AU logo and favicon. New clips **keep their background** until you click "Remove it". **Preview zoom** (− / Fit / +, ⌘ + scroll). AI Removal keeps the clip's voice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **F** Export formats (27 Sep 2026)                         | ✅                                                             | **MP4 (H.264) is the recommended default** (first in the list, tagged). Every other format is listed below it, in groups. **Video:** MP4 (HEVC), MP4 (AV1), WebM (VP9), MOV (ProRes 422 HQ). **See-through (alpha):** WebM (VP9 + alpha), MOV (HEVC + alpha), the website pack (both + poster + embed code), MOV (ProRes 4444). **Animation / picture:** GIF (≤ 30 s, 15 fps, ≤ 640 px, a best palette), PNG (keeps alpha) or JPG of the frame at the playhead. **Sound only:** MP3, M4A (AAC), WAV (no picture is rendered). Any format at the project size or a social size; Small / Balanced / Best quality where it matters. Formats that can't be made are greyed with the reason (alpha needs a transparent project; sound needs sound; GIF length). A transparent project in a solid format goes on black. Export ▾: "MP4 · project size" first. One compose command for all of them (`lib/render/compose.ts`), real-encode tests for each (`tests/integration/formats-export.test.ts`). **Also:** a click on the dark area around the preview picture selects nothing                                                                                                                                                                                                                                                                   |
| **T** Theme (27 Sep 2026)                                  | ✅                                                             | One icon in the top bar, before Help: each click goes **Dark** (default) → **Light** → **Match my computer**. Saved in this browser and applied before the page paints (no flash). Every color is a CSS token (`app/globals.css`); the light set swaps them all, the preview area included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **G** Gemini features (27 Sep 2026)                        | ✅ (tested with a pretend Gemini; real calls wait for the key) | The only features that go online, marked **Gemini**, only when clicked; each button says what it sends and costs. Key: `GEMINI_API_KEY` in `.env.local` (server only; scrubbed from errors; never sent along redirects). **Subtitles** panel: Gemini listens to Video 1 (or the selected clip), writes timed phrases (20+ languages, Hinglish), they land as Caption texts on a "Subtitles" track (one undo step); translate to a new track (original hidden); .srt / .vtt download; "use this style on all". **Generate image / background** (3 qualities, the project's shape; "Use as background" / "Add to timeline"; "Change this one"). **Gemini voices** in Text to Speech (30 voices, a style you describe). **Generate video** (Veo 3.1 Lite / Fast / Standard, 4–8 s, 720p/1080p, optional start picture; keeps going when the window is closed; one at a time; resumes after a restart). Results are kept by the 24-hour cleanup. Models are picked from the key's own list. `GEMINI_FAKE=1` for the tests; paid live checks only with `GEMINI_LIVE=1`                                                                                                                                                                                                                                                                               |
| **N** "None" transition (27 Sep 2026)                      | ✅                                                             | The first card in Transitions and the first choice in a transition's card: a plain cut (removes the transition). Plus "Remove every transition on Video 1". The top-bar Record button is gone (Record lives in Media and on the empty preview)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **K** AI settings (27 Sep 2026)                            | ✅                                                             | AI Tools → **Settings**: one card per AI service (Google Gemini ready; xAI Grok and OpenAI keys can be saved, marked Soon). Paste a key → it is checked with a free call and saved in `storage/settings/ai-keys.json` (this user only, never shown again: only its last 4 characters). An on/off switch per service; **Remove key**. Off or no key: the features show "switched off" / "add a key" with an "Open AI settings" button, and nothing is sent. Keys can be changed only on this computer (not from a phone in LAN mode). A saved (or removed / switched-off) setting wins over `.env.local`. Real checks on the user's key (free tier): subtitles ✓, Hindi translation ✓, voice ✓; pictures and Veo need billing on the Google account (Google says "limit 0" on the free tier), and the editor says exactly that                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **C** Copy / paste clips (27 Sep 2026)                     | ✅                                                             | ⌘C / ⌘X / ⌘V and Copy · Cut · Paste at the playhead in the clip menu. On Video 1 the copy goes right after the clip under the playhead (without its transition); pictures, text and sound go at the playhead on their track, or a free one. Works across projects (the clip's upload comes along). My Assets: one click now only selects a file; the + button, a double-click or a drag adds it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **I** Import from the web (27 Sep 2026)                    | ✅                                                             | **Add media** (top bar), "Import from the web" and the **Stock** tab (Media) open **Import**: My computer · Pexels · Pixabay · YouTube. Search → pick → **Add to timeline** or **Save to My Assets**, with progress and the credit ("by … on Pexels", kept on the upload). The server looks the item up again by id and downloads only from the libraries' own hosts (size and length limits); thumbnails go through our own proxy (the editor makes no outside requests). **YouTube**: official search (YouTube Data API key) and a youtube-nocookie preview; importing needs a tick ("my own video" / "Creative Commons, I'll credit") and uses yt-dlp (installed with Homebrew); CC is checked against the video's licence. Keys for Pexels, Pixabay and YouTube in **API keys** (the renamed AI settings, now in two groups). `IMPORT_FAKE=1` for the tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **P** Tabbed inspector (27 Sep 2026)                       | ✅                                                             | The right panel for a video or picture clip is one **Clip** card with icon tabs: **Basic** (fit, size, position, crop & rotate, shape) · **Cutout** (background removal) · **Color** (color, looks) · **Audio** (sound, volume, noise, fades) · **Speed** (speed, reverse, stabilize) · **More** (logo boxes, video info). One tab shows at a time (about 3,200 px of settings became at most about 800). Sliders inside are one row each (label · slider · number); long help texts are shorter; the Cutout tab's presets / edges / spill fold into **Fine-tune** (the see-through warning stays in sight). Tools open the right tab (AI Tools → Remove noise → Audio, Stabilize → Speed, Auto Color → Color; timeline Crop / Mask → Basic, Speed / Reverse → Speed). Pictures: Basic · Color · More. Nothing selected: the Project card. The old "Background & Overlays" mockup card is gone (the Background panel does it)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **R** Reset clip settings (27 Sep 2026)                    | ✅                                                             | A tab with changes shows a small dot. One **↺** icon always sits in the Clip header (dim when nothing changed), so nothing moves when a change appears; it opens a menu: **Reset <tab>** (e.g. Reset Cutout switches the green removal off and goes back to the clip's own detected color) or **Reset all**. The trim, the place on the timeline, a picture's length and the transition are kept; Undo brings the settings back. The right panel's card fills the full column height                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **S** Size, logo, crop and drop feedback (27 Sep 2026)     | ✅                                                             | **Export size before exporting**: "Size: about 24 MB" in Export & Share and "~ MB" on every format (a 2-second test encode of the project's longest clips, then measured ratios per format and quality; lib/export/size). **Logo on the preview**: drop a picture from My Assets (or the computer) on the preview: it lands logo-sized (a fifth of the width) where you drop it, for the whole video; the Brand Kit logo can be clicked on the preview, dragged anywhere (snaps to its corners and the middle), resized from its corners, and has a Logo card. **Crop**: the whole picture stands still and only the outline moves; the ratio buttons and edge sliders open crop mode; no edge past 45 %; flipped pictures crop the side you drag. **Timeline**: a dashed shadow shows where a dragged file or clip lands, and Video 1 clips slide to make room. **Compact right panel**: one-row sliders everywhere, narrower number boxes without "%". **Icons**: record buttons, Program / This clip, the pipette; color boxes and the Background type tiles restyled; thin (6 px) scrollbars                                                                                                                                                                                                                                                |
| **K2** Keyframes (27 Sep 2026)                             | ✅                                                             | Like CapCut: ◆ (timeline tools or the Basic tab) saves a clip's place, size, angle and opacity at the playhead; between keyframes it glides (smooth, or steady per keyframe). With keyframes, a change on the preview or in the inspector at another moment adds a keyframe there. Diamonds on the clip: click to go there, drag to move (one undo), right-click to remove; ◀ ▶ jump between them. Works on video, pictures and text (text: place, size, opacity). New Opacity slider. Split, trim, remove silences and speed keep the motion exactly. The export uses the same curves (FFmpeg expressions: lib/player/motion; working size, rotate then scale, animated alpha) — preview = file. Also: the timeline follows the playing playhead smoothly; the red line goes under the track names; Undo works on picture-only projects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **E** Edit panel, logo, text and transitions (28 Sep 2026) | ✅                                                             | **Edit** (left rail) is a panel of big tool buttons for the selected clip (split, trim, duplicate, keyframe, crop, speed, reverse, freeze, shape, silences, delete) and shortcuts to its settings. **Logo**: a box behind it (brand colors one click away), rounded corners, comes in / goes out (fade, pop, slide), only a part of the video; switched off and on it comes back the same (the Brand Kit remembers its look); brand colors no longer vanish when clicked. **Text**: 9 more ready-made styles (Big title, Outline title, Neon, Quote, Callout, Subscribe button, Social handle, Chapter, End credits); effects (outline, gradient, letter spacing, box shape: rounded / pill / square, shadow: soft / strong / glow); animations pop, zoom, bounce, blur, typewriter. **Transitions**: wipe ×4, zoom in / out, circle open / close, spin (preview = export). Also: the first thing dropped on an empty timeline starts at 0; while dragging, the picture floats above the drop shadow                                                                                                                                                                                                                                                                                                                                            |
| **T** Top bar, versions, corners, zoom (28 Sep 2026)       | ✅                                                             | The top bar no longer repeats the left rail. It now has: the **project ▾** (rename, duplicate, save a version, new project, and your saved projects to switch to); the project **size icon** (hover: size · ratio · fps · length · clips; click: size and the **frame rate** the export uses); **Search tools** (⌘K: tools, panels, text styles, projects, export; a tool that can't be used says why; AI entries only open their windows); **Background tasks** (exports, Veo, uploads, steadied / reversed copies, AI cut-out, subtitles, link imports, with progress; a click goes to the work; recently finished ones stay 10 min); the **AI status** dot (ready / test mode / no key; a click opens API keys; the key is never shown); **Save a version** (named copies next to the project; restore saves what you had as an automatic version first and is one undo step; the 24-hour cleanup keeps their uploads; 50 per project); **Focus mode** (F / Esc; hides the side panels). ⌘S saves now. **Preview**: a clip turns from just around its corners (the dot above it is gone), with the angle shown while turning and `[` / `]` for 1° (Shift: 15°); zoom sizes 25–400 % with fine steps near Fit (95, 90, 85…) and a size menu. Also fixed: after **New project** the next upload makes a new project even without a page reload |
| **EL** Elements (28 Sep 2026)                              | ✅                                                             | The **Elements** panel works: **shapes** (box, rounded box, circle, triangle, diamond, star, frame, ring, highlight box, numbers 1 · 2 · 3), **lines and arrows** (line, dashed, divider, hand-drawn underline, arrow, double and curved arrows, highlighter), **27 stickers drawn by the app** (bursts with words, speech and thought bubbles, SALE tag, stamp, ribbon, check, cross, warning, heart, crown…), **400+ emoji** with search plus an "Any emoji" box (Ctrl ⌘ Space), and **news graphics** (LIVE, BREAKING, EXCLUSIVE, REC, a progress bar that fills as the video plays, a scrolling news ticker, and your Brand Kit logo in a corner). Each is a new **element clip**, drawn by the browser from its settings, so colors, outline, words and fonts stay editable; it moves, resizes, **stretches from a side**, turns from a corner and has keyframes, animations and fades. The export gets the browser's PNG and places it like a picture (FFmpeg slides a window for the progress bar and the ticker; turns are premultiplied, so edges stay clean). Also: a timeline of only text and elements can export; new text and elements never land on a hidden or subtitle track. The product is now named **VDO Studio**                                                                                                          |
| **BL** Blank scenes (28 Sep 2026)                          | ✅                                                             | Like Google Vids: a **blank scene** on Video 1, a plain color card (black by default, 3 s) to put titles, text and elements on. Add one with the **+** after the last clip on Video 1 (then drag it anywhere on Video 1), **right-click a clip → Add blank before / after**, **Start with a blank** on an empty project, or **New project with a blank** (the project menu and Search tools). Text and elements added while the playhead is on a blank start with it and last 3 s; blanks and what's on them get longer or shorter like any clip. Its card: color (brand colors), length, fades, "Add a title on it", "Add an element". Transitions, fades and dips work into and out of it, in the preview and the export (a color source through the picture path). Blanks stay on Video 1 and survive saving (the clean-up used to drop any clip without an upload)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **P1** Polish batch (28 Sep 2026)                          | ✅                                                             | **Timeline**: the filmstrip keeps each frame's shape at every zoom (frames side by side, only those in view drawn) and shows removed backgrounds see-through on a checkerboard (`/api/videos/[id]/film`, one PNG per setting); dragging or trimming never selects text (one cursor while dragging); "+ Track" is now two icons, **+ overlay** and **+ audio**; the sideways scrollbar runs under the lanes only (track names are their own column). **Preview**: every selection box (pictures, videos, text, the Brand Kit logo) resizes from its sides too, the opposite side staying put (elements keep their free stretch); an optional **split view** icon shows Program and This clip side by side (off by default, remembered). **Cutout** tab: Reset links no longer push the sliders down. **Brand Kit**: the box behind the logo starts white. **Templates**: 15 more (News, YouTube, Social, Business), using elements and blank scenes                                                                                                                                                                                                                                                                                                                                                                                              |
| **TX** Transform tools (3 Oct 2026)                        | ✅                                                             | Selection box like Canva / Figma: **corner dots** resize keeping the shape (Shift: free, Alt: from the middle), **side bars** stretch width or height, the dot above turns around the **pivot** (a movable middle dot), an **inner corner dot** rounds the corners. A mode row in the preview header: **Transform · Skew · Perspective** (+ Reset shape). **Transform panel**: X / Y and W / H in px (with a shape lock), rotation, scale X / Y, skew X / Y, flips, corner radius, pivot, perspective reset and **blend modes** (W3C formulas; FFmpeg `lut2`, within 2/255). Width / height and skew animate with keyframes (videos and pictures). Export: one premultiplied FFmpeg `perspective` warp with the same homography as the preview (lib/player/quad; within 0.02 px), per-frame for keyframes. Perspective for videos, pictures, elements and text (text is drawn flat, then bent by the same warp in the preview and in its export picture; no pivot for text). Also: a template's files can't be deleted from My Assets while it uses them; a template whose file is gone says "Video missing" and can be given a new one                                                                                                                                                                                                         |
| **M6** Transcript and captions                             | ⏳                                                             | Not started: first a test of Apple's on-device speech engine (SpeechTranscriber is in the SDK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**New files:**

- `lib/edit/doc.ts` (timeline model) and `lib/edit/docEdit.ts` (editing as pure functions);
- `lib/editor/docReducer.ts`;
- `lib/render/compose.ts` (export);
- `lib/player/layout.ts` (placement shared by preview and export);
- `components/editor/ProgramPlayer.tsx`;
- the new `components/studio/Timeline.tsx`;
- `components/studio/ClipCards.tsx`;
- `lib/ffmpeg/silence.ts`;
- text: `lib/text/layout.ts` (styles and layout), `lib/text/render.ts` (drawing), `lib/player/anim.ts` (animations), `lib/renders.ts` + `app/api/renders` (text pictures for the export), `components/studio/TextPanel.tsx`.

---

## 4. Feature board: every mockup feature and its sprint

**Top bar**

| Mockup item        | Level | When                                |
| ------------------ | ----- | ----------------------------------- |
| Undo / redo        | —     | ✅ done                             |
| Export button      | —     | ✅ done → Export dialog in Sprint 1 |
| Help (?)           | 🟢    | Sprint 1 (shortcuts list)           |
| Account avatar (K) | 🔴    | Phase 4 (accounts)                  |
| "Pro" badge        | 🔴    | Phase 4 (plans and billing)         |
| Export ▾ dropdown  | 🟢    | Sprint 1 (1.7)                      |

**Left rail**

| Mockup item | Level | When                                                                                 |
| ----------- | ----- | ------------------------------------------------------------------------------------ |
| Media       | 🟢    | Sprint 1                                                                             |
| Edit        | 🟢    | Sprints 2–4                                                                          |
| Background  | 🟡    | Sprint 3                                                                             |
| Text        | 🟡    | 2B                                                                                   |
| Audio       | 🟡    | Sprint 4 (clip audio) / 2B (music tracks)                                            |
| Subtitles   | 🟡    | 2B                                                                                   |
| Templates   | 🟡    | 2B                                                                                   |
| Elements    | ✅    | Shapes, lines and arrows, 27 drawn stickers, 400+ emoji, news graphics (28 Sep 2026) |
| Brand Kit   | 🟡    | 2B / Phase 4                                                                         |
| AI Tools    | 🔴    | Phase 3                                                                              |
| Projects    | 🟡    | Sprint 1                                                                             |

**Media panel**

| Mockup item                    | Level | When                                                         |
| ------------------------------ | ----- | ------------------------------------------------------------ |
| Upload                         | —     | ✅ done                                                      |
| My Assets                      | 🟢    | Sprint 1                                                     |
| Stock                          | 🟡    | 2B (needs a Pexels/Pixabay API key)                          |
| Record (microphone voice-over) | 🟡    | 2B, together with audio tracks                               |
| Screen recording               | 🟡    | 2B (browser screen capture → uploaded like a normal video)   |
| Camera recording               | 🟡    | 2B (webcam capture; for green-screen recording at your desk) |
| Empty state "No media yet"     | 🟢    | Sprint 1 (1.6)                                               |

**Preview**

| Mockup item                                            | Level | When                        |
| ------------------------------------------------------ | ----- | --------------------------- |
| Original + Transparent side by side                    | 🟢    | Sprint 0 (as a view option) |
| Player controls                                        | —     | ✅ done                     |
| Preview background: Checkerboard, White, Black, Custom | —     | ✅ done                     |
| Preview background: Image, Video                       | 🟢    | Sprint 0                    |

**Tool strip**

| Mockup item | Level | When     |
| ----------- | ----- | -------- |
| Split       | 🟢    | Sprint 2 |
| Cut         | 🟢    | Sprint 2 |
| Trim        | 🟢    | Sprint 2 |
| Crop        | 🟢    | Sprint 3 |
| Resize      | 🟢    | Sprint 3 |
| Rotate      | 🟢    | Sprint 3 |
| Speed       | 🟢    | Sprint 4 |
| Reverse     | 🟢    | Sprint 4 |
| Freeze      | 🟢    | Sprint 4 |
| Mask        | 🔴    | 2C       |
| Keyframe    | 🔴    | 2C       |

**Timeline**

| Mockup item                              | Level | When             |
| ---------------------------------------- | ----- | ---------------- |
| Video 1 track, ruler, playhead, eye/lock | 🟡    | Sprint 2         |
| Video 2 (background video track)         | 🔴    | 2B (multi-track) |
| Text track                               | 🟡    | 2B               |
| Audio track (voice-over/music)           | 🟡    | 2B               |
| Effects track                            | 🔴    | 2C               |

**Remove background panel**

| Mockup item                     | Level | When                                                                               |
| ------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| Color Key                       | —     | ✅ done                                                                            |
| Black background (fire, sparks) | —     | ✅ done (Batch A+)                                                                 |
| AI Removal / AI Cutout / Live   | 🟡/🔴 | [Section 3b](#3b-ai-smart-background-removal-no-green-screen) (tabs shown, "Soon") |
| Advanced                        | —     | ✅ done ("Edges & glow")                                                           |

**Background & Overlays**

| Mockup item                         | Level | When                                      |
| ----------------------------------- | ----- | ----------------------------------------- |
| Transparent, Color, Gradient, Image | 🟡    | Sprint 3                                  |
| Studio / Newsroom / City presets    | 🟢    | Sprint 3 (a few free images) → more in 2B |
| Blur (blurred original background)  | 🟢    | Sprint 3 (3.6)                            |
| Background on/off toggle            | 🟢    | Sprint 0 (0.9)                            |
| Background video                    | 🔴    | 2B                                        |
| Effects / Filters / Adjust tabs     | 🟡    | Sprint 5                                  |

**Output settings**

| Mockup item                            | Level | When                                             |
| -------------------------------------- | ----- | ------------------------------------------------ |
| Resolution, frame rate, quality, audio | —     | ✅ done → moves to the Export dialog in Sprint 1 |
| Crop transparent area + padding        | 🟢    | Sprint 0                                         |
| MP4                                    | 🟢    | Sprint 3                                         |

**Templates strip**

| Mockup item                     | Level | When                           |
| ------------------------------- | ----- | ------------------------------ |
| News, Shorts, Reels, Presenter… | 🟡    | 2B (needs text + layers first) |

**Export & Share**

| Mockup item            | Level | When                                    |
| ---------------------- | ----- | --------------------------------------- |
| Generate, Download     | —     | ✅ done                                 |
| Estimated size         | 🟢    | Sprint 0                                |
| Share (test link / QR) | —     | ✅ done → proper share links in Phase 4 |

---

## 5. Later: medium features (Phase 2B)

We start these after Sprint 5. They need **multiple tracks** and a **multi-layer preview**, which is the next big building block.

| Order | Feature                                                                                             | Level | Why later                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 6     | **Multi-track timeline** (Video 2, overlay tracks, drag between tracks, snapping)                   | 🔴    | Needs a new real-time preview that stacks many layers                                                           |
| 7     | **Text / lower-thirds** ("Breaking News" bars, titles)                                              | 🟡    | Your FFmpeg can't draw text, so the browser draws it and it's placed as an image (preview = export)             |
| 8     | **Logo / image overlay** (position, size, opacity)                                                  | 🟡    | Easy once layers exist                                                                                          |
| 9     | **Audio tracks** (voice-over, background music, mixing) + **Record** voice-over from the microphone | 🟡    | `amix` + a volume per track; recording uses the browser's MediaRecorder                                         |
| 9a    | **Screen / Camera recording**                                                                       | 🟡    | Browser capture → saved into My Assets like an upload                                                           |
| 10    | **Subtitles** (import/edit SRT, styles, burned in)                                                  | 🟡    | Drawn the same way as text                                                                                      |
| 11    | **Templates** (News, Weather, Shorts, Reels…)                                                       | 🟡    | A template = a saved project with placeholders; needs text + layers                                             |
| 12    | **Brand Kit** (your logos, colors, fonts)                                                           | 🟡    | Feeds text, logo and templates                                                                                  |
| 13    | **Transitions** between clips (fade, slide, wipe…)                                                  | 🟡    | FFmpeg `xfade` (available in your build)                                                                        |
| 14    | **Stock media** (free videos/images)                                                                | 🟡    | Needs a free API key (Pexels/Pixabay)                                                                           |
| 15    | **Elements** (shapes, stickers, arrows)                                                             | ✅    | A drawn layer (the `element` clip), not uploaded pictures: placed like a picture, exported as the browser's PNG |

---

## 6. Much later: hard features (Phase 2C)

| Feature                                                 | Level | Why                                                         |
| ------------------------------------------------------- | ----- | ----------------------------------------------------------- |
| **Keyframes** (animate position/size/opacity over time) | 🔴    | Needs curves for every property, in both preview and export |
| **Masks** (shape masks, feathered, animated)            | 🔴    | Needs keyframes + a drawing tool                            |
| **Effects track** (glow, blur, shake over time)         | 🔴    | Needs keyframes + a GPU effects engine                      |
| **Background video track with keying on both**          | 🔴    | Heavy real-time decoding of two videos                      |

---

## 7. Not now: Phase 3 and 4

These stay in [PRODUCT_PLAN.md](PRODUCT_PLAN.md) and are **not picked now**:

- **Phase 3 (AI):**
  - AI subtitles (Whisper) — the easiest one, and it runs free on your Mac;
  - AI background removal for hair, upscaling;
  - script → scenes, AI voice, background generation, B-roll;
  - lip-sync, avatars, auto video.
- **Phase 4 (platform):** accounts, cloud storage, job queue with Mac/GPU workers, credits/billing, API, team collaboration, analytics, automated publishing.

**Why not now:** they need paid APIs, GPUs, accounts or servers. The editor must be solid first.

---

## 8. How each sprint works

1. **Plan:** a short plan for the sprint (what, files, tests) for you to approve.
2. **Build:** in small steps. Every change keeps the existing features working.
3. **Test:**
   - unit tests plus a golden test that the FFmpeg commands don't change by accident;
   - a real-encode test;
   - browser tests in Chrome and Safari's engine;
   - screenshots I look at myself.
4. **Your review:** you try it and send changes, like you did for the preview and one-screen layout.
5. **Update this file:** tick the sprint, and move anything we learn to the right place.

**Next action:** Sprint 0. Please upload 3–5 real Veo clips (0.1), then say **"start Sprint 0"**.
