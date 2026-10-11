import "server-only";
import { Pool, type QueryResult } from "pg";

let _pgPool: Pool | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function getPgPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) return null;

  if (!_pgPool) {
    _pgPool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    _pgPool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client", err);
    });
  }

  return _pgPool;
}

const POSTGRES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_login_at BIGINT,
  email_verified BIGINT NOT NULL DEFAULT 0,
  phone_number VARCHAR(32) UNIQUE,
  phone_verified BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pg_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_pg_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_pg_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(128) UNIQUE NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_pg_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS user_identities (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_pg_user_identities_provider ON user_identities(provider, provider_user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) UNIQUE NOT NULL,
  type VARCHAR(32) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pg_auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE IF NOT EXISTS phone_otps (
  id VARCHAR(64) PRIMARY KEY,
  phone_number VARCHAR(32) NOT NULL,
  otp_hash VARCHAR(128) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_phone_otps_phone ON phone_otps(phone_number);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(128) NOT NULL,
  target VARCHAR(255),
  details TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pg_audit_logs_created_at ON audit_logs(created_at);
`;

export async function initPostgresSchema(): Promise<void> {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(POSTGRES_SCHEMA_SQL);
}

export async function queryPg<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  const pool = getPgPool();
  if (!pool) throw new Error("PostgreSQL pool is not configured");
  return pool.query<T>(sql, params);
}
