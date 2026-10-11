/**
 * WebKit detection used by the embed snippet, the test page and the results
 * player. Safari (and every iPhone/iPad browser, which all use WebKit) shows
 * VP9 alpha as a solid box, so they get the HEVC + alpha MOV instead.
 * canPlayType can't be trusted here: Safari answers "probably" for VP9.
 */
export const DETECTION_JS = `(/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) || // Safari on Mac
      /iPad|iPhone|iPod/.test(ua) ||                                      // every iPhone/iPad browser
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)`;

export function isWebKitUA(
  ua: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  return (
    (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) ||
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}

export type SnippetOptions = {
  folder: string;
  webmName: string;
  movName: string;
  posterName?: string;
  width: number;
  height: number;
  withSound: boolean;
  /** Show a Pause/Play button (looping motion longer than 5 s should be pausable). Default on. */
  pauseButton?: boolean;
  /** Don't autoplay for visitors who set "reduce motion" in their system. Default on. */
  respectReducedMotion?: boolean;
};

export function normalizeFolder(folder: string): string {
  let f = folder.trim() || "/";
  f = f.replace(/["'<>\s]/g, "");
  if (!f.endsWith("/")) f += "/";
  return f;
}

export function buildEmbedSnippet(o: SnippetOptions): string {
  const folder = normalizeFolder(o.folder);
  const pause = o.pauseButton ?? true;
  const reduce = o.respectReducedMotion ?? true;
  const poster = o.posterName ? ` poster="${folder}${o.posterName}"` : "";
  const hasButtons = pause || o.withSound;
  const buttonCss = hasButtons
    ? `
  .VDO-avatar .VDO-controls {
    position: absolute;
    left: .5rem;
    bottom: .5rem;
    display: flex;
    gap: .5rem;
    pointer-events: auto;
  }
  .VDO-avatar .VDO-btn {
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0 .75rem;
    border: 0;
    border-radius: 999px;
    background: #1D4ED8;
    color: #FFFFFF;
    font: inherit;
    cursor: pointer;
  }`
    : "";
  const buttons = hasButtons
    ? `
  <div class="VDO-controls">${
    pause
      ? `
    <button type="button" id="VDO-pause" class="VDO-btn">Pause</button>`
      : ""
  }${
    o.withSound
      ? `
    <button type="button" id="VDO-sound" class="VDO-btn">Turn sound on</button>`
      : ""
  }
  </div>`
    : "";
  // with "reduce motion" respected, playback is started from the script instead of the autoplay attribute
  const autoplayAttr = reduce ? "" : " autoplay";
  const startJs = reduce
    ? `
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function start() {
      const p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: the poster stays visible */ });
    }
    if (!still) start();`
    : `
    function start() {
      const p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: the poster stays visible */ });
    }
    start();`;
  const pauseJs = pause
    ? `
    const pauseBtn = document.getElementById("VDO-pause");
    function label() { pauseBtn.textContent = video.paused ? "Play" : "Pause"; }
    pauseBtn.addEventListener("click", function () { if (video.paused) start(); else video.pause(); });
    video.addEventListener("play", label);
    video.addEventListener("pause", label);
    label();`
    : "";
  const soundJs = o.withSound
    ? `
    const sound = document.getElementById("VDO-sound");
    sound.addEventListener("click", function () {
      video.muted = !video.muted;
      if (!video.muted) { video.currentTime = 0; start(); }
      sound.textContent = video.muted ? "Turn sound on" : "Turn sound off";
    });`
    : "";
  return `<!-- Transparent avatar (made with ViPlay Studio) -->
<style>
  .VDO-avatar {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 1000;
    width: min(18rem, 40vw);
    pointer-events: none;
  }
  .VDO-avatar video {
    display: block;
    width: 100%;
    height: auto;
    background: transparent;
  }${buttonCss}
</style>

<div class="VDO-avatar">
  <video id="VDO-avatar"${autoplayAttr} muted loop playsinline width="${o.width}" height="${o.height}"${poster}></video>${buttons}
</div>

<script>
  (function () {
    const ua = navigator.userAgent;
    const isWebKit =
      ${DETECTION_JS};
    const video = document.getElementById("VDO-avatar");
    video.src = isWebKit ? "${folder}${o.movName}" : "${folder}${o.webmName}";${startJs}${pauseJs}${soundJs}
  })();
</script>`;
}
