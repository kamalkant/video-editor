import { ZodError } from "zod";
import { BrandError, brandSchema, createKit, deleteKit, getBrand, renameKit, saveBrand, switchKit } from "@/lib/brand";
import { requireUser } from "@/lib/auth/requireUser";
import { apiError } from "@/lib/http/errors";

export const runtime = "nodejs";

/** Your Brand Kit (logo, colors, fonts, intro / outro, activeId, kits): each person has their own. */
export async function GET() {
  const user = await requireUser("Sign in to use your Brand Kit.");
  if (user instanceof Response) return user;
  return Response.json(await getBrand(user.id));
}

/** Change active kit properties or switch active kit. */
export async function PUT(request: Request) {
  const user = await requireUser("Sign in to use your Brand Kit.");
  if (user instanceof Response) return user;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    if (typeof body.switchKit === "string") {
      return Response.json(await switchKit(user.id, body.switchKit));
    }
    const patch = brandSchema.partial().omit({ fonts: true }).parse(body);
    return Response.json(await saveBrand(user.id, patch));
  } catch (err) {
    if (err instanceof BrandError) return apiError(400, "brand_error", err.message);
    if (err instanceof ZodError) return apiError(400, "bad_settings", err.issues[0]?.message ?? "Invalid Brand Kit");
    return apiError(500, "server_error", "Couldn't save the Brand Kit.");
  }
}

/** Multi-kit management actions: create, switch, rename, delete */
export async function POST(request: Request) {
  const user = await requireUser("Sign in to use your Brand Kit.");
  if (user instanceof Response) return user;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "bad_request", "Send JSON.");
  }
  try {
    const action = body?.action;
    if (action === "create") {
      return Response.json(await createKit(user.id, String(body.name || "")));
    }
    if (action === "switch") {
      return Response.json(await switchKit(user.id, String(body.id)));
    }
    if (action === "rename") {
      return Response.json(await renameKit(user.id, String(body.id), String(body.name || "")));
    }
    if (action === "delete") {
      return Response.json(await deleteKit(user.id, String(body.id)));
    }
    return apiError(400, "invalid_action", "Supported actions: create, switch, rename, delete");
  } catch (err) {
    if (err instanceof BrandError) return apiError(400, "brand_error", err.message);
    if (err instanceof ZodError) return apiError(400, "bad_settings", err.issues[0]?.message ?? "Invalid Brand Kit");
    return apiError(500, "server_error", "Couldn't process brand kit action.");
  }
}
