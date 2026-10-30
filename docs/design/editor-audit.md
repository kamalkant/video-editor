# Editor design audit (Oct 2026)

The published version, with screenshots: https://claude.ai/artifact/KVjpgpuv84VgqefHzxS9LL

## How other editors are laid out
Clipchamp, Google Vids, Descript, CapCut, Canva, Kapwing and VEED share one structure:
- **Left:** add things (media, text, audio, elements, templates).
- **Middle:** the preview.
- **Right:** settings for whatever is selected (the project when nothing is).
- **Bottom:** the timeline.

What they do with clip actions and panels:
- Clip actions appear only while a clip is selected: Clipchamp's floating toolbar over the preview, Canva's contextual toolbar.
- Panels and the timeline collapse and resize; Clipchamp's splitters show a grip on hover.
- Dark UIs separate surfaces by two or three tones instead of borders.

## Findings
1. **Critical — every tool is visible all the time:**
   - 14 rail items (`Rail.tsx:28`), about 20 top-bar controls (`TopBar.tsx`), 17 icons in the timeline toolbar (`Timeline.tsx:2271`).
   - The Edit panel repeats 12 timeline actions.
   - "Coming soon" blocks sit under real panels.
2. **Critical — settings open in many places:**
   - Background removal has 6+ entry points; Speed, Smart Mix, crop, stabilise, denoise and auto-colour have 2–4 each.
   - AI Tools and Smart Mix replace the inspector; Templates replaces the workspace.
   - There are two inspector code paths.
   - The clip context menu has no settings entry.
3. **High — colour:**
   - Flat navy palette.
   - 1,245 hard-coded palette classes, 267 `text-white`, 135 inline hex values, 11 `dark:` variants.
   - AI dialogs are always dark (`GoogleAiModal`).
   - Undefined tokens are in use (`surface-raised`, `ink-muted`, `muted-strong`).
4. **High — borders everywhere:**
   - Bordered panels and nested bordered cards.
   - 285 shadows, five interchangeable radius sizes.
   - Visible splitter bars.
5. **Medium — no type scale:**
   - 500 one-off font sizes in 75 files.
   - Labels down to 7–9px.
   - The editor uses the system font although Inter is bundled.
6. **Medium — mixed components:**
   - Three dialog styles.
   - About 583 raw buttons against 142 `.btn` uses; six hand-built tab bars.
   - About 137 emoji used as icons.

## Plan
1. **Design system:**
   - New dark and light tokens: three surface tones, violet-blue primary, cyan AI accent, contrast checked.
   - Borderless panels, one radius scale, type scale 11–14px with Inter.
   - Hard-coded colours moved to tokens; one dialog look; SVG icons instead of emoji.
2. **Layout:**
   - Clipchamp-style splitters (grip on hover).
   - Collapsible left panel, right panel and timeline.
   - A quieter top bar; about 8 rail categories.
3. **Contextual tools:**
   - The right panel shows only the selection's settings.
   - A floating toolbar over the preview while a clip is selected.
   - "Clip settings…" on right-click.
   - AI tools that change a clip open its tab.
4. **Later:** timeline polish, empty states, phone layout, motion.
