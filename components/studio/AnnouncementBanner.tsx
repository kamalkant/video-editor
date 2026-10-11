"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";

const KEY = "vdo-announcement-closed";

const closedId = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: just show it
  }
};
const noSubscribe = () => () => {};

/** The admin's note (maintenance, new features…) over the editor, until the user closes it. */
export function AnnouncementBanner({ id, message, tone }: { id: string; message: string; tone: "info" | "warning" }) {
  // (on the server, and until we know it wasn't closed before, it stays hidden: no flash on reload)
  const closedBefore = useSyncExternalStore(noSubscribe, closedId, () => id);
  const [closedNow, setClosedNow] = useState(false);
  if (closedNow || closedBefore === id) return null;

  const close = () => {
    setClosedNow(true);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // (it comes back next time)
    }
  };
  const warning = tone === "warning";
  return (
    <div
      role={warning ? "alert" : "status"}
      className={`fixed bottom-4 left-1/2 z-[60] flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl ${
        warning ? "border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50" : "border-line bg-surface text-ink"
      }`}
    >
      <Icon name={warning ? "alert" : "info"} className={`mt-0.5 size-4 shrink-0 ${warning ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} />
      <p className="min-w-0 flex-1 whitespace-pre-line break-words">{message}</p>
      <button type="button" onClick={close} aria-label="Close this message" className="-m-1 rounded-md p-1 opacity-70 hover:opacity-100">
        <Icon name="close" className="size-4" />
      </button>
    </div>
  );
}
