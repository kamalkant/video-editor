import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

/**
 * Account pages are on the website (next.config.ts redirects them there). A Next <Link> to one prefetches
 * it with fetch(), the redirect makes that cross-origin and the browser blocks it (a CORS error in the
 * console): links to them are plain links to ACCOUNTS_URL.
 */
describe("links to the website's account pages", () => {
  it("no <Link> to a page that redirects to the website", () => {
    const dir = join(__dirname, "../../components");
    const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".tsx"));
    const bad = files.filter((f) =>
      /<Link\s+href=["'{`]+\/(account|admin|manage-devices|roadmap|forgot-password|reset-password|verify-email)\b/.test(
        readFileSync(join(dir, f), "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });
});

describe("the web app manifest", () => {
  it("each icon is the size it says (Chrome checks)", () => {
    for (const icon of manifest().icons ?? []) {
      const png = readFileSync(join(__dirname, "../../public", icon.src));
      // (a PNG's IHDR: width and height at bytes 16 and 20)
      const real = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      expect(icon.sizes?.split(" "), icon.src).toEqual([real]);
    }
  });
});
