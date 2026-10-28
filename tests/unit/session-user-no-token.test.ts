import { describe, expect, it } from "vitest";
import { createUser } from "@/lib/db/users";
import { createSession, getSessionWithUser } from "@/lib/db/sessions";

/**
 * The signed-in user is sent to the browser as it is (GET /api/auth/me, which every *.viplay.in app may
 * read): it must never carry the session's secret token, or a script on any of those pages could take the
 * session that the HttpOnly cookie keeps from it.
 */
describe("the session's user", () => {
  it("has the user's fields and none of the session's", () => {
    const u = createUser({ email: `no-token-${Date.now()}@test.local`, name: "No Token", password: "pass-12345", emailVerified: true });
    const s = createSession(u.id);
    const auth = getSessionWithUser(s.token)!;
    expect(auth.session.token).toBe(s.token);
    expect(auth.user.id).toBe(u.id);
    expect(auth.user.email).toBe(u.email);
    const keys = Object.keys(auth.user);
    for (const k of ["token", "session_id", "user_id", "expires_at", "session_created_at", "password_hash", "password_salt"]) expect(keys).not.toContain(k);
    expect(JSON.stringify(auth.user)).not.toContain(s.token);
  });
});
