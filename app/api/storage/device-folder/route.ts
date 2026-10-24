import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apiError } from "@/lib/http/errors";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

/**
 * Drafts saved into ~/Documents/VDO on the computer that runs the server: only for a local install (the editor
 * on your own Mac), switched on with VDO_LOCAL_MODE=1. On a shared server (viplay.in) this wrote every person's
 * projects into one folder of the server, for anyone: there the editor saves drafts on your own computer
 * instead (a folder you pick, lib/storage/deviceFolder).
 */
const LOCAL = () => process.env.VDO_LOCAL_MODE === "1";
/** The most a draft may be (a project's timeline is a few hundred KB at most). */
const MAX_BYTES = 5 * 1024 * 1024;

function documentsDir(): string {
  const target = path.join(os.homedir(), "Documents", "VDO");
  fs.mkdirSync(target, { recursive: true });
  return target;
}

export async function GET() {
  if (!LOCAL()) return Response.json({ ok: false, local: false });
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    return Response.json({ ok: true, local: true, folderName: "Documents/VDO", exists: fs.existsSync(documentsDir()) });
  } catch {
    return apiError(500, "server_error", "Couldn't open Documents/VDO.");
  }
}

export async function POST(request: Request) {
  if (!LOCAL()) return apiError(404, "not_found", "Drafts are saved on your own computer.");
  const user = await requireUser();
  if (user instanceof Response) return user;
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return apiError(413, "too_big", "That draft is too big.");
  let body: { fileName?: unknown; content?: unknown; isTest?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  if (typeof body.fileName !== "string" || !body.fileName) return apiError(400, "bad_request", "fileName is required");
  // only a plain file name, never a path (no escaping the folder)
  const safeName = path.basename(body.fileName).replace(/[^\w .()-]/g, "_").slice(0, 120);
  if (!safeName || safeName.startsWith(".")) return apiError(400, "bad_request", "Use a plain file name.");
  const payload = typeof body.content === "string" ? body.content : JSON.stringify(body.content, null, 2);
  if (Buffer.byteLength(payload) > MAX_BYTES) return apiError(413, "too_big", "That draft is too big.");
  try {
    fs.writeFileSync(path.join(documentsDir(), safeName), payload, "utf8");
    return Response.json({ ok: true, folderName: "Documents/VDO", isTest: !!body.isTest });
  } catch {
    return apiError(500, "server_error", "Couldn't save the draft.");
  }
}
