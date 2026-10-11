import { beforeAll, describe, expect, it, vi } from "vitest";

// the signup route sets a session cookie and sends a verification email: neither exists in a test
vi.mock("@/lib/auth/session", () => ({ setSessionCookie: async () => {}, getCurrentUser: async () => null }));
vi.mock("@/lib/auth/email", () => ({ sendVerificationEmail: async () => true, sendEmail: async () => true }));

import { cleanReferralCode, safeNextPath } from "@/lib/auth/redirect";
import { isFillerWord } from "@/lib/subtitles/fillers";
import { wordProgress } from "@/lib/text/render";
import { buildComposeArgs, type ComposeMedia, type TextSprite } from "@/lib/render/compose";
import { emptyDoc, type MediaLite, type TimelineDoc } from "@/lib/edit/doc";
import { addMedia, addText } from "@/lib/edit/docEdit";
import { textClipOf } from "@/lib/text/layout";
import { BROADCAST_TEMPLATES_BY_ID } from "@/lib/templates/newsTemplates";
import { SHOWCASE_TEMPLATES } from "@/components/website/sections/TemplatesShowcaseSection";
import { getOrCreateReferralCode } from "@/lib/referrals/codes";
import { getReferralByReferredUserId } from "@/lib/referrals/attribution";
import { getUserByEmail } from "@/lib/db/users";
import { makeUser } from "../admin-helpers";

describe("safe redirects after sign-in", () => {
  it.each(["/editor", "/editor?template=world-news-globe", "/admin/users?page=2"])("keeps the same-site path %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });
  it.each(["https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "editor", "", "/a\nb"])(
    "refuses %j",
    (p) => {
      expect(safeNextPath(p, "/fallback")).toBe("/fallback");
    }
  );
  it("referral codes: real codes pass, junk does not", () => {
    expect(cleanReferralCode("VDO-RAHU-1F2")).toBe("VDO-RAHU-1F2");
    expect(cleanReferralCode(" VDO-RAHU-1F2 ")).toBe("VDO-RAHU-1F2");
    expect(cleanReferralCode("<script>")).toBeNull();
    expect(cleanReferralCode("x")).toBeNull();
    expect(cleanReferralCode(null)).toBeNull();
  });
});

describe("email signup (the page used to call a route that does not exist)", () => {
  let POST: typeof import("@/app/api/auth/signup/route").POST;
  beforeAll(async () => {
    POST = (await import("@/app/api/auth/signup/route")).POST;
  });

  it("creates the account and credits the referrer from ?ref=", async () => {
    const referrer = makeUser("user");
    const code = getOrCreateReferralCode(referrer.id).code;
    const email = `new-${Date.now()}@test.local`;
    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.9.8.7" },
        body: JSON.stringify({ name: "New Creator", email, password: "Secret#123", referralCode: code }),
      })
    );
    expect(res.status).toBe(201);
    const created = getUserByEmail(email)!;
    expect(created).not.toBeNull();
    const referral = getReferralByReferredUserId(created.id);
    expect(referral?.referrer_id).toBe(referrer.id);
  });
});

describe("website template cards open real editor templates", () => {
  it("every card points at a template the editor knows", () => {
    for (const card of SHOWCASE_TEMPLATES) {
      expect(BROADCAST_TEMPLATES_BY_ID.has(card.editorTemplate), `${card.id} → ${card.editorTemplate}`).toBe(true);
    }
  });
});

describe("filler words", () => {
  it.each(["um", "Umm,", "uh", "uhh", "uhm", "er", "erm", "ah", "Hmm...", "mm"])("%s is a filler", (w) => {
    expect(isFillerWord(w)).toBe(true);
  });
  it.each(["like", "so", "actually", "basically", "umbrella", "her", "hum", "matlab"])("%s is a real word", (w) => {
    expect(isFillerWord(w)).toBe(false);
  });
});

describe("word-by-word captions in the export", () => {
  const V = "11111111-1111-4111-8111-111111111111";
  const media: ComposeMedia = { [V]: { path: "/v.mp4", hasAudio: true, width: 1280, height: 720 } };
  const vid: MediaLite = { id: V, kind: "video", fileName: "v.mp4", width: 1280, height: 720, fps: 30, duration: 6, hasAudio: true, suggestedKey: null, keyKind: null };
  const project = (): TimelineDoc => {
    let d: TimelineDoc = { ...emptyDoc(), canvas: { width: 1280, height: 720, fps: 30, background: "#000000" } };
    d = addMedia(d, vid, { id: "v1" }).doc;
    d = addText(d, { ...textClipOf("lowerThird"), text: "one two three four", duration: 2 }, 0.5, "cap").doc;
    return d;
  };
  const graph = (sp: TextSprite) =>
    buildComposeArgs(project(), media, "mp4", "/out.mp4", { progress: false, textOf: () => "/t.png", textSpriteOf: () => sp }).join(" ");

  it("highlights the words evenly through the clip, like the preview", () => {
    const g = graph({ frames: 4, chars: 0, box: { x: 10, y: 20, w: 300, h: 80 }, kind: "words" });
    expect(g).toContain("crop=w=300:h=80:x=0:y='min(3\\,floor(t/2*4))*80'");
    expect(g).toContain("pad=1280:720:10:20");
  });

  it("follows real word times when the caption has them", () => {
    const g = graph({ frames: 4, chars: 0, box: { x: 0, y: 0, w: 200, h: 50 }, kind: "words", times: [0, 0.4, 0.9, 1.5] });
    // (in brackets: the sum of "has this word started" is the row, then times the row height)
    expect(g).toContain("y='(gte(t\\,0.4)+gte(t\\,0.9)+gte(t\\,1.5))*50'");
  });

  it("wordProgress lands on the middle of each word's share", () => {
    for (let i = 0; i < 5; i++) expect(Math.floor(wordProgress(i, 5) * 5)).toBe(i);
  });
});
