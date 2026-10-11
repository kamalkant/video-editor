# VDO Studio — AI Studio Product Plan

**Last updated:** 26 Sep 2026 · **Status:** Phase 1 mostly done (see [ROADMAP.md](ROADMAP.md))

VDO today removes the green from a Veo video and exports transparent files for websites.

👉 **The sprint-by-sprint build order (what we pick now) is in [EDITOR_ROADMAP.md](EDITOR_ROADMAP.md).**
This plan grows it into an **AI Studio**, in 4 phases and 52 features, with a layout like the "AI Studio" mockup.

## Contents

1. [My view of the mockup](#1-my-view-of-the-mockup)
2. [Your 52 features: status and approach](#2-your-52-features-status-and-approach)
3. [Key design decisions](#3-key-design-decisions)
4. [Step-by-step milestones](#4-step-by-step-milestones-each-ends-with-a-working-tested-app)
5. [Risks and rules](#5-risks-and-rules)
6. [Next step](#6-next-step)

---

## 1. My view of the mockup

**Keep** (it matches how CapCut, Canva and Kapwing work):

- left icon rail;
- media panel (Upload / Stock / My Assets) with thumbnails;
- big preview in the center;
- tool strip above the timeline (Split, Trim, Crop, Speed…);
- **multi-track timeline** with lock and eye icons;
- context inspector on the right;
- Export at the top right;
- templates;
- a Background & Overlays panel.

**Change:**

| Mockup                                                                                     | Problem                                                        | Better                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top nav _and_ left rail both list Media, Text, Audio…                                      | Same menu twice                                                | Keep only the left rail; the top bar keeps project name, undo/redo, help and Export                                                                                                                                    |
| 5 regions (media, preview, inspector, output settings, templates strip) + timeline         | Too dense even at 1440 px; the preview gets small              | 3 columns + timeline. Output settings go into the **Export dialog**. Templates live in the rail and on the start screen                                                                                                |
| Two previews side by side                                                                  | Each is half size                                              | One large preview with Original / Removed / **Split** (draggable) / Side-by-side / Alpha views, as built today. An optional split view (off by default, 28 Sep) puts Program next to This clip for those who want both |
| Keying defaults 0.15 / 0.05, "Green Shade Tolerance", "Edge Cleanup", Spill 40             | Measured to give a green outline; two sliders do nothing       | Keep our tested defaults (0.05 / 0.15, spill 100 on edges only); Shadowed-background mode replaces "tolerance"                                                                                                         |
| Output = one radio (WebM "Recommended")                                                    | Safari needs HEVC; a website needs both                        | **Export presets** instead (see §3.3)                                                                                                                                                                                  |
| Timeline has a background video, text, voice and effects, but output is "transparent WebM" | Once a background is added, the video is no longer transparent | Two clear export modes: **Transparent overlay** or **Finished video (MP4)**                                                                                                                                            |
| "Max 2GB", "~1.8 MB estimate"                                                              | Untested claims                                                | Real limits (now 500 MB) and a real size estimate from a short test encode                                                                                                                                             |
| Remove audio = Recommended, Bitrate field                                                  | Drops the voice; bitrate fights CRF                            | Keep sound when detected; a single File size control                                                                                                                                                                   |

**Biggest risk:** the full list is CapCut + HeyGen + Canva combined, which large teams build over years. My recommendation is a **presenter-first focus**. Your templates already point there: News Presenter, Breaking News, Weather, Explainer. Build the editor features that presenter videos need first (background, lower-third text, logo, voice, subtitles, templates) and delay generic editing features (masks, transitions, keyframes).

---

## 2. Your 52 features: status and approach

**Phase 1 — Transparent maker (mostly done)**

| #      | Feature                                   | Status     | Notes                                                                                                                                            |
| ------ | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–4    | Upload, preview, color picker, eyedropper | ✅         | Magnifier picker, auto-detect, hex/RGB                                                                                                           |
| 5, 6   | Similarity, Blend                         | ✅         | Tested defaults 0.05 / 0.15, safe ranges, see-through warning                                                                                    |
| 7      | Green shade tolerance                     | ❌ removed | Same as similarity. Replace with an optional **"Shadowed background" mode** (hue-only `hsvkey`, tested on synthetic clips) after real-clip tests |
| 8      | Spill removal                             | ✅         | Edges only, so skin is never shifted                                                                                                             |
| 9      | Edge cleanup                              | ⚠️         | Is now "Edges & glow" (tighter/wider). Add an **alpha clean-up threshold** only if real clips show speckles                                      |
| 10     | Feather                                   | ✅         |                                                                                                                                                  |
| 11     | Preview transparency                      | ✅         | Live GPU while playing, exact FFmpeg frame when paused, checker/colors, Final file view                                                          |
| 12     | 1280×720                                  | ✅         | Original size or smaller, never upscaled                                                                                                         |
| 13, 14 | WebM alpha, HEVC alpha MOV                | ✅         | Both always made; verified in Chrome and in Safari's engine                                                                                      |
| 15     | File-size optimization                    | ⚠️         | Presets done. **To do:** crop to the person + padding, and a size estimate                                                                       |
| 16     | Download                                  | ✅         | Files + zip + embed code + test page/QR                                                                                                          |

**Phase 2 — Video editor** (FFmpeg building block → how)

| #      | Feature                   | How                                                                                                                                                                                   |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 28     | **Timeline**              | Foundation for everything below: tracks → clips, playhead, snapping, lock/eye                                                                                                         |
| 17, 18 | Trim, Cut/Split           | Clip in/out points → `trim`/`atrim` + `setpts`                                                                                                                                        |
| 19     | Crop                      | `crop`; auto-crop to the person uses `bbox` on alpha                                                                                                                                  |
| 20     | Resize                    | Canvas presets 16:9, 9:16, 1:1, 4:5 → `scale` + `pad`, clip position/scale                                                                                                            |
| 21     | Speed (+ Reverse, Freeze) | `setpts`/`atempo`; `reverse`; hold frame                                                                                                                                              |
| 22     | Text                      | **Rendered by the browser as a transparent image and overlaid.** This FFmpeg build has no freetype, so `drawtext` is unavailable, and this way the preview matches the export exactly |
| 23     | Logo                      | Image overlay (`overlay`) with position/opacity; the Brand Kit later feeds it                                                                                                         |
| 24, 25 | Filters, color correction | `eq`, `colorbalance`, `lut3d` (.cube LUTs); a GPU version for live preview                                                                                                            |
| 26     | Audio                     | Voice-over/music tracks: `amix`, volume, `afade`, `loudnorm`                                                                                                                          |
| 27     | Subtitles                 | Import/edit SRT; drawn like Text (no libass in this build)                                                                                                                            |
| 29     | Transitions               | `xfade` (available in your build)                                                                                                                                                     |
| 30     | Keyframes                 | Position/scale/opacity curves → per-frame expressions; last in Phase 2                                                                                                                |

**Phase 3 — AI studio** (compute choice per feature)

| #   | Feature                  | Likely engine                                            | Runs where                                               |
| --- | ------------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| 36  | AI subtitles             | Whisper (`whisper.cpp`)                                  | Free, on your Mac ⭐ first                               |
| 31  | AI background removal    | RobustVideoMatting / BiRefNet / MatAnyone (ONNX/Core ML) | Mac GPU; fixes hair; becomes a new op next to chroma key |
| 37  | Script → scenes          | Claude API                                               | Cloud API                                                |
| 34  | AI voice                 | TTS provider API                                         | Cloud API (credits)                                      |
| 32  | AI background generation | Image-generation API                                     | Cloud API                                                |
| 33  | AI upscaling             | Real-ESRGAN                                              | Mac/GPU worker                                           |
| 38  | AI B-roll                | Stock APIs (Pexels/Pixabay) + Veo API                    | Cloud                                                    |
| 35  | Lip-sync                 | Specialist model/API                                     | GPU cloud; **consent rules**                             |
| 39  | Avatar generation        | Veo/Flow (already your source)                           | Cloud                                                    |
| 40  | Auto video creation      | Orchestrates 37 → 34 → 39/38 → 36 → a template           | Last                                                     |

**Phase 4 — Platform**

| #      | Feature                            | How                                                                                                                                |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 46     | Job queue                          | Move today's in-process queue to Redis + BullMQ workers. A **Mac worker** is needed for HEVC alpha; Linux/GPU workers for the rest |
| 47     | Cloud storage                      | S3 / Cloudflare R2 + CDN with Range support                                                                                        |
| 43, 44 | Multi-user projects, collaboration | Accounts, then project sharing and comments, then real-time editing (Yjs) last                                                     |
| 41     | Templates                          | A template = saved project JSON with placeholders (name, text, logo, clip)                                                         |
| 42     | Brand Kit                          | Logos, colors and fonts per workspace                                                                                              |
| 48     | Usage / credits                    | Metered AI and render minutes (Stripe)                                                                                             |
| 45     | API                                | REST: upload → project → render → webhook                                                                                          |
| 49     | Analytics                          | Product events + embed view counts                                                                                                 |
| 50     | Website embed                      | ✅ Built (embed code, WebKit detection, test page)                                                                                 |
| 51     | Browser testing                    | ✅ Partial (Playwright Chromium + WebKit). Add real devices (BrowserStack)                                                         |
| 52     | Automated publishing               | YouTube / Meta APIs, scheduled                                                                                                     |

---

## 3. Key design decisions

### 3.1 Screen layout (desktop ≥ 1280 px)

```text
┌ Logo · Project name ▾ · saved ✓ │                      │ ↺ ↻ ? (K) [Export] ┐
├ Rail ┬ Panel (per rail item) ┬ PREVIEW (one, large, views) ───┬ INSPECTOR ─────┤
│Media │ Upload/Stock/Assets   │  Removed|Original|Split|Alpha   │ context: clip,  │
│Edit  │ grid · drag to        │  controls · zoom · bg tiles     │ text, audio,    │
│Remove│ timeline              ├──────────────────────────────────┤ remove bg,      │
│  bg  │                       │ tools: Split Trim Crop Speed …   │ color, …        │
│Text  │                       │ TIMELINE: V2 bg · V1 presenter · │ (sections with  │
│Audio │                       │ Text · Audio · Subtitles         │  Reset)         │
│Subs  │                       │ playhead · zoom · snap           │                 │
│AI    │                       │                                  │                 │
│Tmpl  │                       │                                  │                 │
│Brand │                       │                                  │                 │
└──────┴───────────────────────┴──────────────────────────────────┴─────────────────┘
```

- The panel and inspector collapse to drawers below 1280 px. Phones get a simple mode: trim, remove background, text, export.
- **Export dialog:** presets, resolution, fps, quality, sound, crop, a real size estimate, then progress, then downloads, embed and share.

### 3.2 Data model: EditSpec → Project v2

Today there is a single clip plus ops. Phase 2 needs:

```text
Project { version:2, canvas {w,h,fps,background}, assets[], tracks[ {kind: video|image|text|audio|subtitle,
          locked, hidden, clips[ {assetId, start, in, out, transform (+keyframes), ops[] (chromaKey, crop, color…)} ]} ],
          output }
```

- Today's `OpDefinition` registry becomes **per-clip effects**, with no rewrite.
- A migration turns every v1 EditSpec into a one-track project.
- A **Project → FFmpeg compiler** (multi-input `filter_complex`: trim/setpts → ops → overlay by time → amix) keeps the golden-string tests.

### 3.3 Export modes

| Preset                           | Output                                                 |
| -------------------------------- | ------------------------------------------------------ |
| Website transparent overlay      | WebM VP9α + MOV HEVCα + poster (today)                 |
| Finished video 16:9 / 9:16 / 1:1 | MP4 H.264 + AAC (background, text, audio all baked in) |
| Master                           | ProRes 4444                                            |

### 3.4 Preview engine

- **Live:** a WebGL multi-layer compositor. It extends today's `liveKey` renderer to many layers, text and filters.
- **Exact:** the FFmpeg frame at the paused playhead, as today.
- Text and subtitles come from **one renderer** (browser canvas → PNG), used for both preview and export.

### 3.5 Storage in Phase 2 (still local)

- Projects saved in SQLite, with a "My Assets" library.
- Autosave and a project list: the **Projects** rail item.

---

## 4. Step-by-step milestones (each ends with a working, tested app)

| Step                                          | Scope                                                                                                                                                                                        | Done when                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **1.5 Finish Phase 1** (1–2 wk)               | Real Veo clip tests and tuned defaults; crop to the person + padding; size estimate; background replace (color/image) as the bridge op; shadowed-background mode _if_ the real clips need it | 3–5 real clips look clean in Chrome, Safari and iPhone     |
| **2.1 Editor shell + Project v2** (2–3 wk)    | New layout (rail, panel, preview, inspector, timeline); Project v2 + migration; SQLite projects + autosave; media library (Upload / My Assets); single-track timeline with playhead          | Old flows still pass; a project survives a restart         |
| **2.2 Clip editing** (2 wk)                   | Trim, Split, Cut, Crop, Resize/canvas presets, Speed, Reverse, Freeze                                                                                                                        | Golden graph tests + real encodes                          |
| **2.3 Layers for presenter videos ⭐** (3 wk) | V2 background track (video/image/color/gradient), Text layer (lower-thirds "Breaking News"), Logo, Audio track (voice-over, music, fades, loudness), MP4 export preset                       | A news-presenter video exported as MP4 matches its preview |
| **2.4 Look & captions** (2 wk)                | Filters, color correction, LUTs; subtitles (SRT import/edit, styled)                                                                                                                         |                                                            |
| **2.5 Motion** (2–3 wk)                       | Transitions (`xfade`), keyframes, masks                                                                                                                                                      |                                                            |
| **3.1 Local AI** (2–3 wk)                     | AI subtitles (Whisper), AI background removal (matting op), upscaling                                                                                                                        | Runs on your Mac, no credits needed                        |
| **3.2 Cloud AI** (4–6 wk)                     | Script → scenes (Claude), AI voice, background generation, B-roll                                                                                                                            | Needs API keys and a cost limit                            |
| **3.3 Avatar & auto video** (4+ wk)           | Lip-sync, avatar generation (Veo), auto video creation                                                                                                                                       | Consent and labeling rules in place                        |
| **4.x Platform** (3–6 mo)                     | Accounts → cloud storage + queue + workers (Mac worker for HEVCα) → templates & brand kit → credits/billing → API → collaboration → analytics → publishing                                   |                                                            |

Time estimates are rough, for one developer. Templates (41) and Brand Kit (42) can move earlier, right after 2.3, because presenter videos benefit most from them.

---

## 5. Risks and rules

- **Scope:** ship each step before starting the next; don't build all 52 features at once.
- **Text/subtitles:** this FFmpeg build has no freetype or libass, so text is rendered by the browser (§3.4). This also guarantees the preview matches the export.
- **HEVC alpha needs macOS**, so any cloud setup needs a Mac render worker, or the stacked-alpha fallback.
- **Real-time preview** of many layers is the hardest engineering piece. Build it in 2.1/2.3, not later.
- **AI costs:** credits and a monthly cap before any paid API goes live.
- **Legal:**
  - Veo commercial terms and SynthID (never claim it is removed);
  - consent for voice cloning and lip-sync;
  - an "AI-generated" label option;
  - licenses for stock media, fonts and templates.
- **Privacy:** uploads stay local in Phases 1–2; cloud storage needs deletion rules and a privacy notice.

---

## 6. Next step

1. **Step 1.5 first.** Test 3–5 real Veo clips (white top, loose hair, fast hands, a darker shot) and tune the defaults on real footage.
2. Then Step 2.1, the editor shell and Project v2. Everything in Phase 2 builds on the timeline and the project model.
3. Each step gets its own detailed plan before building, and ends with passing tests and a working app.
