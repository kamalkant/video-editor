"use client";
import { useEffect } from "react";
import { startUsage } from "@/lib/usage/wire";

/** Starts ViPlay usage counting for this tab (nothing is shown). */
export function UsageBeacon() {
  useEffect(() => startUsage(), []);
  return null;
}
