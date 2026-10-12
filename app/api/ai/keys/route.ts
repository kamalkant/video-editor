import { getCurrentUser } from "@/lib/auth/session";
import { forgetModels, GeminiError, testGeminiKey } from "@/lib/ai/gemini";
import { jsonBody } from "@/lib/ai/http";
import { aiStatus, removeAiKey, setAiEnabled, setAiKey } from "@/lib/ai/keys";
import { isProviderId, providerOf, PROVIDERS } from "@/lib/ai/providers";
import { apiError } from "@/lib/http/errors";
import { isImportFake } from "@/lib/import/fake";
import { ImportError, testStockKey } from "@/lib/import/stock";
import {
  listUserCredentials,
  setUserCredential,
  removeUserCredential,
  setUserCredentialEnabled,
  listUserAssignments,
} from "@/lib/ai/user-keys";

export const runtime = "nodejs";

function local(request: Request) {
  const h = new URL(request.url).hostname;
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
}

export async function GET() {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    const userCreds = listUserCredentials(currentUser.id);
    const assignedPools = listUserAssignments(currentUser.id);
    const assignedMap = new Map(assignedPools.map((a) => [a.provider, a]));

    const providers = PROVIDERS.map((p) => {
      const cred = userCreds.find((c) => c.provider === p.id);
      const assigned = assignedMap.get(p.id);

      const hasPersonalKey = !!cred?.hasKey;
      const hasAssignedKey = !!assigned;

      let source = null;
      let last4 = null;
      let policy = null;

      if (hasPersonalKey) {
        source = "user";
        last4 = cred?.last4 || null;
      } else if (hasAssignedKey) {
        source = "assigned";
        last4 = "••••";
        policy = assigned?.policy;
      }

      return {
        id: p.id,
        enabled: cred ? cred.enabled : hasAssignedKey,
        hasKey: hasPersonalKey || hasAssignedKey,
        source,
        last4,
        assignedPolicy: policy,
        poolName: assigned?.poolName || null,
      };
    });

    return Response.json({ providers }, { headers: { "Cache-Control": "no-store" } });
  }

  // Fallback for non-authenticated local editor
  return Response.json({ providers: aiStatus() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser && !local(request)) {
    return apiError(403, "not_authorized", "Sign in or access via local server to manage API keys.");
  }

  const b = await jsonBody(request);
  if (!b || !isProviderId(b.provider)) return apiError(400, "bad_request", "Pick the AI service.");
  const p = providerOf(b.provider)!;

  if (typeof b.enabled === "boolean" && b.key === undefined) {
    if (currentUser) {
      setUserCredentialEnabled(currentUser.id, p.id, b.enabled);
    } else {
      setAiEnabled(p.id, b.enabled);
    }
    if (p.id === "gemini") forgetModels();
    return GET();
  }

  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (!key) return apiError(400, "empty", "Paste the key first.");
  if (!p.shape.test(key)) {
    const hint = p.id === "gemini" ? "keys are usually 16+ characters, e.g. starting with AIza…" : `they start with ${p.example}`;
    return apiError(400, "bad_key", `That doesn't look like a valid ${p.name} key (${hint}). Check you copied all of it.`);
  }

  if (p.id === "gemini") {
    try {
      await testGeminiKey(key);
    } catch (err) {
      if (err instanceof GeminiError && err.code === "gemini_key") return apiError(400, "key_refused", `Google didn't accept this key: ${err.message}. If using Google AI Studio, get your key at aistudio.google.com/apikey.`);
      if (err instanceof GeminiError) return apiError(502, "key_unchecked", `Couldn't check the key with Google: ${err.message}`);
      throw err;
    }
    forgetModels();
  }

  if ((p.id === "pexels" || p.id === "pixabay") && !isImportFake()) {
    try {
      await testStockKey(p.id, key);
    } catch (err) {
      if (err instanceof ImportError && err.code === "key_refused") return apiError(400, "key_refused", `${p.name} didn't accept this key. Check you copied all of it.`);
      if (err instanceof ImportError) return apiError(502, "key_unchecked", `Couldn't check the key with ${p.name}: ${err.message}`);
      throw err;
    }
  }

  if (currentUser) {
    setUserCredential(currentUser.id, p.id, key);
  } else {
    setAiKey(p.id, key);
  }

  return GET();
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser && !local(request)) {
    return apiError(403, "not_authorized", "Sign in or access via local server to manage API keys.");
  }

  const id = new URL(request.url).searchParams.get("provider");
  if (!isProviderId(id)) return apiError(400, "bad_request", "Pick the AI service.");

  if (currentUser) {
    removeUserCredential(currentUser.id, id);
  } else {
    removeAiKey(id);
  }

  if (id === "gemini") forgetModels();
  return GET();
}
