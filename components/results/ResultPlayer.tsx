"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { isWebKitUA } from "@/lib/embed/snippet";

const noop = () => () => {};

/** Plays the result the same way the embed code does, and says which file this browser uses. */
export function ResultPlayer({ webmUrl, movUrl, posterUrl, width, height }: { webmUrl: string; movUrl: string; posterUrl?: string; width: number; height: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const usingMov = useSyncExternalStore(
    noop,
    () => isWebKitUA(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    () => null,
  );
  const [bg, setBg] = useState<"checker" | "white" | "dark">("checker");
  useEffect(() => {
    const v = ref.current;
    if (!v || usingMov === null) return;
    v.muted = true; // React doesn't always write the muted attribute; iOS needs it for autoplay
    v.src = usingMov ? movUrl : webmUrl;
    v.play().catch(() => undefined);
  }, [movUrl, webmUrl, usingMov]);
  const bgClass = bg === "checker" ? "bg-checker" : bg === "white" ? "bg-white" : "bg-black";
  return (
    <div className="flex flex-col gap-2">
      <div className={`rounded-lg border border-control p-3 ${bgClass}`}>
        <video ref={ref} className="mx-auto block h-auto max-h-[50vh] w-full object-contain" width={width} height={height} poster={posterUrl} autoPlay muted loop playsInline aria-label="Your transparent avatar video" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          This browser is using: <strong>{usingMov === null ? "…" : usingMov ? "Safari file (.mov)" : "Chrome file (.webm)"}</strong>
        </p>
        <SegmentedControl legend="Background" legendHidden name="rbg" value={bg} onChange={setBg} options={[{ value: "checker", label: "Checker" }, { value: "white", label: "White" }, { value: "dark", label: "Dark" }]} />
      </div>
    </div>
  );
}
