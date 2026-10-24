/**
 * Every feature of ViPlay Studio: what works today and what's coming.
 * One list for the whole app: the AI Tools panel, the "Soon" panels in the
 * rail and top menu, and the shareable /roadmap page all read it, so they
 * never disagree. Update the status here when a feature ships.
 */

export type Status = "ready" | "next" | "later";
export type Area = "edit" | "record" | "text" | "audio" | "background" | "ai" | "effects" | "transitions" | "elements" | "subtitles" | "brand" | "templates" | "export";

export type Feature = {
  id: string;
  name: string;
  detail: string;
  area: Area;
  status: Status;
  /** Needs a paid cloud AI service (API key), not only this Mac. */
  cloud?: boolean;
  /**
   * Usable, but not yet what its name promises: an honest line about what it does today.
   * Shown as a "Beta" badge in the AI panel, the Soon panels and /roadmap.
   */
  beta?: string;
};

export const AREAS: Record<Area, { label: string; blurb: string }> = {
  edit: { label: "Editing & timeline", blurb: "Cut, arrange and fine-tune clips on a multi-track timeline." },
  record: { label: "Record", blurb: "Record yourself, your screen or your voice straight onto the timeline." },
  text: { label: "Text & titles", blurb: "Titles, lower thirds, news bars and captions." },
  audio: { label: "Audio & voice", blurb: "Music, voiceover, sound clean-up and mixing." },
  background: { label: "Background", blurb: "Remove, blur or replace what's behind you." },
  ai: { label: "AI tools", blurb: "Smart helpers that do the slow work for you." },
  effects: { label: "Effects & color", blurb: "Looks, color and visual effects." },
  transitions: { label: "Transitions", blurb: "Smooth changes from one clip to the next." },
  elements: { label: "Elements", blurb: "Shapes, stickers and ready-made graphics." },
  subtitles: { label: "Subtitles & transcript", blurb: "Automatic subtitles and editing by text." },
  brand: { label: "Brand kit", blurb: "Your logo, colors and fonts everywhere." },
  templates: { label: "Templates", blurb: "Ready-made projects to start from." },
  export: { label: "Export & share", blurb: "Files for YouTube, social media and websites." },
};

const f = (area: Area, status: Status, id: string, name: string, detail: string, cloud = false, beta?: string): Feature => ({ id, name, detail, area, status, cloud, ...(beta ? { beta } : {}) });

export const FEATURES: Feature[] = [
  // ---------- ready now ----------
  f("edit", "ready", "timeline", "Multi-track timeline", "Video 1 (clips join up), overlay tracks for pictures, text and picture-in-picture, audio tracks."),
  f("edit", "ready", "trim", "Split, trim, cut, duplicate, copy and paste", "With snapping, undo / redo and keyboard shortcuts (S, Q, W, ⌘D, ⌘C / ⌘X / ⌘V, Delete)."),
  f("edit", "ready", "zoom", "Timeline zoom and scroll", "The scale stays put as clips are added; zoom, Fit, ⌘ + scroll."),
  f("edit", "ready", "theme", "Light and dark theme", "Dark (default), Light, or match your computer: the button before Export."),
  f("edit", "ready", "program", "Whole-timeline preview", "Plays every clip, overlay and sound together, exactly as it exports."),
  f("edit", "ready", "canvas", "Canvas sizes", "16:9, 9:16 (Reels / Shorts), 1:1 and 4:5, on a color or transparent background."),
  f("edit", "ready", "transform", "Move and resize on the preview", "Drag, resize from the corners (Shift: free), stretch from the sides, snap to the middle, nudge with the arrow keys."),
  f("edit", "ready", "transform-tools", "Skew, perspective, pivot and blend modes", "Skew and Perspective modes on the preview, a movable pivot, a corner-radius dot, the Transform panel (X / Y, W / H in px, scale X / Y, skew), blend modes like Screen and Multiply; width / height and skew can be animated with keyframes."),
  f("edit", "ready", "projects", "Projects and My Assets", "Everything saves automatically; reuse uploads in any project."),
  f("edit", "ready", "search", "Search tools (⌘K)", "Type what you want to do (a tool, a panel, a text style, a project, export) and press Enter."),
  f("edit", "ready", "versions", "Versions and switching projects", "Save a named version to come back to (restoring keeps what you had, ⌘Z undoes); the ▾ by the project name duplicates it or opens another project."),
  f("edit", "ready", "tasks", "Background tasks and focus mode", "One top-bar list of exports, AI work, copies, uploads and imports with their progress; focus mode (F) hides the side panels for a big preview."),
  f("record", "ready", "rec-camera", "Record camera", "3-2-1 countdown, pause, a read-along script (teleprompter)."),
  f("record", "ready", "rec-screen", "Record screen", "A screen, window or tab, with your voice and the computer's sound."),
  f("record", "ready", "rec-both", "Screen + camera", "Two clips: your screen and you in a movable box."),
  f("record", "ready", "rec-voice", "Record voiceover", "Straight onto an audio track at the playhead."),
  f("text", "ready", "titles", "Titles and lower thirds", "Title, lower third, breaking-news bar, caption and plain text; fonts, colors, boxes."),
  f("text", "ready", "text-anim", "Text and picture animations", "Fade, slide and rise, in and out."),
  f("text", "ready", "rich-text", "Style any letters", "Select a word or a few letters and give them their own size, color, font, bold, italic, a line under or through them, or a marker color."),
  f("text", "ready", "google-fonts", "1,900+ fonts, Hindi too", "The whole Google Fonts library, searchable by name and kind, with 60+ Hindi (Devanagari) fonts; your own fonts in the Brand Kit."),
  f("audio", "ready", "music", "Music and sound clips", "Volume, fades, mute and lock per track."),
  f("audio", "ready", "duck", "Quieter music under speech", "Automatic ducking in the exported video."),
  f("audio", "ready", "silences", "Remove silences", "Finds the pauses in speech and cuts them in one step."),
  f("audio", "ready", "tts", "Text to speech", "Type a script, pick a voice (Mac voices, free and offline, or ✦ Gemini voices in 130 languages with a style you describe), add it as a voiceover."),
  f("audio", "ready", "denoise", "Remove background noise", "Cleans hum, hiss and room noise from a clip's sound."),
  f("background", "ready", "green-screen", "Green / blue screen removal", "Finds the color by itself; spill and edge controls."),
  f("background", "ready", "black-bg", "Black background removal", "Fire, sparks and smoke shot on black."),
  f("background", "ready", "ai-remove", "AI background removal", "No green screen needed: people or the main object (Apple Vision, on this Mac)."),
  f("background", "ready", "blur-bg", "Blur background", "Keeps you sharp and softly blurs what's behind you."),
  f("ai", "ready", "watermark", "Watermark & logo remover", "Remove, blur or cover a logo, a face or a number plate: draw a box over it."),
  f("ai", "ready", "highlights", "Auto Highlights & Recap", "✦ Gemini detects top engaging moments, viral hooks, and extracts clips from transcript.", true),
  f("export", "ready", "mp4", "MP4 video (recommended)", "H.264 + AAC for YouTube, Instagram, WhatsApp and more. The default format."),
  f("export", "ready", "formats", "More export formats", "MP4 (HEVC, AV1), WebM (VP9), ProRes 422 HQ; see-through WebM (VP9 + alpha), MOV (HEVC + alpha), ProRes 4444; GIF; PNG / JPG of a frame; MP3, M4A, WAV."),
  f("export", "ready", "web-pack", "Transparent website video", "WebM for Chrome, HEVC MOV for Safari, poster, embed code and a test page."),
  f("export", "ready", "master", "ProRes master", "High-quality file for other editors."),

  // ---------- next (free, on this Mac) ----------
  f("edit", "ready", "crop", "Crop, rotate and flip", "Per clip, on the preview."),
  f("edit", "ready", "speed", "Speed, reverse and freeze frame", "Slow motion, fast forward (0.25× to 4×), play backwards, hold a frame."),
  f("edit", "ready", "keyframes", "Keyframes", "◆ at the playhead saves a clip's place, size, angle and opacity; it glides between keyframes (Ken Burns zoom, slides, fades)."),
  f("edit", "ready", "masks", "Shape masks", "Rounded corners, circle and the round camera bubble, with a soft edge and a ring."),
  f("edit", "ready", "custom-masks", "Custom masks", "Draw your own mask shape, star, diamond and polygon, and animate it."),
  f("edit", "ready", "multi-select", "Select many clips", "Move, duplicate or delete several clips at once; close all gaps."),
  f("edit", "ready", "detach-audio", "Detach audio", "Split a video's sound onto its own track."),
  f("edit", "ready", "markers", "Markers", "Mark moments on the timeline and jump between them."),
  f("transitions", "ready", "crossfade", "Crossfade and dissolve", "Soft blend from one clip to the next."),
  f("edit", "ready", "import", "Import from the web", "Add media → Import: search Pexels and Pixabay (free stock videos) and bring a clip onto the timeline."),
  f("ai", "ready", "ai-keys", "AI settings: your own API keys", "AI Tools → Settings: add, check, switch off or remove a key for Gemini (Grok and OpenAI keys can be saved; their features are coming). No key or off: those features stay off."),
  f("ai", "ready", "grok", "Grok pictures and videos", "Grok Imagine with your xAI key, next to Gemini.", false, "Grok pictures are real; Grok video is a preview placeholder for now."),
  f("transitions", "ready", "tr-none", "None (a plain cut)", "Take a transition off a cut, or off every cut on Video 1."),
  f("transitions", "ready", "slide", "Slide, push and wipe", "Directional moves between clips."),
  f("transitions", "ready", "zoom-tr", "Zoom and spin", "Energetic transitions for social media."),
  f("effects", "ready", "color", "Color correction", "Brightness, contrast, saturation, temperature."),
  f("effects", "ready", "looks", "Looks (filters)", "One-click vivid, warm, cool, cinematic, black & white, vintage, fade and night."),
  f("effects", "ready", "vignette", "Vignette", "Darker corners that pull the eye to the middle."),
  f("effects", "ready", "glow-grain", "Glow and film grain", "Finishing touches for a film feel."),
  f("effects", "ready", "fx-blur", "Blur and pixelate", "Hide faces, number plates or screens."),
  f("audio", "ready", "duck-preview", "Ducking you can hear in the preview", "Music goes quieter under speech while you edit, too."),
  f("audio", "ready", "loudness", "Loudness levelling", "One even volume for the whole video (EBU R128 standard)."),
  f("audio", "ready", "music-lib", "Music library", "Starter music beds made on this Mac, plus your own music folder, by mood."),
  f("audio", "ready", "sfx", "Sound effects", "Whooshes, clicks, pops, dings, applause and more."),
  f("subtitles", "ready", "auto-subs", "Auto subtitles", "✦ Gemini writes what is said, with times, in 20+ languages (Hinglish too); they land as normal text on their own track. Download .srt / .vtt.", true),
  f("subtitles", "ready", "subs-offline", "Subtitles offline", "Subtitles without sending sound to Google.", false, "Not real speech recognition yet: it places sample lines to style and time. Use ✦ Gemini subtitles for real words."),
  f("subtitles", "ready", "transcript", "Edit by transcript", "Delete words in the text to cut the video; remove “um” and “uh”."),
  f("subtitles", "ready", "styled-caps", "Styled captions", "Word-by-word highlight styles for Reels and Shorts (Bounce, Karaoke, Glow, Box)."),
  f("background", "ready", "replace-bg", "Replace background", "Put yourself in front of a picture, video or studio set."),
  f("background", "ready", "studio-sets", "Studio sets", "News desk, office, classroom and gradient backgrounds."),
  f("ai", "ready", "auto-color", "Auto color", "Fixes color and light by itself."),
  f("ai", "ready", "enhance", "Enhance quality", "Sharper picture: light sharpening, and Lanczos enlarging when you export bigger."),
  f("ai", "ready", "stabilize", "Stabilize video", "Removes camera shake."),
  f("ai", "ready", "video-denoise", "Remove video noise (grain)", "Cleaner dark, grainy footage.", false, "Opens Enhance (sharpening) for now; a real grain-removal filter for video is planned."),
  f("ai", "ready", "smart-crop", "Smart crop (auto reframe)", "Reframes a wide video for 9:16 Shorts / Reels, following the face it finds (runs in the browser)."),
  f("edit", "ready", "blank-scenes", "Blank scenes", "A plain color scene on Video 1 (like Google Vids): + at the end, then drag it anywhere; or right-click a clip. A title card, a pause, an end screen. Start a project with one."),
  f("elements", "ready", "shapes", "Shapes and lines", "Boxes, circles, stars, frames, numbered steps, lines, arrows, highlighters and dividers: your colors, outline and thickness."),
  f("elements", "ready", "stickers", "Stickers and emojis", "27 stickers drawn by the app (bursts, bubbles, tags, icons) and 400+ emoji with search."),
  f("elements", "ready", "graphics", "News graphics", "“LIVE”, “BREAKING” and “REC” badges, a progress bar that fills as the video plays, a scrolling ticker, and your logo in a corner."),
  f("brand", "ready", "logo", "Logo and watermark", "Your logo on every video: a corner, or drag it anywhere on the preview. Drop any picture on the preview to place it like a logo."),
  f("brand", "ready", "brand-colors", "Brand colors", "Your colors next to every text color picker."),
  f("brand", "ready", "fonts", "Your own fonts", "Upload your brand font."),
  f("brand", "ready", "intro-outro", "Intro and outro", "Saved opening and ending clips."),
  f("brand", "ready", "brand-kits", "Several brand kits", "One kit per client or channel, switched in one click."),
  f("templates", "ready", "tpl-news", "News templates", "News presenter, breaking news, live broadcast, headline card, interview, weather report."),
  f("templates", "ready", "tpl-youtube", "YouTube templates", "Intro, countdown intro, end screen, top 5 list, vlog title."),
  f("templates", "ready", "tpl-social", "Social media templates", "Shorts / Reels, Instagram post, quote card, story, sale offer, podcast clip."),
  f("templates", "ready", "tpl-business", "Business templates", "Company update, product launch, event invite, we're hiring, product demo, explainer."),
  f("templates", "ready", "tpl-more", "More templates", "Gaming, weather maps, and templates you save yourself."),
  f("export", "ready", "presets", "Export presets", "One click for YouTube 16:9, Shorts / Reels 9:16 and square."),
  f("export", "ready", "gif", "GIF export", "Short loops for chats and slides (up to 30 s, 15 fps, 640 px wide)."),
  f("export", "ready", "estimate", "Size estimate for every project", "Know the file size before you export."),
  f("export", "ready", "share", "Share link", "Send a preview link or a website embed.", false, "The share link works on this computer and network."),

  // ---------- Google Gemini AI Services ----------
  f("ai", "ready", "gen-video", "Generate video", "✦ Gemini Veo 3.1: a 4–8 second clip with sound from words, or starting from your picture. The price shows before you click.", true),
  f("ai", "ready", "gen-image", "Generate image", "✦ Gemini Flow: high-definition visual generation and prompt remix.", true),
  f("ai", "ready", "gen-bg", "Generate background", "✦ Gemini Flow: describe a 3D scene, newsroom or studio set.", true),
  f("ai", "ready", "text-to-video", "Text to video", "✦ Gemini + Veo: transform stories and scripts into cinematic video.", true),
  f("ai", "ready", "avatar", "AI avatar", "✦ Gemini: a presenter picture for your video.", true, "Makes a still picture of a presenter. Talking, moving avatars need a paid avatar service (planned)."),
  f("ai", "ready", "voice-clone", "Voice clone", "✦ Gemini voices with a speaking style you describe.", true, "Opens Text to speech with Gemini voices. Cloning your own voice is not available yet."),
  f("ai", "ready", "translate", "Translate audio (dubbing)", "✦ Gemini: hears the speech, translates it and speaks it in another language on a new track, with the original ducked underneath. Hindi ↔ English and 20+ languages.", true),
  f("ai", "ready", "remove-object", "Remove object", "Covers a logo or object with a blend of the pixels around it.", false, "A blur-style cover box you can move and resize, not AI inpainting. Best for small static logos."),
  f("ai", "ready", "extend", "Extend video", "✦ Gemini Veo: seamlessly extend scene duration with generative continuation.", true),
  f("ai", "ready", "upscale", "Upscale to HD / 4K", "A sharper, larger copy of the clip (1080p or 4K) made with high-quality Lanczos scaling and light sharpening on this computer."),
  f("ai", "ready", "gen-effects", "Generate effects", "✦ Gemini: a generated picture to use as an effect layer.", true, "Makes a still picture with Gemini; animated effects are not generated yet."),
  f("ai", "ready", "replace-sky", "Replace sky", "✦ Gemini: a generated sky or background picture.", true, "Generates a background picture; the sky in your video is not detected and swapped automatically yet."),
  f("ai", "ready", "b-roll", "Generate B-roll", "✦ Gemini: cutaway pictures that match what is said.", true, "Makes still pictures. Video B-roll comes from Generate video (Veo) or stock footage."),
  f("subtitles", "ready", "translate-subs", "Translate subtitles", "✦ Gemini: your subtitles in another language, on a track of their own.", true),
];

export const featureById = (id: string): Feature | undefined => FEATURES.find((x) => x.id === id);
export const featuresIn = (area: Area): Feature[] => FEATURES.filter((x) => x.area === area);
export const STATUS_LABEL: Record<Status, string> = { ready: "Ready now", next: "Coming next", later: "Later (cloud AI)" };
