import "@testing-library/jest-dom/vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// tests never read or write the editor's real storage (projects, uploads, saved API keys):
// a test that needs storage gets a throwaway folder unless it sets its own
process.env.VDO_STORAGE ??= mkdtempSync(join(tmpdir(), "VDO-test-storage-"));
// tests never touch the real database (data/VDO.db): each run boots a fresh one, which also
// exercises first-run seeding (super admin, plans, feature flags)
process.env.VDO_DB_PATH ??= join(mkdtempSync(join(tmpdir(), "VDO-test-db-")), "test.db");
