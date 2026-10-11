"use client";

import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * A small tooltip for an icon button: it shows on hover and on keyboard focus (not after a click),
 * and screen readers hear it as the button's description.
 * `align`: which edge of the button the bubble lines up with (keeps it inside a narrow panel).
 * `side`: above (default) or below the button (for bars at the top of a clipped area).
 * `className`: for the wrapper (e.g. `w-full` so the button can fill a grid cell).
 * The bubble only exists on screen while shown, so it never makes a panel scroll sideways.
 * `off`: don't show it (e.g. while the button's menu is open).
 */
export function Tip({
  text,
  children,
  align = "center",
  side = "top",
  className = "",
  off = false,
}: {
  text: ReactNode;
  children: ReactElement<{ "aria-describedby"?: string }>;
  align?: "left" | "center" | "right";
  side?: "top" | "bottom";
  className?: string;
  off?: boolean;
}) {
  const id = useId();
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  const at = side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5";
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {cloneElement(children, { "aria-describedby": id })}
      <span id={id} role="tooltip" className={`pointer-events-none absolute z-50 hidden w-max max-w-56 rounded-md border border-control bg-surface px-2 py-1 text-[0.6875rem] leading-snug font-normal text-ink shadow-lg ${off ? "" : "group-hover/tip:block group-has-[:focus-visible]/tip:block"} ${at} ${pos}`}>
        {text}
      </span>
    </span>
  );
}
