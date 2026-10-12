import { join, sep } from "node:path";

/**
 * Where the site keeps what must outlive a deploy: the database, uploads and caches.
 * VIPLAY_DATA_DIR if set; on Hostinger, where each deploy runs from a new …/hbuilds/versions/<id>/nodejs
 * folder (so anything kept inside it is gone after the next deploy), a viplay-data folder beside hbuilds;
 * else the project folder (a Mac or a VPS).
 */
export function dataRoot(cwd: string = /*turbopackIgnore: true*/ process.cwd(), env: { VIPLAY_DATA_DIR?: string } = process.env): string {
  if (env.VIPLAY_DATA_DIR) return env.VIPLAY_DATA_DIR;
  const at = cwd.indexOf(`${sep}hbuilds${sep}versions${sep}`);
  return at >= 0 ? join(cwd.slice(0, at), "viplay-data") : cwd;
}
