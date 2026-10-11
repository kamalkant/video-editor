import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { Plan, ParsedPlan, PlanInterval } from "./schema";

export function parsePlan(plan: Plan): ParsedPlan {
  let features: string[] = [];
  try {
    features = JSON.parse(plan.features);
  } catch {
    features = [];
  }

  return {
    ...plan,
    features,
    is_active: Boolean(plan.is_active),
    is_public: Boolean(plan.is_public),
    max_export_height: Number(plan.max_export_height ?? 2160) || 2160,
    watermark: Boolean(plan.watermark),
  };
}

export function listPlans(includeInactive = false): ParsedPlan[] {
  const db = getDb();
  const query = includeInactive
    ? "SELECT * FROM plans ORDER BY price_amount ASC, version DESC"
    : "SELECT * FROM plans WHERE is_active = 1 AND is_public = 1 ORDER BY price_amount ASC";
  
  const rows = db.prepare(query).all() as Plan[];
  return rows.map(parsePlan);
}

export function getPlanById(id: string): ParsedPlan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as Plan | undefined;
  return row ? parsePlan(row) : null;
}

export function getPlanBySlug(slug: string): ParsedPlan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM plans WHERE slug = ?").get(slug) as Plan | undefined;
  return row ? parsePlan(row) : null;
}

export function createPlan(data: {
  name: string;
  slug: string;
  description?: string;
  interval: PlanInterval;
  currency?: string;
  price_amount: number;
  tax_rate_percent?: number;
  trial_days?: number;
  ai_credits_monthly?: number;
  device_limit?: number;
  features: string[];
  is_active?: boolean;
  is_public?: boolean;
  max_export_height?: number;
  watermark?: boolean;
}): ParsedPlan {
  const db = getDb();
  const id = "plan_" + randomUUID().slice(0, 8);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO plans (
      id, name, slug, description, interval, currency, price_amount,
      tax_rate_percent, trial_days, ai_credits_monthly, device_limit,
      features, is_active, is_public, version, created_at, updated_at, max_export_height, watermark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.name,
    data.slug.toLowerCase().trim(),
    data.description || null,
    data.interval,
    data.currency || "INR",
    data.price_amount,
    data.tax_rate_percent ?? 18.0,
    data.trial_days ?? 0,
    data.ai_credits_monthly ?? 50,
    data.device_limit ?? 2,
    JSON.stringify(data.features),
    data.is_active === false ? 0 : 1,
    data.is_public === false ? 0 : 1,
    now,
    now,
    data.max_export_height ?? 2160,
    data.watermark ? 1 : 0
  );

  return getPlanById(id)!;
}

export function updatePlan(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    interval: PlanInterval;
    currency: string;
    price_amount: number;
    tax_rate_percent: number;
    trial_days: number;
    ai_credits_monthly: number;
    device_limit: number;
    features: string[];
    is_active: boolean;
    is_public: boolean;
    max_export_height: number;
    watermark: boolean;
    bumpVersion: boolean;
  }>
): ParsedPlan | null {
  const existing = getPlanById(id);
  if (!existing) return null;

  const db = getDb();
  const now = Date.now();
  const newVersion = data.bumpVersion ? existing.version + 1 : existing.version;

  const stmt = db.prepare(`
    UPDATE plans SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      interval = COALESCE(?, interval),
      currency = COALESCE(?, currency),
      price_amount = COALESCE(?, price_amount),
      tax_rate_percent = COALESCE(?, tax_rate_percent),
      trial_days = COALESCE(?, trial_days),
      ai_credits_monthly = COALESCE(?, ai_credits_monthly),
      device_limit = COALESCE(?, device_limit),
      features = COALESCE(?, features),
      is_active = COALESCE(?, is_active),
      is_public = COALESCE(?, is_public),
      max_export_height = COALESCE(?, max_export_height),
      watermark = COALESCE(?, watermark),
      version = ?,
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    data.name ?? null,
    data.description !== undefined ? data.description : null,
    data.interval ?? null,
    data.currency ?? null,
    data.price_amount !== undefined ? data.price_amount : null,
    data.tax_rate_percent !== undefined ? data.tax_rate_percent : null,
    data.trial_days !== undefined ? data.trial_days : null,
    data.ai_credits_monthly !== undefined ? data.ai_credits_monthly : null,
    data.device_limit !== undefined ? data.device_limit : null,
    data.features ? JSON.stringify(data.features) : null,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : null,
    data.is_public !== undefined ? (data.is_public ? 1 : 0) : null,
    data.max_export_height !== undefined ? data.max_export_height : null,
    data.watermark !== undefined ? (data.watermark ? 1 : 0) : null,
    newVersion,
    now,
    id
  );

  return getPlanById(id);
}

export function archivePlan(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare("UPDATE plans SET is_active = 0, is_public = 0, updated_at = ? WHERE id = ?");
  const res = stmt.run(Date.now(), id);
  return res.changes > 0;
}
