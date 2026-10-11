import { expect, test as setup } from "@playwright/test";
const AUTH = "e2e/.auth/state.json";

// a test account in the test server's own database (VDO_DB_PATH=e2e/.auth/VDO.db), never yours
const USER = {
  email: "e2e@VDO.test",
  password: "e2e-pass-123",
  name: "E2E Tester",
};

setup("sign in the test user", async ({ request }) => {
  const up = await request.post("/api/auth/signup", { data: USER });
  if (up.status() === 409)
    expect((await request.post("/api/auth/login", { data: USER })).ok()).toBe(
      true,
    );
  else expect(up.ok(), await up.text()).toBe(true);
  await request.storageState({ path: AUTH });
});
