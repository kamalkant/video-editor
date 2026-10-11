"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

// One observer for the whole page: it adds .is-inview once (globals.css .site-reveal fades the block in).
// Browsers with scroll-driven animations (animation-timeline: view()) don't need it at all.
let observer: IntersectionObserver | null = null;
function observe(el: Element): () => void {
  if (typeof IntersectionObserver === "undefined") {
    el.classList.add("is-inview");
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-inview");
          observer?.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  observer.observe(el);
  return () => observer?.unobserve(el);
}

/** A block that eases in as it scrolls into view (stands still with "reduce motion"). No per-frame JavaScript. */
export function Reveal({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: ElementType }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? observe(ref.current) : undefined), []);
  return (
    <Tag ref={ref} className={`site-reveal ${className}`}>
      {children}
    </Tag>
  );
}

/** The feature modules' wrapper (kept for its callers): a Reveal. */
export function ScrollMotionCard({ children, className = "" }: { children: ReactNode; className?: string; depth?: number }) {
  return <Reveal className={className}>{children}</Reveal>;
}
