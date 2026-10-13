# ViPlay Studio

A browser-based video editor for creators: a multi-track timeline, word-by-word captions (21 languages including Hindi and Hinglish), editing by transcript, dubbing, smart audio, social-size exports and transparent web avatars (WebM VP9 alpha + MOV HEVC alpha + embed code). Includes accounts, ₹ plans with Razorpay, a referral program and an admin panel.

Product overview and capability reference: [VDO_STUDIO_PRESENTATION.md](VDO_STUDIO_PRESENTATION.md). Admin audit and test matrix: [ADMIN_AUDIT.md](ADMIN_AUDIT.md).

## Requirements

- **Node.js 24+** (uses the built-in `node:sqlite`).
- **FFmpeg 7+** with libx264, libvpx (VP9) and libopus; FFmpeg 9 is what the project is developed with.
- **macOS for some features:** the HEVC-alpha MOV and fast HEVC (Apple VideoToolbox), the Mac voices for text to speech (`say`), and AI background removal (Apple Vision). Everything else runs on any FFmpeg host.

```bash
brew install ffmpeg            # macOS; VideoToolbox is built in
npm install
cp .env.example .env.local     # then fill in what you need (see below)
npm run dev                    # http://127.0.0.1:3000
```

## Configuration (`.env.local`)

| Variable | What for |
|---|---|
| `NEXT_PUBLIC_APP_URL` | The public address (OAuth callbacks, email links) |
| `DATABASE_URL` | Optional PostgreSQL; without it, SQLite at `data/VDO.db` |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | The first super admin, created on first start. **Set these:** otherwise the default `admin@VDO.local` / `Admin@12345` is created, so change it right away |
| `GEMINI_API_KEY` | ✦ AI features (subtitles, translation, dubbing, voices, generation) |
| `XAI_API_KEY` | Optional Grok pictures |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google" |
| `RESEND_API_KEY` or `SMTP_*` | Verification and password emails (without them, emails print to the console) |
| `TWILIO_*` | Phone sign-in by SMS |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payments (sandbox mode is used until they are set) |

Never commit real keys: `.env.example` must only hold placeholders.

## Scripts

```bash
npm test            # Vitest: unit + integration (real FFmpeg encodes); uses a temporary database
npm run typecheck   # tsc --noEmit (next.config.ts skips type errors in builds, so run this)
npm run lint
npm run e2e         # Playwright: Chromium + WebKit
npm run build && npm start
```

### Media (images and videos)

- **Website:** `public/website/` holds only `images/` (WebP) and `videos/` (MP4, no sound). These are light copies made from the full-quality sources in `assets-source/website/` (not deployed). To add or change one, edit `scripts/website-media.config.mjs`, then:

  ```bash
  node scripts/website-media.mjs --survey   # contact sheets in .media-review/ to see what each clip shows
  node scripts/website-media.mjs --build    # public/website/{images,videos} + components/website/media/manifest.ts
  ```

  Components use `<SiteVideo media="key" />` and `SITE_IMAGES` (never a typed path; a test checks). Videos load near the screen, pause offscreen, and don't start by themselves for visitors who prefer reduced motion or save data.
- **Editor media** (`public/templates`): `node scripts/compress-public-media.mjs` recompresses them in place (same names and sizes, sound kept); the originals are kept in `assets-source/originals/`.

Needs `ffmpeg`, `ffprobe`, `cwebp` and (for JPEGs) macOS `sips`.

## Roles

`user`, `admin` and `super_admin`. Admins manage regular users, coupons, bulk jobs, targeted campaigns and payout approvals. Super admins also handle refunds, payout disbursement, plan pricing, all-user broadcasts, roles, user deletion and settings. See the admin section of the presentation.

## Project map

- `app/`: pages (`/` website, `/editor`, `/admin`, `/account`, auth) and the API (`app/api/*`)
- `components/studio`: the editor UI; `components/website`: the marketing site
- `lib/edit`: the timeline document and editing operations; `lib/render/compose.ts`: the FFmpeg export graph
- `lib/ai`: Gemini, Veo and Grok; `lib/subtitles`, `lib/audio`, `lib/tracking`
- `lib/db`, `lib/auth`, `lib/payments`, `lib/referrals`, `lib/notifications`: accounts, billing and admin
- `lib/roadmap.ts`: every feature and its status (Ready / Beta / Soon), shown in the app and at `/roadmap`
