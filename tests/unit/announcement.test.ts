import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { jsonRequest, makeUser } from "../admin-helpers";
import { POST as saveSettings } from "@/app/api/admin/settings/route";
import { getAnnouncement } from "@/lib/announcement";

const save = (body: object) => saveSettings(jsonRequest("/api/admin/settings", "POST", body));

describe("editor announcement", () => {
  it("super admins set it; the id changes with the text; empty means none", async () => {
    auth.user = makeUser("super_admin");
    expect((await save({ announcement_message: "  Exports pause at 11 pm.  ", announcement_tone: "warning" })).status).toBe(200);
    const a = getAnnouncement()!;
    expect(a).toMatchObject({ message: "Exports pause at 11 pm.", tone: "warning" });
    await save({ announcement_message: "New: AI dubbing" });
    const b = getAnnouncement()!;
    expect(b.id).not.toBe(a.id);
    await save({ announcement_message: "" });
    expect(getAnnouncement()).toBeNull();
  });

  it("plain admins can't change it; too long or an unknown style is refused", async () => {
    auth.user = makeUser("admin");
    expect((await save({ announcement_message: "hi" })).status).toBe(403);
    auth.user = makeUser("super_admin");
    expect((await save({ announcement_message: "x".repeat(301) })).status).toBe(400);
    expect((await save({ announcement_tone: "party" })).status).toBe(400);
  });
});
