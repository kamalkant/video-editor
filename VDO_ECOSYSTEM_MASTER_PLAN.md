# VDO Ecosystem — Master Architecture & Product Strategy Specification

> **The Unified Vision for the VDO Video Product Suite: Separating Concerns into a Standalone Player, a Professional NLE Editor, and an Award-Winning 3D Scroll Marketing Experience.**

---

## 🏛️ 1. The VDO Ecosystem Overview

```text
VDO Ecosystem
│
├── vdo-player/              ← Main Standalone Product
│   ├── Video Player (Clean Cinema & Viewer Mode)
│   ├── Alpha Playback (WebM VP9 & Apple HEVC Alpha)
│   ├── 4K UHD & High-Bitrate Smooth Streaming
│   ├── Frame-Accurate Scrubbing Timeline
│   ├── AI Video Review & Clip Inspector
│   └── Universal HTML5 / iFrame Web Embed Generator
│
├── vdo-editor/              ← Full-Featured NLE Video Studio
│   ├── Multi-Track Timeline (Video, Audio, Overlay, Text, Elements)
│   ├── Google Vids-Style Starting Clip Trimming & Thumbnail Scrub
│   ├── Smart Audio Mix / Automatic Dialogue Ducking (3 Modes)
│   ├── Duration-Bounded AI Motion Tracking & Perspective Warping
│   ├── Bidirectional Detach ⇄ Attach Audio Toggle
│   ├── Broadcast News Graphics & 4K Camera HUD Overlays
│   └── 100% Local-First Apple VideoToolbox Hardware Export Engine
│
└── vdo-website/             ← 3D Scroll Marketing & Conversion Experience
    ├── Cinematic 3D Floating Player Hero
    ├── WebGL Shaders & Smooth Momentum Scroll
    ├── 15-Chapter Interactive Product Storytelling
    ├── Live In-Browser Interactive Player Lab
    ├── High-Converting Free Forever & Early Pro Creator Offers
    └── Seamless Conversion CTAs → VDO Player & VDO Editor
```

---

## 🎯 2. Product Separation of Concerns

| Product Layer | Core Target Audience | Primary Focus | Technology Highlights |
| :--- | :--- | :--- | :--- |
| **`vdo-player`** | Web Developers, Agencies, Clients, Viewers | High-performance playback, transparent alpha rendering, review comments, and lightweight web embedding. | Zero-overhead HTML5/WebGL `<video>`, Dual-Stream WebM/MOV, Frame-accurate timecodes, Review Drawer. |
| **`vdo-editor`** | Content Creators, Video Editors, Marketers, Podcasters | Deep non-linear multi-track editing, AI generation, audio ducking, motion tracking, and color grading. | React 19, Zod Document State Reducer, SQLite `vido.db`, Apple VideoToolbox hardware encoder. |
| **`vdo-website`** | Prospective Users, Leads, Explorers | Visual storytelling, product discovery, "Awwwards-style" engagement, and friction-free user onboarding. | Native WebGL 2.0 3D Canvas, GSAP ScrollTrigger, CSS 3D Matrix Transforms, Interactive Player Lab. |

---

## 📊 3. Feature Breakdown Matrix & User Impact

| Section / Capability | Feature Highlights | User Impact & Value Proposition |
| :--- | :--- | :--- |
| **Alpha / Transparent Playback** | Native playback of WebM VP9 Alpha and Apple HEVC Alpha (`hvc1`) with checkerboard/custom backdrop toggles. | Web designers and marketers can embed floating human avatars without ugly black rectangular video boxes or green halos. |
| **Dual Player Modes (Viewer vs Review)** | One-click toggle between minimalist cinema mode and frame-accurate review mode with timestamped AI notes. | Clients and creative teams can review video cuts frame-by-frame with zero clutter. |
| **Smart Audio Ducking (3 Modes)** | Automatic FFmpeg `silencedetect` speech analysis with *Intelligent Both* (85%/60%), *Voiceover First*, and *Video First*. | Creators save hours of tedious manual audio keyframing; dialogue and voiceovers stay crystal clear. |
| **Duration-Bounded Motion Tracking** | MediaPipe CV tracker with custom in/out boundaries and homography perspective/skew warping. | Eliminates tracking drift and compute waste; titles and graphics realistically tilt with moving objects. |
| **Google Vids-Style Precision Trimming** | Left trim handle shifts timeline to 0:00 with real-time live thumbnail filmstrip streaming. | Fast, intuitive cutting without accidental timeline gaps or guessing cut frames. |
| **Bidirectional Detach/Attach Audio** | 1-click detach audio to dedicated track; 1-click re-attach back into video with auto track cleanup. | Total audio flexibility without the risk of accidentally de-syncing or losing audio-video pairings. |
| **Interactive Live Player Lab** | In-browser working player on the marketing site allowing live alpha, aspect ratio, and speed toggles. | "Test drive before you install" drives 3x higher conversion rates than static screenshots. |
| **100% Local-First Privacy Shield** | Raw footage stays on the local SSD using browser File System Access API; Apple VideoToolbox 10x export speed. | Zero cloud upload wait times, zero risk of corporate data leakage on confidential NDA video assets. |

---

## 🚀 4. Route Architecture & Backward Compatibility

- **`/` (`vdo-website`)**: The marketing landing page with 3D scroll storytelling and interactive player demo.
- **`/player` (`vdo-player`)**: The dedicated standalone dual-mode video player.
- **`/editor` (`vdo-editor`)**: The full-featured multi-track video editing studio.
- **Backward Compatibility Engine**:
  ```ts
  // In app/page.tsx:
  if (searchParams.p || searchParams.v || searchParams.job) {
    redirect(`/editor?${currentQueryString}`);
  }
  ```
  Every existing project link (`/?p=<projectId>`) immediately and transparently resolves to `/editor?p=<projectId>`. Zero broken bookmarks.

---

_Authored for the VDO Ecosystem · High-Performance Web Video Engineering._
