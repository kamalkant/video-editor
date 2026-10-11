# VDO Studio — Transparent Avatar Video Maker

**Roadmap and project notes** · Last updated: 25 Sep 2026 (MVP built)

VDO is a website where you upload a Veo/Flow green-screen video, pick the green color, preview the result, and download a **transparent video** you can put on your website as an avatar overlay.

This file holds everything decided so far: the goal, the tested recipe, the settings, the mockup review, the step-by-step roadmap, and the open questions.

---

## Contents

1. [Goal](#1-goal)
2. [Where we are now](#2-where-we-are-now)
3. [Key decisions](#3-key-decisions)
4. [What we tested (evidence)](#4-what-we-tested-evidence)
5. [The processing recipe](#5-the-processing-recipe)
6. [Settings: UI → FFmpeg](#6-settings-ui--ffmpeg)
7. [Mockup review (plan.png)](#7-mockup-review-planpng)
8. [Architecture](#8-architecture)
9. [Roadmap — step by step](#9-roadmap--step-by-step)
10. [Test plan](#10-test-plan)
11. [Security and limits](#11-security-and-limits)
12. [Deployment options](#12-deployment-options)
13. [Open questions](#13-open-questions)
14. [Appendix](#14-appendix)
15. [Studio & feature architecture](#15-studio--feature-architecture)

---

## 1. Goal

|            |                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| **Input**  | Veo / Google Flow video on a green background (key color `#12AF34`), MP4, 1280×720, short clips (about 4–10 s) |
| **Output** | Transparent video that plays on every major browser, small enough for a website                                |
| **User**   | Non-technical. They should not need to know FFmpeg, CRF, VP9 or ProRes                                         |
| **Flow**   | Upload → Pick color → Preview → Fine-tune → Generate → Download → Embed                                        |
| **Stack**  | React frontend + Node.js backend + FFmpeg. First version runs locally on your MacBook                          |

---

## 2. Where we are now

- [x] Reviewed the ChatGPT chat that started this plan ([Appendix A](#a-review-of-the-chatgpt-chat))
- [x] Tested all the FFmpeg recipes on this Mac (FFmpeg 9.0.1) with a synthetic green-screen clip
- [x] Tested transparency in Chrome and in Safari's engine (WebKit)
- [x] Reviewed the UI mockup (`plan.png`): 62 findings checked by skeptics ([Section 7](#7-mockup-review-planpng))
- [x] **Built the local MVP** (Next.js app in this folder) — Phases 0, 2, 3, 4 and most of 5. See [How to run](#how-to-run)
- [x] **One-screen Studio** (upload, adjust and export on one page) with an operations pipeline for future editing features ([Section 15](#15-studio--feature-architecture))
- [ ] Test on **real Veo clips** and tune defaults (Phase 1) ← next step
- 📋 Long-term plan (52 features, AI Studio): [PRODUCT_PLAN.md](PRODUCT_PLAN.md)
- 🗓 Next sprints (Phase 1 pending + Phase 2 picks): [EDITOR_ROADMAP.md](EDITOR_ROADMAP.md)
- [ ] Go online (Phase 6), later ideas (Phase 7)

### How to run

```bash
npm install            # once
npm run dev            # open http://127.0.0.1:3000
npm run dev:lan        # same, but phones on your Wi-Fi can open the test page
npm test               # unit + integration tests (real FFmpeg encodes)
npm run e2e            # browser tests in Chromium and WebKit (Safari engine)
```

Current results: 70 Vitest tests and 7 Playwright tests pass (Chromium + WebKit). WebKit reads a transparent corner from the HEVC MOV; Chromium reads one from the WebM.

---

## 3. Key decisions

| #   | Decision                                                                                  | Why                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Make **two files** for every video: **WebM (VP9 + alpha)** and **MOV (HEVC + alpha)**     | Chrome/Firefox/Android need WebM. Safari and **every iPhone/iPad browser** need HEVC. No single file works everywhere with a plain `<video>` tag |
| D2  | **Do not** serve ProRes 4444 on the website. Keep it only as an optional archive "master" | ProRes 4444 was **45–50 MB for 4 seconds**. HEVC + alpha was **about 200 KB**                                                                    |
| D3  | Choose the file with **WebKit detection**, not `canPlayType`                              | Safari says "probably" to WebM VP9 but shows it with a **solid dark background** (tested)                                                        |
| D4  | Default key settings **`similarity 0.05, blend 0.15`**, not ChatGPT's `0.15 / 0.05`       | About 2× more accurate edges, and white clothes and pale skin stay solid (tested)                                                                |
| D5  | Remove green spill **only on the edges**, never on the whole picture                      | Whole-frame despill changes skin color (it turned light skin pink in tests)                                                                      |
| D6  | Preview is rendered **by FFmpeg on the server** (one frame)                               | A browser-only preview uses different math and would not match the final video                                                                   |
| D7  | Keep the **original frame rate** (Veo is usually 24 fps)                                  | Forcing 30 fps adds frames and makes the file bigger                                                                                             |
| D8  | **Keep audio** by default (the user can remove it)                                        | Veo can generate speech. Audio adds only about 30 KB per 4 s at 64 kbps                                                                          |
| D9  | First version runs **on your Mac**                                                        | The Safari file (HEVC + alpha) needs Apple's encoder, which only exists on macOS. See [Section 12](#12-deployment-options) for going online      |

---

## 4. What we tested (evidence)

All tests ran on this Mac on 25 Sep 2026: FFmpeg 9.0.1 (Homebrew), Apple Silicon. The test clip is synthetic: 4 s, 1280×720, 24 fps, `#12AF34` background, a moving subject with soft edges. **Real Veo clips still need testing** (Phase 1).

### 4.1 File size (4 seconds, 1280×720)

| Recipe                                                         |       Size | Result                                                            |
| -------------------------------------------------------------- | ---------: | ----------------------------------------------------------------- |
| ProRes 4444 MOV (ChatGPT's Safari file)                        |   45–50 MB | Far too big for a website                                         |
| ProRes 4444 with `-bits_per_mb 200`                            |     8.8 MB | Still big                                                         |
| libx265 "small MOV" (ChatGPT)                                  |          — | **Fails**: "Loaded libx265 does not support alpha layer encoding" |
| WebM VP9 at fixed `-b:v 4M` (ChatGPT)                          |     1.9 MB | Wastes space                                                      |
| **WebM VP9 + alpha, CRF 35 (with audio)**                      | **110 KB** | Transparent in Chrome ✅                                          |
| **MOV HEVC + alpha, `hevc_videotoolbox -q:v 55` (with audio)** | **206 KB** | Transparent in Safari's engine ✅ and in Chrome on Mac ✅         |

Real Veo footage has more detail than the synthetic clip, so real files will be bigger. Expect roughly 0.3–3 MB; Phase 1 will measure it.

### 4.2 Browser test (pixel read-back from a canvas)

| Browser engine                             | WebM VP9 + alpha             | MOV HEVC + alpha |
| ------------------------------------------ | ---------------------------- | ---------------- |
| Chrome 153 (macOS, headless)               | ✅ transparent               | ✅ transparent   |
| WebKit / Safari engine (macOS)             | ❌ **solid dark background** | ✅ transparent   |
| Firefox, Edge, Android Chrome, real iPhone | not tested yet               | not tested yet   |

### 4.3 Key (green removal) quality

Edge error means how far the edge transparency is from perfect, on a 0–255 scale; lower is better.

| Setting (similarity:blend)                | Edge error | Problem                                       |
| ----------------------------------------- | ---------: | --------------------------------------------- |
| `0.15:0.05` (ChatGPT default)             |       68.9 | Hard edge + green outline                     |
| `0.18:0.06` (ChatGPT "higher side")       |       92.0 | Worse                                         |
| `0.20:0.08` (ChatGPT "green outline fix") |      114.9 | **Whole person becomes see-through**          |
| **`0.05:0.15` (our default)**             |   **35.2** | None found; white clothes stay solid          |
| `0.05:0.20`                               |       23.0 | White/gray clothes become **18% see-through** |

**Rule:** similarity + blend must stay below the color distance between the green and the person. White and gray are the first to go see-through.

### 4.4 Green spill (green tint on edges)

| Method                                 | Skin color inside                              | Green on edges          |
| -------------------------------------- | ---------------------------------------------- | ----------------------- |
| No despill                             | unchanged                                      | strong green tint (+60) |
| `despill=green` on whole frame         | light skin shifts (e.g. `#F1C27D` → `#F1B77D`) | fixed                   |
| `despill=green:mix=0.3:expand=0.2`     | **skin turns pink** (`#F1C27D` → `#F18E7D`)    | fixed                   |
| **Despill on edges only (our method)** | **unchanged**                                  | **fixed (about −10)**   |

### 4.5 Other things we confirmed

- HEVC `-alpha_quality 1.0` is 4.6× bigger than `0.75` with no visible gain. Use **0.75**.
- FFmpeg's built-in VP9 decoder **drops alpha**. When checking WebM files, decode with `-c:v libvpx-vp9` before `-i`.
- Safari/WebKit **won't play video** from a server without HTTP range support. Express `static` supports it; Python's simple server does not.
- `ffprobe` shows HEVC-alpha files as plain `yuv420p`. The alpha is a hidden extra layer and is really there.

---

## 5. The processing recipe

### 5.1 Filter graph (key + edge-only despill)

```text
[0:v]chromakey=0x12AF34:0.05:0.15,format=rgba,split=4[o][s][m][a];
[s]despill=green[d];
[m]alphaextract,lut=y='if(gte(val\,250)\,0\,255)'[mask];
[d][mask]alphamerge[dm];
[o][dm]overlay=format=rgb[c];
[a]alphaextract[al];
[c][al]alphamerge
```

What it does, step by step:

1. `chromakey` makes the green transparent.
2. `split` makes 4 copies of the picture.
3. One copy gets `despill` (green removed).
4. A mask marks only the **edge** pixels (alpha below 250).
5. The despilled colors are used only on the edges; the inside of the person keeps its original colors.
6. The original transparency is put back.

### 5.2 Commands

```bash
KEY="[0:v]chromakey=0x12AF34:0.05:0.15,format=rgba,split=4[o][s][m][a];[s]despill=green[d];[m]alphaextract,lut=y='if(gte(val\,250)\,0\,255)'[mask];[d][mask]alphamerge[dm];[o][dm]overlay=format=rgb[c];[a]alphaextract[al];[c][al]alphamerge"

# 1) WebM — Chrome / Firefox / Android
ffmpeg -i veo.mp4 -filter_complex "$KEY,format=yuva420p[v]" -map "[v]" -map '0:a?' \
  -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -crf 35 -b:v 0 \
  -row-mt 1 -deadline good -cpu-used 2 \
  -c:a libopus -b:a 64k avatar.webm

# 2) MOV — Safari / iPhone / iPad (macOS only)
ffmpeg -i veo.mp4 -filter_complex "$KEY,format=bgra[v]" -map "[v]" -map '0:a?' \
  -c:v hevc_videotoolbox -allow_sw 1 -alpha_quality 0.75 -q:v 55 -tag:v hvc1 \
  -c:a aac -b:a 96k avatar_hevc.mov

# 3) Optional archive master (large, never put on the website)
ffmpeg -i veo.mp4 -filter_complex "$KEY,format=yuva444p10le[v]" -map "[v]" -map '0:a?' \
  -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -c:a pcm_s16le master_prores.mov
```

`-map '0:a?'` copies audio if the clip has it. The quotes matter in zsh.

### 5.3 Website player code

```html
<video id="avatar" autoplay muted loop playsinline></video>
<script>
  const ua = navigator.userAgent;
  const isWebKit =
    (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) || // Safari (Mac)
    /iPad|iPhone|iPod/.test(ua) || // every iOS browser
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPad in desktop mode
  document.getElementById("avatar").src = isWebKit
    ? "/videos/avatar_hevc.mov"
    : "/videos/avatar.webm";
</script>
```

Server requirements for these files:

- Serve with HTTP **range requests** enabled.
- Use the correct types: `video/webm` and `video/quicktime`.

---

## 6. Settings: UI → FFmpeg

### Basic (always visible)

| UI control                 | Range                                   | Default                                                    | FFmpeg                      | Notes                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------- | ---------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background type            | Green / blue screen · Black background  | auto-detect                                                | `chromakey` · `blackKey` op | A black border (fire, sparks on black) starts in Black background mode                                                                                                                                                                                          |
| Key color + eyedropper     | any color                               | auto-detect (e.g. `#12AF34`)                               | `chromakey=0xRRGGBB`        | Eyedropper averages a 5×5 area. Auto-detect uses the most common border color; if the border isn't green (smoke or powder reaching the edge) it looks at the whole frame. Nothing found → removal starts off with a "No green or blue background found" message |
| What's in the clip?        | Person or object / Effects              | Person (Effects when the green was found inside the frame) | —                           | Effects turns off the see-through warning (smoke and glow are meant to be partly see-through)                                                                                                                                                                   |
| Green removal (similarity) | 0.01–0.20                               | **0.05**                                                   | chromakey 2nd value         | Above ~0.20 in total with softness, white clothes turn see-through                                                                                                                                                                                              |
| Edge softness (blend)      | 0.00–0.25                               | **0.15**                                                   | chromakey 3rd value         | The app warns when >1.5% of the person's core becomes see-through                                                                                                                                                                                               |
| Remove green glow on edges | on/off                                  | **on**                                                     | edge-only `despill`         | See 5.1                                                                                                                                                                                                                                                         |
| Preview background         | gray / checker / white / black / custom | **gray**                                                   | — (preview only)            | Gray/black show green halos best                                                                                                                                                                                                                                |

### Black background mode

| UI control           | Range     | Default  | FFmpeg                                                                                            | Notes                                                                                                                                                                                                            |
| -------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark removal         | 0.00–0.30 | **0.03** | `lut` on the brightest channel                                                                    | Cuts dark noise and haze                                                                                                                                                                                         |
| Keep glow brightness | on/off    | **on**   | "unmult": alpha = `max(R,G,B)` (`extractplanes` + `blend=lighten`), color = color ÷ alpha (`geq`) | Exact for light added over black. Tested: a 30% orange ember (76,45,6) becomes (255,163,21) at 28% alpha, so glow stays bright on white pages. `colorkey` + `unpremultiply` left it dim (red 160 instead of 255) |

### Advanced (collapsed)

| UI control                | Range                               | Default                                             | FFmpeg                                          | Notes                                                                                            |
| ------------------------- | ----------------------------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Glow removal strength     | 0–100 %                             | **100**                                             | `despill=green:green=-S/100` (edges only)       | Tested: 40 leaves a clear green edge; above 100 turns edges magenta                              |
| Edge (Tighter ↔ Wider)    | −2…+2 px                            | **0**                                               | `erosion` / `dilation` passes on alpha          | Tested: +/−2 already makes holes or leftover green                                               |
| Feather                   | 0–3 px                              | **0**                                               | `gblur=sigma` on alpha                          | Tested: 0.5–1 harmless; 2+ leaves background and holes                                           |
| Crop empty area + padding | on/off, 0–50 px                     | off, 10 px                                          | whole-clip `bbox` on alpha → `crop`             | ✅ Built. Box checked within ±8 px on the test clip; the cropped file is smaller and keeps alpha |
| Resolution                | Original, 1920, 1280, 960, 640 wide | Original                                            | `scale=W:-2`                                    |                                                                                                  |
| Frame rate                | Original / 30 / 24                  | **Original**                                        | `fps`                                           | Never raise it                                                                                   |
| File size                 | Small / Balanced / Best             | Balanced                                            | WebM CRF 40 / 35 / 30; HEVC `-q:v` 45 / 55 / 65 | One control for both files; no bitrate control                                                   |
| Audio                     | Keep / Remove                       | **Keep** when sound is detected, Remove when silent | `-c:a libopus` / `aac`, or `-an`                | Detected with `volumedetect`                                                                     |
| Archive master (ProRes)   | on/off                              | off                                                 | `prores_ks -profile:v 4`                        | Large; for editing only                                                                          |

### Remove from the ChatGPT list

These have no FFmpeg equivalent or repeat another control:

| Control                                      | Why                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Green Shade Tolerance                        | Same thing as Similarity. For shadowed backgrounds a later "hue-only" mode (`hsvkey`) worked in tests; needs real clips |
| Edge Cleanup                                 | No real filter behind it; an "alpha threshold" version is untested                                                      |
| Hair Detail                                  | Needs AI matting (future, Phase 7)                                                                                      |
| Motion Edge                                  | Needs AI matting (future, Phase 7)                                                                                      |
| Output format radio (pick one)               | Always make **both** files (D1)                                                                                         |
| MP4 (H.264) / WebM (VP9) "with transparency" | These have **no transparency**                                                                                          |

---

## 7. Mockup review (plan.png)

Three reviewers (technical, UX, visual/accessibility) checked `plan.png`, a skeptic re-checked every finding, and an FFmpeg tester measured the controls. Result: **62 findings — 35 confirmed, 26 corrected, 1 refuted.**

**Keep from the mockup:** auto-detected video info card, clicking the video to pick the key color (+ HEX), preview backgrounds, "Frame rate: Original", CRF 35 default, crop as an off-by-default option, thumbnails next to downloads, and the overall "upload → adjust → download → use on site" story.

**Changed in the built app:**

| Mockup                                                     | Problem                                                                                          | Built as                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8 separate steps                                           | Sliders and preview must be seen together                                                        | 3 screens: Upload → Editor → Results                                                                                                                                                                                                                                                                                                                                                |
| Output radio: WebM (Recommended) / MOV ProRes / MP4 / WebM | Safari shows WebM as a dark box; ProRes is 45–50 MB per 4 s; MP4/plain WebM have no transparency | Always both: WebM VP9+alpha **and** MOV **HEVC+alpha**, plus poster + zip; ProRes optional                                                                                                                                                                                                                                                                                          |
| Similarity 0.15 / Blend 0.05, sliders 0–1                  | Hard green outline; most of the range makes the person see-through                               | 0.05 / 0.15, ranges 0.01–0.20 / 0–0.25, see-through warning                                                                                                                                                                                                                                                                                                                         |
| Green Shade Tolerance, Edge Cleanup                        | No FFmpeg equivalent                                                                             | Removed                                                                                                                                                                                                                                                                                                                                                                             |
| Spill strength 40                                          | Leaves a green edge                                                                              | Strength 100, edges only (skin unchanged)                                                                                                                                                                                                                                                                                                                                           |
| Edge shrink −5…+5, feather 0–10                            | Damage at larger values                                                                          | −2…+2 and 0–3, both default 0, inside Advanced                                                                                                                                                                                                                                                                                                                                      |
| "Live preview — instantly"                                 | Browser math ≠ FFmpeg                                                                            | Opens on the **original video** with the picker on (magnifier + hex under the pointer). A click removes that color and opens a **split view** (draggable line: original ↔ removed) on a **checkerboard**. While playing, the green is removed **live on the GPU** with FFmpeg's own formula (checked against FFmpeg within 6/255). When paused, the **exact FFmpeg frame** is shown |
| Video player with controls                                 | —                                                                                                | Control bar over the preview: play/pause, time, scrubber, frame step, sound, loop, full screen                                                                                                                                                                                                                                                                                      |
| CRF 0–63 + bitrate                                         | Confusing, bitrate fights CRF                                                                    | One "File size" control                                                                                                                                                                                                                                                                                                                                                             |
| "Remove audio (Recommended)"                               | Drops the avatar's voice                                                                         | Keep when sound is detected                                                                                                                                                                                                                                                                                                                                                         |
| Step 8 picture only                                        | Nothing to act on                                                                                | Embed code, hosting checklist, test page + QR                                                                                                                                                                                                                                                                                                                                       |
| Green primary button, light gray helper text               | Fails contrast; green = "removed" in this tool                                                   | Blue primary, darker text, visible focus ring                                                                                                                                                                                                                                                                                                                                       |

**Still open from the review:** sticky preview on phones while scrolling the settings; crop feature; "Custom" background from a screenshot of your own site; poster/pause/reduced-motion options in the embed code; batch mode.

---

## 8. Architecture

### 8.1 Overview

```text
 Browser (React)                        Node.js server (Express)                    FFmpeg
┌──────────────────────┐   upload    ┌──────────────────────────────┐   spawn   ┌──────────────┐
│ Editor screen        │───────────▶ │ /api/upload   (ffprobe info) │─────────▶ │ ffprobe      │
│  - video + preview   │  frame png  │ /api/frame    (1 frame)      │─────────▶ │ ffmpeg frame │
│  - settings panel    │◀─────────── │ /api/preview  (keyed frame)  │─────────▶ │ ffmpeg key   │
│  - generate/progress │   job id    │ /api/jobs     (queue)        │─────────▶ │ ffmpeg encode│
│  - downloads + embed │◀─────────── │ /api/jobs/:id (progress)     │           └──────────────┘
└──────────────────────┘   files     │ /files/...  (range support)  │
                                     └──────────────────────────────┘
```

### 8.2 Folder structure (planned)

```text
VDO/
├── ROADMAP.md            ← this file
├── plan.png              ← UI mockup
├── app/                  ← Next.js pages (upload, edit, results) + API routes + test page
├── components/           ← React UI (editor, results, accessible controls)
├── lib/                  ← settings, FFmpeg pipeline, job queue, storage (no Next.js imports)
├── tests/ · e2e/         ← Vitest (unit + real encodes) and Playwright (Chromium + WebKit)
├── scripts/              ← check-hevc-alpha.swift (Apple decoder check)
├── samples/              ← real Veo test clips (not in git)
└── storage/              ← uploads + outputs (not in git)
```

### 8.3 API (first version)

| Method             | Path                                         | Does                                                                                                                                                                  |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                | `/api/health`                                | FFmpeg check (encoders, filters, and a real 1-frame HEVC-alpha test)                                                                                                  |
| POST               | `/api/videos`                                | Raw-body upload (500 MB cap). Runs `ffprobe` + sound check + key detection. Returns id, info, suggested key                                                           |
| GET                | `/api/videos/:id/frame?t=2`                  | One original frame as PNG                                                                                                                                             |
| GET                | `/api/videos/:id/pick?x&y&t`                 | Median color of a 5×5 patch + "looks like the background?"                                                                                                            |
| POST               | `/api/videos/:id/preview`                    | Settings in → keyed frame PNG; `X-VDO-Stats` header has the see-through %                                                                                             |
| POST               | `/api/jobs`                                  | Settings in → job id (queued, one at a time)                                                                                                                          |
| GET / DELETE       | `/api/jobs/:id`                              | Status with per-file progress / cancel (`?purge=1` deletes the files)                                                                                                 |
| GET                | `/api/files/:jobId/:name`                    | Download with Range support (`?download=1` to save)                                                                                                                   |
| GET                | `/api/videos/:id/source`                     | The uploaded clip (Range) for the playing preview                                                                                                                     |
| POST               | `/api/videos/:id/estimate`                   | Estimated WebM / Safari MOV / ProRes size from a 2-second real encode                                                                                                 |
| POST               | `/api/videos/:id/cropbox`                    | The area "Crop empty area" keeps (whole-clip `bbox` on alpha) + the new size                                                                                          |
| GET                | `/api/jobs/:id/share`                        | Test-page address on your Wi-Fi + QR code                                                                                                                             |
| GET                | `/test/:jobId`                               | Plain-HTML test page running the exact embed code                                                                                                                     |
| GET                | `/api/videos`                                | My Assets: every upload, newest first, with the projects that use it                                                                                                  |
| GET / DELETE       | `/api/videos/:id`                            | Video info / delete (refused with 409 while a project uses it)                                                                                                        |
| GET                | `/api/videos/:id/thumb` · `/strip` · `/wave` | Cached thumbnail (JPEG), timeline filmstrip (12 frames), sound waveform (PNG)                                                                                         |
| GET / POST         | `/api/projects`                              | Project list (name, date, video) / new project `{ videoId, spec, name?, jobId? }`                                                                                     |
| POST               | `/api/videos/:id/mask`                       | AI Removal: start or poll the whole-clip mask `{ state, percent, packed }` (Apple Vision, cached per clip + mask setting)                                             |
| GET                | `/api/videos/:id/packed/:key`                | AI playing preview: picture on top, mask underneath (H.264, Range)                                                                                                    |
| GET / PUT / DELETE | `/api/projects/:id`                          | Open / autosave and rename `{ name?, videoId?, spec?, jobId? }` / delete. Stored as `storage/projects/<id>/project.json` (project model v2: tracks → clips → effects) |

Requests send an **EditSpec** (`{ version, ops, output }`, see Section 15). Old `{ settings }` bodies are still accepted and converted.

The settings travel as JSON and are checked against one schema in `shared/`:

```json
{
  "keyColor": "#12AF34",
  "similarity": 0.05,
  "blend": 0.15,
  "despill": true,
  "resolution": "original",
  "fps": "original",
  "quality": "balanced",
  "audio": "keep",
  "crop": false,
  "master": false
}
```

---

## 9. Roadmap — step by step

Effort is a rough guess for one developer working part-time.

### Phase 0 — Setup · ½ day

- [ ] Install Node.js LTS. Check `ffmpeg -version` (9.0.1 is installed).
- [ ] `git init`, add `.gitignore` (`samples/`, `storage/`, `node_modules/`).
- [ ] Write `scripts/check-ffmpeg.sh`. It checks that `libvpx-vp9`, `hevc_videotoolbox`, `chromakey`, `despill`, `alphamerge` exist.

**Done when:** the check script prints all ✅.

### Phase 1 — Prove it on real Veo clips · 1–2 days ⭐ start here

- [ ] Collect 3–5 real Veo/Flow clips with different looks: white top, dark top, long loose hair, fast hand movement, glasses or jewellery.
- [ ] `scripts/convert.sh input.mp4` makes `avatar.webm` + `avatar_hevc.mov` with the recipe in 5.2.
- [ ] `scripts/test-page/`: a checkerboard page that plays both files side by side.
- [ ] Look at every clip in **Chrome, Safari, and a real iPhone** over dark, white and checkerboard backgrounds.
- [ ] Write down file sizes and anything that looks wrong: halo, see-through areas, cut-off hair.
- [ ] Adjust the default similarity/blend if needed and update Section 6.

**Done when:** all clips look clean and transparent on Chrome, Safari and iPhone, and sizes are recorded.

### Phase 2 — Backend API · 2–3 days

- [ ] Express server + upload (size and duration limits, check the file with `ffprobe`).
- [ ] `shared/settings.ts`: schema (zod) + defaults + presets.
- [ ] `shared/buildFfmpegArgs.ts`: settings → FFmpeg argument array. Pure function with unit tests.
- [ ] Frame and preview endpoints (one FFmpeg call per preview, under ~0.5 s).
- [ ] Job queue (1–2 jobs at a time), progress from `ffmpeg -progress pipe:1`.
- [ ] File serving with range support. Auto-delete files after 24 h.

**Done when:** you can run the whole conversion with `curl` and get both files back.

### Phase 3 — Editor screen · 3–5 days

- [ ] One editor screen instead of 8 separate steps: video/preview on the left, settings on the right, Generate at the bottom.
- [ ] Upload with drag & drop. Show video info (resolution, fps, duration, audio).
- [ ] Key color: auto-detect + eyedropper (click on the video, 5×5 average) + HEX input.
- [ ] Preview: Original / Transparent toggle, background choice, scrub to any time. The preview updates about 0.2 s after a slider stops moving.
- [ ] Warnings: "Parts of the person are becoming see-through" and "Green edges detected".
- [ ] Basic settings visible, Advanced collapsed, presets (Small / Balanced / High quality).

**Done when:** a non-technical person can go from upload to a good-looking preview without help.

### Phase 4 — Generate, download, embed · 1–2 days

- [ ] "Generate" makes **both** files (+ optional master), with a progress bar and time estimate.
- [ ] Download buttons for each file and a ZIP of both.
- [ ] "Copy embed code" with the player code from 5.3.
- [ ] Result page that plays the output over checkerboard / white / dark.
- [ ] Short hosting notes: range requests and correct file types.

**Done when:** you paste the embed code into a test page and it works in Chrome, Safari and on iPhone.

### Phase 5 — Quality and safety · 2–3 days

- [ ] Security rules from [Section 11](#11-security-and-limits).
- [ ] Error messages: wrong file, no green found, too long, encode failed.
- [ ] Automated tests:
  - unit tests for the settings schema and the argument builder;
  - one integration test that runs FFmpeg on a synthetic clip and checks alpha exists and size limits;
  - browser alpha check (like our Chrome + WebKit test).
- [ ] Accessibility pass: contrast, keyboard use of sliders, labels.

**Done when:** all tests pass and bad inputs give clear messages instead of crashes.

### Phase 6 — Go online · 1–3 days (after a small test)

- [ ] Pick a hosting option from [Section 12](#12-deployment-options) after a quick trial.
- [ ] Storage for uploads/outputs (e.g. S3 / Cloudflare R2) and a CDN that supports range requests.
- [ ] Rate limits, upload limits, logs, and a delete-my-files policy.

**Done when:** the site runs online and a stranger's upload works end to end.

### Phase 7 — Later ideas

- [ ] AI matting for hair and motion blur (e.g. RobustVideoMatting, BiRefNet, SAM 2, MatAnyone). This is when "Hair Detail" makes sense.
- [ ] Instant in-browser preview (WebGL shader that copies FFmpeg's chromakey math).
- [ ] "Stacked alpha" MP4 + small WebGL player: one file for all browsers (see Section 12).
- [ ] Batch mode (many clips at once), saved presets, accounts.
- [ ] Generate directly with the Veo API, then key automatically.

---

## 10. Test plan

### 10.1 Test clips

| Clip                    | Why                           |
| ----------------------- | ----------------------------- |
| White or light-gray top | First thing to go see-through |
| Long loose hair         | Soft edges, green halo        |
| Fast hand movement      | Motion blur                   |
| Glasses / jewellery     | Shiny and see-through objects |
| Pale skin and dark skin | Keying + despill color safety |
| Clip with speech        | Audio kept and in sync        |

### 10.2 Browser / device matrix

|                       | WebM VP9 + alpha                                          | MOV HEVC + alpha          | Embed code picks |
| --------------------- | --------------------------------------------------------- | ------------------------- | ---------------- |
| Chrome (Mac)          | ✅ tested                                                 | ✅ tested                 | WebM             |
| Safari (Mac)          | ❌ tested (opaque)                                        | ✅ tested (WebKit engine) | MOV              |
| Chrome (Windows)      | ☐                                                         | ☐ (probably ❌)           | WebM             |
| Edge (Windows)        | ☐                                                         | ☐                         | WebM             |
| Firefox (Mac/Windows) | ☐ manual (automatic test can't start Firefox on this Mac) | ☐                         | WebM             |
| Chrome (Android)      | ☐                                                         | ☐                         | WebM             |
| Safari (iPhone/iPad)  | ☐                                                         | ☐                         | MOV              |
| Chrome (iPhone)       | ☐                                                         | ☐                         | MOV              |

---

## 11. Security and limits

- **Never build a shell string.** Run FFmpeg with `spawn("ffmpeg", argsArray)`.
- **Never put user text into the filter graph without checking it.** A fake color such as `…,movie=/some/other/file` could inject extra filters. Rules:
  - color must match `^#?[0-9A-Fa-f]{6}$`;
  - every number is clamped to its range;
  - resolution, fps, quality and audio come from a fixed list.
- Check uploads with `ffprobe`, not just the file extension.
- Limits: max 500 MB, max 60 s, max 3840×2160, max 60 fps (`LIMITS` in `lib/settings.ts`).
- Run 1–2 encodes at a time (queue). Add a timeout per job.
- Delete uploads and outputs after 24 h. Tell users this.
- Veo videos can carry Google's visible/invisible watermark (SynthID). Don't promise to remove it, and check Google's terms for commercial use.

---

## 12. Deployment options

The Safari file (HEVC + alpha) needs Apple's `hevc_videotoolbox`, which only runs on **macOS**.

| Option                       | How                                                                                | Good                                            | Bad                                                |
| ---------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| **A. Mac server**            | Mac mini at home/office, or a cloud Mac (e.g. AWS EC2 Mac, MacStadium)             | Same recipe as now; Safari-compatible for sure  | Cloud Macs cost more                               |
| **B. Linux + custom FFmpeg** | Build x265 with alpha support + FFmpeg on a Linux server                           | Cheap, standard hosting                         | Must test that Safari plays x265's alpha files     |
| **C. Stacked alpha MP4**     | Color and alpha side by side in one normal MP4; a small WebGL script combines them | One small file for **all** browsers, any server | Needs a JS player instead of a plain `<video>` tag |

**Recommendation:** use **A (your Mac)** for Phases 1–5. Before Phase 6, do a 1-day trial of B and C, then choose.

---

## 13. Open questions

1. Where will the avatar appear on your site, and at what size? If it is small (e.g. 400×150), cropping and scaling will cut the file size a lot.
2. Does the avatar **speak**? If yes, audio stays on and we need an unmute button (browsers only autoplay muted video).
3. Is this tool for **you only**, or for other people too? Public use needs Phases 5–6 (limits, storage, privacy).
4. How long are your clips usually? Veo clips are often 8 s; the mockup shows 10 s.
5. Is a JS player (option C) acceptable on your website, or must it be a plain `<video>` tag?

---

## 14. Appendix

### A. Review of the ChatGPT chat

**Right:**

- Veo/Flow can't export alpha, so key a solid background afterward.
- The basic chromakey, VP9 and ProRes commands are valid.
- Preview a single frame, use checkerboard/black/white backgrounds, group settings into presets + Advanced.

**Wrong or missing:**

1. The Safari file was ProRes 4444 (45–50 MB). The small option it offered (libx265) fails. The fix is HEVC + alpha via `hevc_videotoolbox` (about 200 KB).
2. Its "recommended" feature-detection code serves WebM to Safari, which shows a dark box.
3. It said "don't treat iOS Chrome as Safari". That's backwards: all iOS browsers use WebKit.
4. Its browser preview math (RGB distance) doesn't match FFmpeg's chromakey (UV distance).
5. About half of its 24 settings have no FFmpeg equivalent (Green Shade Tolerance, Edge Cleanup, Hair Detail, Motion Edge).
6. Its key defaults give a hard green edge. Its "fix" settings made the person see-through.
7. Its recipe used `fps=30`, which makes 24 fps Veo clips bigger. It defaulted to removing audio, which can drop the avatar's voice.
8. It didn't mention security (filter injection), range requests, or that the VP9 alpha check needs the libvpx decoder.

### B. Glossary

| Word                   | Meaning                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Alpha**              | The transparency channel. 0 = invisible, 255 = solid                                           |
| **Chroma key**         | Making one color (the green) transparent                                                       |
| **Similarity / Blend** | How wide a range of green is removed / how soft the edge is                                    |
| **Spill / Despill**    | Green light reflected onto the person's edges / removing it                                    |
| **VP9, HEVC, ProRes**  | Video compression formats. VP9 → WebM file, HEVC → MOV for Safari, ProRes → large editing file |
| **CRF**                | Quality setting for WebM. Higher number = smaller file, lower quality                          |
| **WebKit**             | Safari's browser engine. Every iPhone/iPad browser uses it                                     |
| **Range requests**     | The server sends a video in pieces. Safari requires this                                       |

---

## 15. Studio & feature architecture

### 15.1 What other editors do (and what we copied)

| Platform              | Pattern                                                                                                           | In VDO                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CapCut web            | Chroma key inside _Remove background_ in a right-side panel: color picker, intensity, live preview                | Remove background tool in the inspector, magnifier picker, live GPU preview     |
| Kapwing               | Studio: canvas in the middle, tools on the side, **Export** top-right                                             | Same shell; Export button top-right opens the Export panel                      |
| Premiere Ultra Key    | Controls grouped _Matte Generation → Matte Cleanup → Spill Suppression_; editors flip to the _Alpha Channel_ view | Sections _Key color → Removal → Edges & glow_, each with Reset; Alpha mask view |
| Photoshop / remove.bg | Press-and-hold to compare with the original                                                                       | **Hold to compare** button and the `\` key                                      |
| Most editors          | Undo/redo, left tool rail, bottom timeline                                                                        | Undo/redo (⌘Z / ⇧⌘Z); tool rail; timeline planned (Trim)                        |

### 15.2 The screen

```text
┌ VDO │ file · size · fps · length [Change video] │ ↺ ↻ │                [ Export ] ┐
├ Tools ┤ Canvas: upload box → preview (Removed / Original / Split / Alpha /       ├ Inspector (scrolls)
│ rail  │ Final file) · hold to compare · zoom · magnifier · control bar           │ panel of the active tool
└───────┴───────────────────────────────────────────────────────────────────────────┴──────────────────────
```

- State lives in the URL (`/?v=<video>&job=<export>`), so a reload restores everything. Old `/edit/…` and `/results/…` links redirect.
- After picking the color, the canvas shows the **full removed view**. Split is one click away.
- On phones: tools become a tab bar, the preview stays pinned at the top, and the inspector scrolls below it.

### 15.3 How a feature is built

| Layer                         | File                                       | What to add                                                                                         |
| ----------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Operation (changes the video) | `lib/ops/<name>.ts`                        | An `OpDefinition`: `schema`, `defaults`, `sanitize`, `toFilter(params, input, graph) → outputLabel` |
| Register the op               | `lib/ops/registry.ts` + `lib/edit/spec.ts` | One line in `OPS`, one entry in the `OpInstance` union                                              |
| Tool panel (UI)               | `components/studio/tools/<Name>Panel.tsx`  | The controls for that op, using `Section`, `LabeledSlider`, `Switch`…                               |
| Register the tool             | `components/studio/tools/registry.ts`      | One line in `TOOLS`                                                                                 |
| Tests                         | `tests/unit/…`                             | Graph-string tests, plus an integration test with a real encode                                     |

The graph builder chains every enabled op: **source → op 1 → op 2 → … → resize → output format**. Chroma key is op 1 today. A test checks that it still produces exactly the tested filter strings.

### 15.4 Future operations (not built yet)

| Feature                    | FFmpeg building block                   | Notes                                                         |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Trim                       | input `-ss` / `-t`                      | Needs a timeline strip under the canvas                       |
| Auto-crop to the person    | `bbox` on alpha (two-pass) → `crop`     | Biggest file-size saving for overlays                         |
| Resize / canvas / position | `scale`, `pad`                          | For fixed overlay boxes (e.g. 400×150)                        |
| Background replace         | `overlay` over a color, image or video  | Also useful for a normal MP4 export                           |
| Color adjust               | `eq`, `colorbalance`                    | Match the avatar to the website                               |
| Speed                      | `setpts`, `atempo`                      | Marks `affectsTiming` for progress                            |
| Loop / boomerang           | `reverse` + `concat`                    | Smooth idle loops                                             |
| Drop shadow / outline      | alpha → `gblur` → `overlay`             | Makes the avatar stand out on busy pages                      |
| AI matting (hair)          | RobustVideoMatting, BiRefNet, MatAnyone | Replaces or refines the chroma-key op                         |
| Captions                   | `subtitles` / `drawtext`                | Your FFmpeg build has no libfreetype; needs a different build |
