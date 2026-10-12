import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), getCurrentUser: async () => auth.user }));

import { POST as upload } from "@/app/api/videos/route";
import { PUT as restore } from "@/app/api/videos/[id]/route";
import { POST as templateUpload } from "@/app/api/templates/upload/route";
import { POST as render } from "@/app/api/renders/route";

// viplay.in took uploads from anyone: a stranger could fill the server's disk, or (template media goes to
// public/) put files on the website
describe("routes that store files need a signed-in user", () => {
  it.each([
    ["upload", () => upload(new Request("http://x/api/videos", { method: "POST", body: "x", headers: { "content-type": "video/mp4" } }))],
    ["restore", () => restore(new Request("http://x", { method: "PUT", body: "x" }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) } as never)],
    ["template upload", () => templateUpload(new Request("http://x", { method: "POST", body: "x" }))],
    ["render", () => render(new Request("http://x", { method: "POST", body: "x" }))],
  ])("%s: 401 when signed out", async (_name, call) => {
    auth.user = null;
    const res = await call();
    expect(res.status).toBe(401);
  });
});
