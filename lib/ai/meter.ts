import "server-only";
import { getCurrentUser } from "../auth/session";
import { decryptString } from "../crypto/encryption";
import { getAdminSetting } from "../db/admin-settings";
import { deductAICredits, getUserAICredits, refundAICredits } from "../db/ai-credits";
import { getDb } from "../db/index";
import { apiError } from "../http/errors";
import { aiKeyScope } from "./keys";
import { isFake } from "./gemini";
import { ownerScope } from "../auth/owner";
import { parseAiCosts, type AiTool } from "./costs";
import type { ProviderId } from "./providers";

/** A route sets this on a response that didn't use the AI service (a cached or offline result). */
export const FREE_HEADER = "X-AI-Free";

export { DEFAULT_AI_COSTS, type AiTool } from "./costs";

/** Credits for one request of `tool` (`units`: minutes of sound for subtitles, else 1). */
export function aiCost(tool: AiTool, units = 1): number {
  const per = parseAiCosts(getAdminSetting("ai_credit_costs", "{}"))[tool];
  return Math.max(0, Math.round(per * Math.max(1, Math.ceil(units))));
}

/** Who pays for this request: the user's own key (free for us), an admin pool, or the platform key. */
function keyFor(userId: string, provider: ProviderId): { key: string | null; source: "own" | "pool" | "platform" } {
  const db = getDb();
  const own = db
    .prepare("SELECT encrypted_key FROM user_api_credentials WHERE user_id = ? AND provider = ? AND is_enabled = 1")
    .get(userId, provider) as { encrypted_key: string } | undefined;
  const ownKey = own ? decryptString(own.encrypted_key) : null;
  if (ownKey) return { key: ownKey, source: "own" };
  const pool = db
    .prepare(
      `SELECT p.encrypted_key FROM user_api_assignments a JOIN admin_api_pools p ON a.pool_id = p.id
       WHERE a.user_id = ? AND p.provider = ? AND a.status = 'active' AND p.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > ?) LIMIT 1`,
    )
    .get(userId, provider, Date.now()) as { encrypted_key: string } | undefined;
  const poolKey = pool ? decryptString(pool.encrypted_key) : null;
  if (poolKey) return { key: poolKey, source: "pool" };
  return { key: null, source: "platform" };
}

/**
 * Run one AI request for the signed-in user, paid the right way:
 *  - their own key (AI settings): used as is, no credits;
 *  - otherwise (an admin-assigned pool, or the platform key) the tool's credits are taken first;
 *    with too few the request stops with 402 and an upgrade message, and a request that fails
 *    gets its credits back. Super admins are never charged.
 * The chosen key reaches gemini.ts / grok.ts through aiKeyScope.
 */
export async function meteredAi(tool: AiTool, provider: ProviderId, run: () => Promise<Response>, units = 1): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in to use AI features.");
  const { key, source } = keyFor(user.id, provider);
  const scope = { keys: key ? { [provider]: key } : {} };
  // (the pretend Gemini of the browser tests costs nothing)
  const charge = source !== "own" && user.role !== "super_admin" && !isFake() ? aiCost(tool, units) : 0;

  if (charge > 0) {
    const taken = deductAICredits(user.id, charge, `AI: ${tool}`);
    if (!taken.success) {
      return apiError(
        402,
        "no_credits",
        `You're out of AI credits (this needs ${charge}, you have ${getUserAICredits(user.id).balance}). Upgrade your plan in Billing, or add your own Gemini key in AI settings.`,
      );
    }
  }

  let res: Response;
  try {
    // (what it makes is theirs: lib/auth/owner)
    res = await ownerScope.run({ userId: user.id }, () => aiKeyScope.run(scope, run));
  } catch (err) {
    if (charge > 0) refundAICredits(user.id, charge, `Refund: AI ${tool} failed`);
    throw err;
  }
  if (charge > 0 && !res.ok) refundAICredits(user.id, charge, `Refund: AI ${tool} failed`);
  // a result that cost nothing (made earlier and reused, or offline) is free: give the credits back
  if (charge > 0 && res.ok && res.headers.get(FREE_HEADER)) {
    refundAICredits(user.id, charge, `Refund: AI ${tool} reused`);
    return res;
  }
  if (charge > 0 && res.ok) {
    // (the editor shows the new balance)
    const headers = new Headers(res.headers);
    headers.set("X-AI-Credits-Charged", String(charge));
    headers.set("X-AI-Credits-Left", String(getUserAICredits(user.id).balance));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  return res;
}
