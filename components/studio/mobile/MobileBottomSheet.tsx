"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export type SheetSnap = "compact" | "expanded";

export type MobileBottomSheetProps = {
  isOpen: boolean;
  title: string;
  icon?: IconName;
  snap?: SheetSnap;
  onSnapChange?: (snap: SheetSnap) => void;
  onClose: () => void;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function MobileBottomSheet({
  isOpen,
  title,
  icon,
  snap = "compact",
  onSnapChange,
  onClose,
  headerRight,
  children,
  className = "",
}: MobileBottomSheetProps) {
  const [startY, setStartY] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const toggleSnap = () => {
    if (onSnapChange) {
      onSnapChange(snap === "compact" ? "expanded" : "compact");
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startY === null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startY;
    setStartY(null);

    // Swipe down
    if (deltaY > 50) {
      if (snap === "expanded") {
        onSnapChange?.("compact");
      } else {
        onClose();
      }
    }
    // Swipe up
    else if (deltaY < -50) {
      if (snap === "compact") {
        onSnapChange?.("expanded");
      }
    }
  };

  const heightClass =
    snap === "compact"
      ? "h-[24vh] min-h-[160px] max-h-[220px]"
      : "h-[50vh] min-h-[320px] max-h-[440px]";

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={`${title} Options`}
      className={`relative z-30 flex flex-col w-full rounded-t-2xl border-t border-line/60 bg-surface/98 backdrop-blur-xl shadow-2xl transition-[height] duration-250 ease-out select-none animate-sheet-up ${heightClass} ${className}`}
    >
      {/* Drag handle pill */}
      <div
        className="flex w-full cursor-pointer flex-col items-center pt-2 pb-1 touch-none"
        onClick={toggleSnap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        title={snap === "compact" ? "Tap or drag up to expand" : "Tap or drag down to collapse"}
      >
        <span className="h-1.5 w-10 rounded-full bg-muted/40 hover:bg-muted transition-colors" />
      </div>

      {/* Sheet Header */}
      <div className="flex shrink-0 items-center justify-between px-3.5 pb-2 pt-0.5 border-b border-line/50">
        <div className="flex items-center gap-2">
          {icon && <Icon name={icon} className="size-4 text-primary" />}
          <h3 className="text-xs font-semibold tracking-wide text-ink">{title}</h3>
        </div>

        <div className="flex items-center gap-1.5">
          {headerRight}
          <button
            type="button"
            onClick={toggleSnap}
            className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink transition-colors"
            title={snap === "compact" ? "Expand sheet" : "Collapse sheet"}
            aria-label={snap === "compact" ? "Expand sheet" : "Collapse sheet"}
          >
            <Icon
              name={snap === "compact" ? "chevronUp" : "chevronDown"}
              className="size-3.5"
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink transition-colors"
            title="Close"
            aria-label="Close sheet"
          >
            <Icon name="close" className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Sheet Content with smooth tab crossfade */}
      <div key={title} className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 min-h-0 text-xs animate-in fade-in duration-200">
        {children}
      </div>
    </div>
  );
}
