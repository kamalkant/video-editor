import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyDoc } from "@/lib/edit/doc";

// Mock getCurrentUser from session module
const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

describe("/api/projects Route Handlers & Multi-Tenant Scoping", () => {
  let root: string;
  let getProjects: typeof import("@/app/api/projects/route").GET;
  let postProjects: typeof import("@/app/api/projects/route").POST;
  let getById: typeof import("@/app/api/projects/[id]/route").GET;
  let putById: typeof import("@/app/api/projects/[id]/route").PUT;
  let deleteById: typeof import("@/app/api/projects/[id]/route").DELETE;

  const userA = {
    id: "user-alpha-1111",
    email: "alpha@VDO.com",
    name: "User Alpha",
    role: "user" as const,
    status: "active" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    last_login_at: Date.now(),
  };

  const userB = {
    id: "user-beta-2222",
    email: "beta@VDO.com",
    name: "User Beta",
    role: "user" as const,
    status: "active" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    last_login_at: Date.now(),
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "VDO-api-routes-test-"));
    process.env.VDO_STORAGE = root;

    const listModule = await import("@/app/api/projects/route");
    getProjects = listModule.GET;
    postProjects = listModule.POST;

    const idModule = await import("@/app/api/projects/[id]/route");
    getById = idModule.GET;
    putById = idModule.PUT;
    deleteById = idModule.DELETE;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns 401 Unauthorized for unauthenticated requests", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const getRes = await getProjects();
    expect(getRes.status).toBe(401);
    const getBody = await getRes.json();
    expect(getBody.error.code).toBe("unauthorized");

    const postReq = new Request("http://localhost:3000/api/projects", {
      method: "POST",
      body: JSON.stringify({ doc: emptyDoc() }),
    });
    const postRes = await postProjects(postReq);
    expect(postRes.status).toBe(401);
  });

  it("isolates project creation and listing between User A and User B", async () => {
    // 1. User A creates project
    mockGetCurrentUser.mockResolvedValue(userA);
    const pIdA = "11111111-aaaa-4111-8111-111111111111";

    const createReqA = new Request("http://localhost:3000/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pIdA,
        name: "Project Alpha",
        doc: emptyDoc(),
      }),
    });
    const createResA = await postProjects(createReqA);
    expect(createResA.status).toBe(201);
    const projA = await createResA.json();
    expect(projA.id).toBe(pIdA);
    expect(projA.name).toBe("Project Alpha");

    // 2. User A lists projects -> contains Project Alpha
    const listResA = await getProjects();
    expect(listResA.status).toBe(200);
    const listBodyA = await listResA.json();
    expect(listBodyA.projects.some((p: { id: string }) => p.id === pIdA)).toBe(
      true,
    );

    // 3. User B lists projects -> does NOT contain Project Alpha
    mockGetCurrentUser.mockResolvedValue(userB);
    const listResB = await getProjects();
    expect(listResB.status).toBe(200);
    const listBodyB = await listResB.json();
    expect(listBodyB.projects.some((p: { id: string }) => p.id === pIdA)).toBe(
      false,
    );

    // 4. User B tries to get Project Alpha by ID -> 404
    const getAlphaByB = await getById(
      new Request(`http://localhost:3000/api/projects/${pIdA}`),
      { params: Promise.resolve({ id: pIdA }) } as never,
    );
    expect(getAlphaByB.status).toBe(404);

    // 5. User B tries to update Project Alpha -> 404
    const putAlphaByB = await putById(
      new Request(`http://localhost:3000/api/projects/${pIdA}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacked by B" }),
      }),
      { params: Promise.resolve({ id: pIdA }) } as never,
    );
    expect(putAlphaByB.status).toBe(404);

    // 6. User B tries to delete Project Alpha -> 404
    const delAlphaByB = await deleteById(
      new Request(`http://localhost:3000/api/projects/${pIdA}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: pIdA }) } as never,
    );
    expect(delAlphaByB.status).toBe(404);

    // 7. Verify User A still owns Project Alpha unchanged
    mockGetCurrentUser.mockResolvedValue(userA);
    const getAlphaByA = await getById(
      new Request(`http://localhost:3000/api/projects/${pIdA}`),
      { params: Promise.resolve({ id: pIdA }) } as never,
    );
    expect(getAlphaByA.status).toBe(200);
    const alphaBody = await getAlphaByA.json();
    expect(alphaBody.name).toBe("Project Alpha");
  });
});
