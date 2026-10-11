import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { makeUser } from "../admin-helpers";
import { entitlementsFor, exportBlocked } from "@/lib/billing/entitlements";
import { activateSubscription } from "@/lib/db/subscriptions";
import { getPlanBySlug } from "@/lib/db/plans";
import { buildComposeArgs, type ComposeMedia } from "@/lib/render/compose";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addBlank, addMedia } from "@/lib/edit/docEdit";

describe("plan limits", () => {
  it("Free: up to 1080p with the VDO logo; a paid plan: 4K, no logo; staff: no limits", () => {
    const free = makeUser();
    expect(entitlementsFor(free)).toMatchObject({ maxExportHeight: 1080, watermark: true });
    const pro = makeUser();
    activateSubscription({ userId: pro.id, planId: getPlanBySlug("monthly-pro")!.id });
    expect(entitlementsFor(pro)).toMatchObject({ maxExportHeight: 2160, watermark: false });
    expect(entitlementsFor(makeUser("admin")).watermark).toBe(false);
  });

  it("sizes compare by their short side (a 1080×1920 Short is Full HD)", () => {
    const free = { maxExportHeight: 1080, watermark: true, planName: "Free Tier" };
    expect(exportBlocked(free, 1080, 1920)).toBeNull();
    expect(exportBlocked(free, 1920, 1080)).toBeNull();
    expect(exportBlocked(free, 3840, 2160)).toMatch(/up to 1080p.*Upgrade/);
  });

  it("the logo mark is overlaid bottom-right in the export, only when asked", () => {
    const V = "11111111-1111-4111-8111-111111111111";
    const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
    const media: ComposeMedia = { [V]: { path: "/v.mp4", hasAudio: true, width: 1280, height: 720 } };
    const d = addMedia({ ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } }, vid, { id: "v1" }).doc;
    const plain = buildComposeArgs(d, media, "mp4", "/o.mp4", { progress: false }).join(" ");
    const marked = buildComposeArgs(d, media, "mp4", "/o.mp4", { progress: false, planMark: "/logo.png" }).join(" ");
    expect(plain).not.toContain("/logo.png");
    expect(marked).toContain("/logo.png");
    expect(marked).toContain("overlay=x=W-w-22:y=H-h-22");
  });
});

describe("export route", () => {
  const bigDoc = (): TimelineDoc => addBlank({ ...emptyDoc(), canvas: { width: 3840, height: 2160, fps: 30, background: "#000000" } }, 0).doc;
  const post = async (doc: TimelineDoc) => {
    const { POST } = await import("@/app/api/jobs/route");
    return POST(new Request("http://localhost/api/jobs", { method: "POST", body: JSON.stringify({ doc, format: "mp4" }) }));
  };

  it("needs a sign-in", async () => {
    auth.user = null;
    expect((await post(bigDoc())).status).toBe(401);
  });

  it("refuses a 4K export on the Free plan with an upgrade message", async () => {
    auth.user = makeUser();
    const res = await post(bigDoc());
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error.code).toBe("needs_upgrade");
  });
});
