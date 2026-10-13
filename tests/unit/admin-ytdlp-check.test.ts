import { describe, expect, it, vi } from "vitest";
import type { SafeUser } from "@/lib/db/schema";

const auth = vi.hoisted(() => ({ user: null as SafeUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => auth.user }));

import { makeUser } from "../admin-helpers";
import { GET } from "@/app/api/admin/ytdlp-check/route";

describe("GET /api/admin/ytdlp-check", () => {
  it("is for admins only (it runs the downloader on the server)", async () => {
    auth.user = null;
    expect((await GET(new Request("http://x/api/admin/ytdlp-check"))).status).toBe(401);
    auth.user = makeUser("user");
    expect((await GET(new Request("http://x/api/admin/ytdlp-check"))).status).toBe(403);
  });
});
