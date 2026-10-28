"use client";

import { useEffect, useRef, useState } from "react";
import { etaSeconds, etaText, type EtaSample } from "./eta";

/** "about 2 min left" while an export runs (`key`: the export, so a new one starts measuring afresh). */
export function useEta(running: boolean, pct: number, key: string | null): string {
  const pctRef = useRef(pct);
  useEffect(() => {
    pctRef.current = pct;
  });
  const [text, setText] = useState("");
  useEffect(() => {
    if (!running) return;
    const samples: EtaSample[] = [];
    const tick = () => {
      samples.push({ t: Date.now(), pct: pctRef.current });
      if (samples.length > 200) samples.splice(0, 100);
      setText(etaText(etaSeconds(samples)));
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running, key]);
  return running ? text : "";
}
