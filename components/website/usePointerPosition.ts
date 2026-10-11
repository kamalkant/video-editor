"use client";

import { useEffect, useState } from "react";

/**
 * Where the mouse is over the window, −1…1 on each axis (for gentle parallax), at most once
 * per frame. Stays at the middle on touch screens and for people who prefer reduced motion.
 * Each component that moves with the mouse calls this itself, so the rest of the page
 * doesn't re-render on every mouse move.
 */
export function usePointerPosition(): { x: number; y: number } {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf: number | null = null;
    const onMove = (e: MouseEvent) => {
      if (raf !== null) return;
      const { clientX, clientY } = e;
      raf = requestAnimationFrame(() => {
        raf = null;
        const x = Math.round(((clientX / window.innerWidth) * 2 - 1) * 100) / 100;
        const y = Math.round(((clientY / window.innerHeight) * 2 - 1) * 100) / 100;
        setPos((p) => (p.x === x && p.y === y ? p : { x, y }));
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);
  return pos;
}
