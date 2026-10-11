"use client";

import { usePointerPosition } from "../usePointerPosition";

/**
 * The page's backdrop: soft iris / orchid / teal light and a faint grid that fades out, all CSS
 * (no image to download, no WebGL). It drifts a little with the pointer (not on touch or with "reduce motion").
 */
export function AtmosphericWebGlStage({ mousePos: given }: { scrollProgress?: number; mousePos?: { x: number; y: number } }) {
  const live = usePointerPosition();
  const mousePos = given ?? live;
  const x = Math.round(mousePos.x * 10);
  const y = Math.round(mousePos.y * 8);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden bg-site-bg">
      <div
        className="absolute -inset-10"
        style={{
          transform: `translate3d(${x}px, ${y}px, 0)`,
          transition: "transform 0.6s var(--site-ease)",
          background: `
            radial-gradient(60% 50% at 12% 0%, rgb(124 108 250 / 0.22) 0%, transparent 70%),
            radial-gradient(45% 40% at 92% 12%, rgb(45 212 191 / 0.12) 0%, transparent 70%),
            radial-gradient(50% 45% at 55% 100%, rgb(189 124 247 / 0.12) 0%, transparent 70%)
          `,
        }}
      />
      {/* a hairline grid, strongest near the top */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--site-line) 1px, transparent 1px), linear-gradient(to bottom, var(--site-line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, black 0%, transparent 75%)",
        }}
      />
      {/* a quiet fade at the bottom of the screen */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-site-bg to-transparent" />
    </div>
  );
}
