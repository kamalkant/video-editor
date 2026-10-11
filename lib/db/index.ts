import "server-only";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "./schema";
import { seedDefaultData, SEED_ADMIN_PASSWORD } from "./seed";
import { verifyPassword } from "../auth/passwords";

const DB_DIR = join(process.cwd(), "data");
const DB_PATH = process.env.VDO_DB_PATH || join(DB_DIR, "VDO.db");
/** The SQLite file (admin system health shows its size). */
export const DB_FILE = DB_PATH;

let _db: DatabaseSync | null = null;

function runSqliteMigrations(db: DatabaseSync): void {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (tableInfo && tableInfo.length > 0) {
      const columnNames = new Set(tableInfo.map((col) => col.name));

      if (!columnNames.has("email_verified")) {
        db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;");
      }
      if (!columnNames.has("phone_number")) {
        db.exec("ALTER TABLE users ADD COLUMN phone_number TEXT;");
      }
      if (!columnNames.has("phone_verified")) {
        db.exec("ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;");
      }
      if (!columnNames.has("must_change_password")) {
        db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;");
        // (once) super admins still on the password the database was seeded with must change it
        const admins = db
          .prepare("SELECT id, password_hash, password_salt FROM users WHERE role = 'super_admin' AND password_hash IS NOT NULL")
          .all() as Array<{ id: string; password_hash: string; password_salt: string }>;
        for (const a of admins) {
          if (verifyPassword(SEED_ADMIN_PASSWORD, a.password_hash, a.password_salt)) {
            db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(a.id);
          }
        }
      }
    }
  } catch {
    // Table doesn't exist yet; SCHEMA_SQL will create it
  }
  try {
    const payCols = new Set((db.prepare("PRAGMA table_info(payments)").all() as Array<{ name: string }>).map((c) => c.name));
    if (payCols.size && !payCols.has("plan_id")) {
      db.exec("ALTER TABLE payments ADD COLUMN plan_id TEXT;");
      db.exec("ALTER TABLE payments ADD COLUMN coupon_id TEXT;");
    }
  } catch {
    // payments table doesn't exist yet; SCHEMA_SQL will create it
  }
  try {
    const planCols = new Set((db.prepare("PRAGMA table_info(plans)").all() as Array<{ name: string }>).map((c) => c.name));
    if (planCols.size && !planCols.has("max_export_height")) {
      db.exec("ALTER TABLE plans ADD COLUMN max_export_height INTEGER NOT NULL DEFAULT 2160;");
      db.exec("ALTER TABLE plans ADD COLUMN watermark INTEGER NOT NULL DEFAULT 0;");
      // the free plan exports up to Full HD with the small ViPlay logo (paid plans: 4K, no logo)
      db.exec("UPDATE plans SET max_export_height = 1080, watermark = 1 WHERE price_amount = 0;");
    }
  } catch {
    // plans table doesn't exist yet; SCHEMA_SQL will create it
  }
}

/**
 * Returns the singleton SQLite database instance.
 * Automatically runs migrations and default seeds on first access.
 */
export function getDb(): DatabaseSync {
  if (_db) return _db;

  if (!existsSync(dirname(DB_PATH))) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);

  // Performance and safety pragmas - set busy_timeout first so workers wait rather than error
  db.exec("PRAGMA busy_timeout = 10000;");
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // Journal mode may already be WAL or locked by another worker
  }
  db.exec("PRAGMA foreign_keys = ON;");

  try {
    // Run incremental migrations first so existing tables have required columns
    runSqliteMigrations(db);

    // Run schema initialization (creates tables & indexes if not present)
    db.exec(SCHEMA_SQL);

    // Run default seeds (admin user and default feature flags)
    seedDefaultData(db);
  } catch (err: any) {
    if (!err?.message?.includes("locked") && !err?.message?.includes("busy")) {
      throw err;
    }
  }

  _db = db;
  return db;
}
