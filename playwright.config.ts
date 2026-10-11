import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// the test server's own sign-in database and the signed-in state (kept between runs; never yours)
const AUTH = "e2e/.auth/state.json";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    // its own build folder and storage: test uploads and projects never mix with yours
    command: `NEXT_DIST_DIR=.next-e2e VDO_STORAGE=e2e/.storage VDO_DB_PATH=e2e/.auth/VDO.db GEMINI_FAKE=1 IMPORT_FAKE=1 npx next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    // signs in a test user (in the test server's own database) once; every test starts signed in
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH,
        // a fake camera, microphone and screen for the Record tests (no real devices, no prompts)
        permissions: ["camera", "microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--auto-select-desktop-capture-source=Entire screen",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
      grepInvert: /@webkit-only/,
    },
    {
      name: "webkit",
      dependencies: ["setup"],
      use: { ...devices["Desktop Safari"], storageState: AUTH },
      grep: /@webkit/,
    },
  ],
});
