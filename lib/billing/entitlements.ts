import "server-only";
import type { SafeUser } from "../db/schema";
import { getUserSubscriptionWithPlan } from "../db/subscriptions";

/** What a user's plan allows when exporting. */
export type Entitlements = {
  /** The biggest export by its short side (1080 = Full HD, 2160 = 4K). */
  maxExportHeight: number;
  /** Exports carry the small ViPlay logo (the Free plan). */
  watermark: boolean;
  planName: string;
};

/** The signed-in user's limits: from their live plan (Free when none); staff are never limited. */
export function entitlementsFor(user: SafeUser): Entitlements {
  if (user.role === "admin" || user.role === "super_admin") return { maxExportHeight: 4320, watermark: false, planName: "Staff" };
  const { plan } = getUserSubscriptionWithPlan(user.id);
  const p = plan as { name: string; max_export_height?: number; watermark?: boolean | number; price_amount: number };
  const free = p.price_amount === 0;
  return {
    maxExportHeight: Number(p.max_export_height) || (free ? 1080 : 2160),
    watermark: p.watermark === undefined ? free : Boolean(p.watermark),
    planName: p.name,
  };
}

/** Why an export of width × height isn't allowed on these entitlements, or null. Sizes compare by their short side. */
export function exportBlocked(e: Entitlements, width: number, height: number): string | null {
  const short = Math.min(width, height);
  if (short <= e.maxExportHeight) return null;
  const label = (h: number) => (h >= 2160 ? "4K" : h >= 1440 ? "1440p" : `${h}p`);
  return `${e.planName} exports up to ${label(e.maxExportHeight)}. Upgrade your plan in Billing for ${label(short)}, or pick a smaller size.`;
}
