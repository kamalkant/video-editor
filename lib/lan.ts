import "server-only";
import { networkInterfaces } from "node:os";

/** First private IPv4 address, for opening the test page on a phone on the same Wi-Fi. */
export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return null;
}
