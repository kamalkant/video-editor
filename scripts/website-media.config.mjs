// What scripts/website-media.mjs --build makes light copies of (sources in assets-source/website).
// key: the name the site uses (SITE_MEDIA[key]); start/length (s): a trim; poster (s): the poster frame.
// Chosen from the contact sheets (2026-10-11). Two demos are trimmed: the editing demo ends on an
// export dialog with garbled text, and the tracking demo's last seconds show another app's UI.
export const WEBSITE_MEDIA = [
  // product demos
  { key: "demoEditor", source: "Creating_video_editing_product_demo_20261011025631.mp4", length: 8.4, poster: 4.4, crf: 28 },
  { key: "demoTracking", source: "Motion_tracking_product_demo_video_20261011025631.mp4", length: 7, poster: 1.2, crf: 28 },

  // creator footage (use cases, templates, filmstrip)
  { key: "neonWalk", source: "make_video_20261011025631.mp4", poster: 1 },
  { key: "neonCar", source: "make_video_20261011025631_2.mp4", poster: 4.5 },
  { key: "silkFashion", source: "make_video_20261011025631_3.mp4", poster: 2.2 },
  { key: "surf", source: "make_video_20261011025631_4.mp4", poster: 1.2 },
  { key: "podcast", source: "make_video_20261011025631_5.mp4", poster: 3 },
  { key: "globe", source: "make_video_20261011025631_6.mp4", poster: 4 },
  { key: "cyberIntro", source: "make_video_20261011025631_7.mp4", poster: 0.6 },
  { key: "sportsLive", source: "make_video_20261011025631_8.mp4", poster: 4.5 },
  { key: "newsroom", source: "hero-newsroom.mp4" },
  { key: "podcastLoop", source: "hero-podcast.mp4" },
  { key: "reelsVertical", source: "vertical-reels.mp4" },
  // the 4 s loop the timeline preview module is timed to
  { key: "techGridLoop", source: "hero-tech-grid.mp4" },

  // AR / virtual set footage
  { key: "lakeAr", source: "hero-tech-grid_20261011025631.mp4", poster: 4.4 },
  { key: "holoJellyfish", source: "hero-tech-grid_20261011025631_2.mp4", poster: 2.2 },
  { key: "virtualStudio", source: "hero-tech-grid_20261011025631_3.mp4", poster: 5.6 },
  { key: "virtualPresenter", source: "hero-tech-grid_20261011025631_4.mp4", poster: 3.4 },
  { key: "hikerAr", source: "hero-tech-grid_20261011025631_5.mp4", poster: 4.6 },
  { key: "gridMountain", source: "hero-tech-grid_20261011025631_6.mp4", poster: 5.6 },

  // green screen + grading (cutout, compare modules)
  { key: "presenterGreen", source: "veo.mp4", poster: 2 },
  { key: "greenTake", source: "chroma-green-take.mp4" },
  // the same take with the green removed (made here with ffmpeg chromakey: a real before/after pair)
  { key: "greenKeyed", source: "chroma-green-take.mp4", keyed: true },
  { key: "officeKeyed", source: "chroma-keyed-alpha.mp4" },
  { key: "gradeRaw", source: "compare-raw-log.mp4" },
  // the same raw take, colour-graded here (the before/after in the compare module is one shot)
  { key: "gradeMaster", source: "compare-raw-log.mp4", graded: true },
  // a 10 s sports broadcast clip (the templates section's sports card)
  { key: "sportsGame", source: "compare-master-grade.mp4" },
];

// stills (sources in assets-source/website/images) → WebP in public/website/images
export const WEBSITE_STILLS = [
  // the transparent presenter laid over the overlay and share-anywhere demos (keeps its alpha)
  { key: "presenterAlpha", source: "vdo-chroma-model-alpha.png", maxWidth: 900, quality: 74 },
];
