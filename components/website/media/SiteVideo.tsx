"use client";

import { useRef } from "react";
import { preload } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { SITE_MEDIA, type SiteMediaKey } from "./manifest";
import { useSiteVideo } from "./useSiteVideo";

type Source = { src: string; poster?: string };

/**
 * A website video: muted, looping, inline, with a poster. It loads near the screen, plays while visible,
 * pauses offscreen, and waits for a click under "reduce motion" or Save-Data (see useSiteVideo).
 * Pass a `media` key from the generated manifest (public/website/videos/web), or a `src` + `poster`.
 *
 * It renders the <video> itself (fill its positioned parent with className), plus a play button when
 * it can't start on its own. `label` describes a meaningful video; without it the video is decorative.
 */
export function SiteVideo({
  media,
  src,
  poster,
  label,
  className = "absolute inset-0 h-full w-full object-cover",
  priority = false,
  paused = false,
  showPlayButton = true,
}: {
  media?: SiteMediaKey;
  label?: string;
  className?: string;
  /** above the fold (the hero): poster requested early, file loaded right away */
  priority?: boolean;
  /** held paused by the page (e.g. a play/pause button) */
  paused?: boolean;
  showPlayButton?: boolean;
} & Partial<Source>) {
  const ref = useRef<HTMLVideoElement>(null);
  const m = media ? SITE_MEDIA[media] : null;
  const file = m?.src ?? src ?? "";
  const still = m?.poster ?? poster;
  const { attach, near, mode, userStarted, start } = useSiteVideo(ref, { paused, eager: priority });
  if (priority && still) preload(still, { as: "image", fetchPriority: "high" });

  const waiting = mode === "manual" && !userStarted && !paused;
  return (
    <>
      <video
        ref={ref}
        className={className}
        src={attach ? file : undefined}
        poster={priority || near ? still : undefined}
        muted
        loop
        playsInline
        disableRemotePlayback
        preload={priority ? "metadata" : "none"}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        data-site-video={media ?? file}
      />
      {waiting && showPlayButton && (
        <button
          type="button"
          onClick={start}
          aria-label={label ? `Play preview: ${label}` : "Play preview"}
          className="absolute left-1/2 top-1/2 z-10 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-md transition hover:bg-black/70"
        >
          <Icon name="play" className="size-5 translate-x-px" />
        </button>
      )}
    </>
  );
}
