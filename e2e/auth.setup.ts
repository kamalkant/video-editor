import { test as setup } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const AUTH = "e2e/.auth/state.json";
// the test server's own database (playwright.config: VDO_DB_PATH), never yours
const DB = "e2e/.auth/VDO.db";

// a test account in that database
const USER = { email: "e2e@vdo.test", name: "E2E Tester" };

/**
 * Signs the test user in once; every test starts signed in. Accounts are made on the accounts site now
 * (lib/apps), so there is no sign-up here: the user and a session are written into the test server's own
 * database, the way lib/db/users createUser and lib/db/sessions createSession write them.
 */
setup("sign in the test user", async ({ request, baseURL }) => {
  // (the test server is up: its database and tables exist)
  await request.get("/api/health");
  mkdirSync("e2e/.auth", { recursive: true });
  const db = new DatabaseSync(DB);
  const token = randomBytes(32).toString("hex");
  try {
    const now = Date.now();
    let user = db.prepare("SELECT id FROM users WHERE email = ?").get(USER.email) as { id: string } | undefined;
    if (!user) {
      user = { id: randomUUID() };
      db.prepare("INSERT INTO users (id, email, name, role, status, created_at, updated_at, email_verified) VALUES (?, ?, ?, 'user', 'active', ?, ?, ?)").run(user.id, USER.email, USER.name, now, now, now);
    }
    db.prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), user.id, token, now + 7 * 24 * 3600 * 1000, now);
    const host = new URL(baseURL ?? "http://127.0.0.1:3100").hostname;
    writeFileSync(AUTH, JSON.stringify({ cookies: [{ name: "viplay_session", value: token, domain: host, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] }));
  } finally {
    db.close();
  }
  // signed in: the session is known to the server
  const me = await request.get("/api/auth/me", { headers: { cookie: `viplay_session=${token}` } });
  if (!me.ok()) throw new Error(`The test session isn't accepted: ${me.status()} ${await me.text()}`);
});
