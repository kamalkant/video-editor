# Editor Audit — Findings, Fixes & Test Matrix

Audit date: 2026-10-24 · Scope: the editor (`components/studio/**`, `components/editor/**`), how it draws and exports (`lib/render/**`, `lib/export/**`, `lib/player/**`, `lib/text/**`, `lib/elements/**`), the API routes it calls (`app/api/videos/**`, `jobs`, `files`, `brand`, `templates`, `library`, `stock`, `storage`, `projects/*/versions`, `ai`), and every tool and setting panel.

It started from two problems reported by a user:

1. **Exports lost their animations and transitions.** The file had none of the entrance/exit animations, transitions, elements or effects seen in the preview.
2. **Text could not be styled letter by letter, and there were only 5 fonts.**

## Summary

| | Before | After |
|---|---|---|
| What the browser export drew (the default MP4 / WebM / HEVC / PNG / JPG path since 18 Oct) | videos, pictures, plain text, fades | everything the preview draws: one shared renderer (`lib/render/frame.ts`) |
| Preview ≠ export gaps found (any path, the Export dialog's preview too) | 26 | 2, both noted below (motion backdrops on the server, the Free-plan mark) |
| Editing controls that did nothing anywhere | 8 (VFX ×4, Diamond/Star masks, mobile animations, mobile effects names) | 0 |
| API routes that read or changed someone's data, or started FFmpeg work, with no owner check | ~45 handlers | 0 (public on purpose: sign-in, plans, health, export files, the website) |
| Fonts | 5 system stacks + Brand Kit (12) | 1,950 Google families (63 with Hindi / Devanagari) + Brand Kit (50) |
| Text styling | one look per clip | any letters: size, color, font, bold, italic, underline, strike, marker color |
| Unit tests | 1,146 | 1,186 (+ new integration and e2e, below) |
| ESLint errors in the files this work touched | 83 | 68 (none new) |
| `tsc --noEmit` errors (whole repo) | 76 | 56 (none new; 20 old ones fixed on the way) |

### Behaviour changes to know about

- **Rich text.** The Text panel's box shows the styles. Select letters or a word, then use the toolbar: font, size − / +, color, **B** / *I* / U / S, marker pen, clear. With nothing selected, the toolbar changes the whole text. Double-clicking a word on the preview selects it in the box. Hindi typing (IME) is safe: nothing is touched while a letter is being composed. The mobile Text sheet has the same box.
- **Fonts.** The font picker searches the whole Google Fonts library by name and kind (हिंदी, Sans, Serif, Display, Handwriting, Mono). Fonts load from Google when a project uses them; a project's fonts load before every export. Each name shows in its own font, using a tiny copy that holds only those letters.
- **The browser export now matches the preview.** When a project needs work only the server can do (AI background removal, stabilize, noise removal, even loudness, a sped-up clip with sound, very long sound), it goes to the server export automatically. PNG and JPG are now one picture of the playhead frame (before: an MP4 of the whole video).
- **Brand Kits are per person.** The old shared `storage/brand.json` moves once to the person whose logo, intro or videos it uses, else to the first super admin. Its fonts move with it.
- **Your templates, files, exports and project versions are yours.** Anyone else, or anyone signed out, gets 404 / 401. Files from before files had owners stay open to anyone signed in. Server-made files (AI pictures and videos, voices, imports, freeze frames, extracted clips, stock photos) now belong to the person who made them.
- **Server-only tools.** The music folder can be set by super admins only. The server's Documents folder works only on a local install (`VDO_LOCAL_MODE=1`); on viplay.in, drafts are saved on the user's own computer.
- **Security headers** on every response: `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.
- **Unchanged by decision:** the browser export still has no Free-plan mark and no plan resolution limit. The server export keeps both. See accepted risks.

## How to verify

```bash
npm run typecheck                                    # 56 errors, all in files listed under "Old type errors"
npm test                                             # unit + integration (real FFmpeg)
npx vitest run tests/unit/editor-authz.test.ts       # who can use which file, kit, template, job, version
npx vitest run tests/unit/frame-render.test.ts       # the shared renderer: transitions, animations, blend, VFX, masks
npx vitest run tests/unit/text-marks.test.ts tests/unit/fonts.test.ts
npx vitest run tests/integration/export-parity.test.ts
npx playwright test e2e/export-parity.spec.ts --project=chromium   # real Chrome: browser MP4 export has the crossfade, styled Hindi text, slide-in, element; the dialog's preview and quick-preset pictures show the export
node scripts/build-font-catalog.mjs                  # refresh the Google Fonts list (public/fonts/google-fonts.json)
```

The e2e run starts `next dev` with `.next-e2e`, which rewrites `next-env.d.ts`; restore it afterwards. If sign-in fails with `DEVICE_LIMIT_EXCEEDED`, clear the e2e user's rows in `e2e/.auth/VDO.db`.

## Findings

Severity: **C** critical (lost work, data leak, outage) · **H** high · **M** medium · **L** low. Status: ✅ fixed · ⏭ backlog · ⚖ accepted.

### Export pipeline (E)

| ID | Sev | Where | Issue → impact | Status | Test |
|---|---|---|---|---|---|
| E1 | C | `lib/export/localExport.ts` (since 18 Oct, the default for MP4 / WebM / HEVC in Chrome, Edge and Safari) | Its frame loop drew only videos, pictures, plain text and fades. Missing: entrance/exit animations, every transition and dip, text keyframes, typewriter, word-by-word captions, **all elements**, looks, masks, crop, skew, corner pin, patches, keys, blend modes, the logo and motion-tracked blurs. **This is the reported bug.** | ✅ drawn by `lib/render/frame.ts`, the preview's own code | frame-render, e2e export-parity |
| E2 | H | `canExportLocally` + `exportLocally` | PNG and JPG went through the video exporter: an MP4 of the whole timeline named `video.mp4` | ✅ one frame at the playhead, `frame.png` / `frame.jpg` | e2e (PNG checked in Chrome) |
| E3 | H | `seekVideo`, `LocalVideoPool` | A seek gave up after 25 ms, so frames were stale or duplicated. Only 2 `<video>` elements were shared by all clips, so picture-in-picture and transitions drew the wrong clip's frame. | ✅ one element per visible clip; waits for `seeked` + `requestVideoFrameCallback`; fails rather than draws a stale frame | e2e |
| E4 | H | `VideoEncoder` `error:` callback | Encoder errors were only logged, so a broken file was reported as finished | ✅ the first error stops the export | — |
| E5 | H | browser export sound | Speed, transition crossfades, volume automation, ducking, reversed clips, noise removal and loudness were all ignored | ✅ mixed by the preview's rules (`audioPlan`, `partLevel`); server-only sound work goes to the server | localExport.test |
| E6 | H | `lib/render/compose.ts` | Transitions on **text** and **element** clips were dropped by the server export (`tr = null`) | ✅ text with a transition is cut to its own area, so wipes, circles, turns and zooms act on it | export-parity |
| E7 | H | compose, blank scenes | A blank scene's backdrop (template backgrounds, gradients, studio sets) exported as its flat fill color | ✅ drawn by the browser and sent (still image on the server; animated in the browser export) | export-parity |
| E8 | H | `renderTextSprite` + `lib/renders.ts` `MAX_SIDE` 8192 | Typewriter and word sprites were one tall column (h × 61). The "Quote" style was ~16,600 px, so the upload was rejected and the export failed. | ✅ cells in a grid that fits 8192 × 8192; steps capped for huge text | export-parity |
| E9 | M | `asSingleVideo` | Ignored transitions and blend modes, so the website pack of a split single video dropped its transitions | ✅ | export-parity |
| E10 | M | `layersAt` | A hidden Video 1 still showed in the preview (the server export hid it) | ✅ | — |
| E11 | M | browser export memory | The whole sound of every file was decoded, plus one full-length buffer, plus a spread of typed arrays every 1,024 samples | ✅ mixed 30 s at a time with `Float32Array.set`; more than 20 min of sound goes to the server. ⏭ an in-memory MP4 for long videos (stream into a picked file) | — |
| E12 | L | key frames | `frameIndex % (F*2)` with a fractional fps gave one key frame at the start only | ✅ `Math.round(2F)` | — |
| E13 | M | browser export | No Free-plan mark and no plan resolution limit (the server export has both) | ⚖ product decision (2026-10-24) | — |
| E14 | L | server export | Motion studio sets (e.g. the globe) are a still image on the server; they move in the preview and the browser export | ⏭ | — |
| E15 | H | Export & Share dialog preview (`components/studio/ExportDialog.tsx`) | When played it showed only the **first video's raw file** (from 0, untrimmed, without other clips, text, elements, animations, transitions or effects). Paused, it showed a snapshot of the editor at opening. A social size (e.g. 9:16) wasn't shown either. | ✅ `components/studio/ExportPreview.tsx` plays the export itself with `drawFrame`, at the export's size and background (`lib/export/exportDoc.ts`, which `generate()` uses too), with the export's sound mix, scrubbing and mute; a PNG / JPG is the frame the preview stopped on; the editor's own preview pauses while the dialog is open | e2e export-parity, export-doc |
| E16 | M | Export & Share dialog, Quick presets (`components/studio/ExportDialog.tsx`, Studio `thumbUrl`) | Every preset card showed a **broken picture** for a file kept on this computer: the cards asked the server for `/api/videos/<id>/frame`, which it hasn't got (404). A snapshot of the editor used to hide this; E15 removed it. The cards also cropped one picture into each shape, which isn't what a tall or square export of a wide project looks like. | ✅ The preview draws the frame it stands on at each preset's size, as that export (`ExportPreview` `thumbs`, the same `drawFrame`). Nothing is fetched. A local file's interim picture is the one taken in the browser, and a picture that fails shows the placeholder | e2e export-parity |
| E17 | M | Export ▾ › Thumbnail maker (`components/studio/ThumbnailDialog.tsx`) | For a file kept on this computer the background frame never came: the dialog asked the server for `/api/videos/<id>/frame` (404) and said "Couldn't load the frame at the playhead" | ✅ `localFrame` (`lib/media/localMedia.ts`) takes the frame from this computer's file (this tab, or its copy in the browser); the server makes it only for files that aren't here | e2e export-parity |

### Tools and configuration (T)

| ID | Sev | Where | Issue → impact | Status | Test |
|---|---|---|---|---|---|
| T1 | H | Effects ▸ VFX: Glow, Film grain, Soft blur, Retro pixelate (and presets using grain) | Saved in the clip but never passed to the GPU look, and ignored by the export. **No effect anywhere.** | ✅ preview + browser export (shader; grain moves every frame) and server export (`lutrgb`, `noise`, `gblur`, pixelate) | frame-render, export-parity |
| T2 | H | Mask ▸ Diamond, Star | Preview drew no mask; the export cut a rectangle | ✅ the shader's shapes everywhere (`maskDistance[Expr]`) | frame-render, export-parity |
| T3 | M | Transform ▸ Blend | Applied in the server export only, never in the preview (`compositeOp` was never used) | ✅ | frame-render |
| T4 | M | Mobile Effects sheet | Wrote animation names that don't exist (`glitch`, `shake`, `flash`, `zoomIn`…), so the project failed validation at save and export | ✅ only real animations, only on pictures, text and elements | — |
| T5 | M | Mobile Text sheet | Animation buttons did nothing; the words couldn't be edited; 5 fonts | ✅ Words tab (rich box), full font library, working animations | — |
| T6 | L | Mobile "Open audio library" | Called functions that don't exist (it crashed) | ✅ | — |
| T7 | M | Text letter spacing, typewriter | Drawn per code point, so Hindi matras and conjuncts split apart (dotted circles) | ✅ whole letters (graphemes) | text-marks |
| T8 | M | Brand Kit fonts | A font from a kit that wasn't active failed to load in projects that used it | ✅ looked up in all of the person's kits | editor-authz |
| T9 | M | 24-hour cleanup (`projectReferences`) | Read the old single-kit `brand.json` shape, so logos and intros of multi-kit stores could be deleted | ✅ reads every person's kits | — |
| T10 | L | Export results | "Delete files now" was shown for exports made in the browser (nothing on the server) | ✅ hidden | — |
| T11 | L | Share dialog | The link / iframe `/?p=<project>` opens the website; nobody else can open a project | ⏭ simulated feature: build sharing, or remove it | — |
| T12 | L | Output settings | The panel is disabled for multi-clip timelines (by design). `output.audio = "remove"` is set by a silent first video and must not mute music added later. | ✅ timelines keep their sound (both exports) | export-parity, localExport.test |
| T13 | L | `videoClip.loop` | In the schema; no control and no renderer | ⏭ | — |

### Security (S)

viplay.in is one server for everyone, but many editor routes were still written for a single local user.

| ID | Sev | Where | Issue → impact | Status | Test |
|---|---|---|---|---|---|
| S1 | C | `/api/brand*`, `lib/brand.ts` | One `storage/brand.json` for every user, no sign-in. Anyone could read, change or delete everyone's Brand Kits, upload 8 MB fonts, and read logo / intro media ids. | ✅ per person (`storage/brand/<user>.json`, fonts in `brand-fonts/<user>/`), sign-in, one-time migration | editor-authz |
| S2 | C | `/api/templates/custom*`, `lib/templates/custom.ts`, `/api/templates/media`, music library "My uploads" | One global list, no sign-in. It leaked every user's video and sound ids; anyone could change or delete any template. | ✅ owner on each template and upload (older ones: the owner of their video) | editor-authz, formats-templates, template-files |
| S3 | C | `/api/videos/[id]/*` (24 routes) | Any file was served to anyone with its id, and its FFmpeg work started for strangers. Chain: S1 / S2 ids → `/source` downloads someone's private video. | ✅ `requireMedia` (owner or staff); heavy work rate-limited per person | editor-authz, proxy-route |
| S4 | C | `POST /api/stock/photos` | **SSRF:** fetched any address for anyone (internal ports, cloud metadata), followed redirects, no size limit, and returned the status | ✅ sign-in, https from the stock hosts only, no redirects, 25 MB streamed limit, `image/*` only, owner set, temp file removed, generic errors | editor-authz |
| S5 | H | `/api/storage/device-folder` + `lib/storage/deviceFolder.ts` | Every autosave of every user posted the full project into the server's `~/Documents/VDO` (shared names like `Untitled_Project.draft.vdo`); anyone could write files there; GET showed the home path | ✅ only with `VDO_LOCAL_MODE=1` and sign-in; the client asks once and stops posting | editor-authz |
| S6 | H | `POST /api/library/folder` | Anyone could set the server's music folder to any path and stream the audio files found there | ✅ super admins only | editor-authz |
| S7 | H | `/api/jobs/[id]` (+ `share`) | Anyone with a job id could read the whole timeline, cancel or delete the export, and see the LAN address | ✅ owner (or staff); `/api/files/*` stays public because embed codes link to it | editor-authz |
| S8 | H | `/api/projects/[id]/versions*` | No sign-in at all | ✅ sign-in + project owner | editor-authz |
| S9 | H | `POST /api/jobs` | A timeline or single-video export could include other people's file ids | ✅ every file must be the person's own | — |
| S10 | H | server-made files (`lib/videos importFile`) | AI pictures and videos, voices, imports, freeze frames, extracted clips and stock photos had no owner: open to anyone signed in, and missing from the creator's My Assets | ✅ `lib/auth/owner.ts` scope (AI, imports) + explicit owner | — |
| S11 | M | AI routes | Subtitles, highlights, picture edit (`fromId`), Veo first frame and the Veo result accepted anyone's file ids | ✅ | — |
| S12 | M | `next.config.ts` | No security headers (clickjacking of the admin panel possible) | ✅ headers; ⏭ Content-Security-Policy | — |
| S13 | L | `/api/health?refresh` | Anyone could make the server probe FFmpeg again and again | ✅ staff only | — |
| S14 | L | `.env.example`, `lib/ai/keys.ts` | A real Pixabay key was in `.env.example` (which must only hold placeholders); the same key is the built-in default in `lib/ai/keys.ts` (a product choice), so it's in git history | ✅ placeholder in `.env.example`; ⏭ rotate the key if it's ever abused, and keep defaults in the server's environment | — |

### Performance (P)

| ID | Sev | Where | Issue | Status |
|---|---|---|---|---|
| P1 | M | `ProgramPlayer` | `setTime` every animation frame while playing re-rendered the whole player (handles, layouts) 60× a second | ✅ about 10× a second unless a clip's box is shown; the picture still draws every frame |
| P2 | M | text drawing | Every word of every text was measured every frame | ✅ layouts kept until a font arrives |
| P3 | L | text warp, element flip, blur patches | New canvases every frame | ✅ reused |
| P4 | L | motion tracking | Attachment lookup scanned every track for every layer, every frame | ✅ once per timeline |
| P5 | M | `components/studio/Studio.tsx` | 10,300 lines, 80 `useState`, no `memo`: any change re-renders the editor | ⏭ split by panel |
| P6 | M | server compose | One looped PNG input + overlay per text clip: subtitle-heavy projects make FFmpeg graphs with hundreds of inputs | ⏭ batch captions into one track video |
| P7 | L | "remove" patches | `getImageData` every frame | ⏭ |

## Preview ↔ export parity (after)

| Feature | Preview | Browser export | Server export |
|---|---|---|---|
| Transitions on Video 1 and overlay pictures | ✓ | ✓ (was ✗) | ✓ |
| Transitions on text and elements | ✓ (was opacity only) | ✓ | ✓ (was ✗) |
| Entrance / exit animations, typewriter, karaoke captions | ✓ | ✓ (was ✗) | ✓ (typewriter grid: was failing for big text) |
| Keyframes (move, size, turn, stretch, skew, corners, pivot) | ✓ | ✓ (was partly) | ✓ |
| Elements (shapes, stickers, tickers, progress) | ✓ | ✓ (was ✗) | ✓ |
| Looks, color, vignette, sharpen | ✓ | ✓ (was ✗) | ✓ |
| VFX glow / grain / blur / pixelate | ✓ (was ✗) | ✓ | ✓ close match (was ✗) |
| Masks: rounded, circle / diamond, star | ✓ / ✓ (was ✗) | ✓ | ✓ / ✓ (was a rectangle) |
| Blend modes | ✓ (was ✗) | ✓ | ✓ |
| Color / black key | ✓ GPU | ✓ same GPU key | ✓ FFmpeg key (close) |
| AI removal, stabilize | ✓ (server copies) | → server | ✓ |
| Reversed clips | ✓ | ✓ | ✓ |
| Logo, motion-tracked blur | ✓ | ✓ (was ✗) | ✓ |
| Rich text and Google / Brand Kit fonts | ✓ | ✓ | ✓ (text is drawn by the browser) |
| Blank-scene backdrops | ✓ animated | ✓ animated | still image (was flat color) |
| Sound: volume, fades, automation, transitions, ducking | ✓ | ✓ (was partly) | ✓ |
| Sound: noise removal, loudness, speed with pitch kept | ✓ | → server | ✓ |
| Free-plan mark | — | ✗ (accepted) | ✓ |
| Export dialog preview | — | the same drawing as the browser export, at the export's size (was: the first video's raw file) | — |

## New and changed tests

| Test | What it checks |
|---|---|
| `tests/unit/frame-render.test.ts` | The shared renderer draws a crossfade half way, slides, wipes (clip), a slide-in text, typewriter letters, blend modes, and passes VFX and the star mask to the GPU look |
| `tests/unit/text-marks.test.ts` | Letters (Hindi graphemes); marks apply, cut, join, clear and remap when words change; `setClip`, caption cuts and `sanitizeDoc` keep them; layout pieces, wrapping across marks, lower third and breaking presets; every ready-made style (the Hindi ones too) is valid |
| `tests/unit/fonts.test.ts` | Font ids, CSS strings, Google stylesheet addresses (only styles a family has), the built font list (1,500+ families, 40+ Hindi), a timeline's font needs |
| `tests/unit/localExport.test.ts` | What goes to the server (`localExportBlockers`), the sound plan (mutes, ducking, crossfade levels, the single-video remove setting) |
| `tests/unit/editor-authz.test.ts` | 401 signed out, 404 for other people's files, kits, fonts, templates, jobs and versions; staff access; super-admin-only music folder; Documents folder off; SSRF addresses refused |
| `tests/integration/export-parity.test.ts` | Real FFmpeg: text wipe in its own area, blank-scene backdrop, VFX filters, star and diamond masks, typewriter grid crop, timeline sound kept, `asSingleVideo` with transitions, overlay reveals |
| `e2e/export-parity.spec.ts` | Real Chrome: a browser-made MP4 has the crossfade, the green element, the yellow bigger Hindi word in Mukta, and the text sliding in; the Export dialog's preview shows the element, the crossfade half way, and turns tall for Shorts |
| `tests/unit/export-doc.test.ts` | The timeline each format makes (background on black or see-through, a social size) — shared by the export and its preview |
| updated | `formats-templates`, `template-files`, `asset-deletion-decoupling`, `proxy-route`, `upload-copy-later` (owners and sign-in) |

Known failures not caused by this work: `tests/integration/pipeline.test.ts` (2 tests: key-color detection on a synthetic clip) fails the same way on the code before these changes.

## Accepted risks

- **The browser export has no Free-plan mark and no resolution limit** (E13). This was decided on 2026-10-24. Anything enforced in the browser can be bypassed anyway; the server export enforces both.
- **Export files are public by id** (`/api/files/<job>/<name>`), because the website embed codes link to them. Job ids are random UUIDs, and files are deleted after 24 hours.
- **Google Fonts load from Google's servers** when a project uses them, which passes the visitor's IP address to Google. To avoid this, self-host the fonts a project uses (backlog).
- **Files from before files had owners** stay open to anyone signed in.

## Backlog (not fixed in this pass)

- A Content-Security-Policy (the inline theme script and third-party scripts need nonces or hashes).
- Template clips uploaded in the template pane are copied into `public/templates/…`, so anyone can download them by URL.
- Per-person limits on the server's FFmpeg queue (there is only a global slot limit).
- `/api/import/search` and `/api/stock/search` use the server's Pexels / Pixabay keys for anyone: add sign-in or a rate limit.
- `typescript.ignoreBuildErrors: true` in `next.config.ts`, with 56 type errors left in older code.
- Streaming long browser exports into a picked file instead of memory (the code supports a file handle; the UI never passes one).
- Split `Studio.tsx` (P5) and batch caption inputs in compose (P6).
- Make the Share dialog real, or remove it (T11).

### Old type errors (unchanged)

`components/studio/Studio.tsx` (9), `lib/auth/AuthContext.tsx` (3), `lib/db/postgres.ts` (2), `lib/storage/*` (3), `lib/media/useLibrary.ts`, `lib/dataRoot.ts`, `components/studio/{TopBar,SearchPalette,Rail}.tsx`, `components/studio/mobile/sheets/MobileProjectSheet.tsx`, `app/api/payments/razorpay/create-order/route.ts`, `app/account/billing/page.tsx`, and 27 in older tests.
