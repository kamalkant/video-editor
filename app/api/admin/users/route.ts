import { z } from "zod";
import { adminError, pageParams, parseBody, requireAdmin } from "@/lib/auth/admin-guard";
import { canGrantRole, MIN_PASSWORD_LENGTH } from "@/lib/auth/admin-policy";
import { createUser, getUserByEmail, listUsers } from "@/lib/db/users";
import { logAudit } from "@/lib/db/audit";

export const runtime = "nodejs";

const ROLES = ["user", "admin", "super_admin"] as const;
const STATUSES = ["active", "suspended", "deleted"] as const;

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const role = searchParams.get("role");
  const status = searchParams.get("status");
  const result = listUsers({
    search,
    role: role && (ROLES as readonly string[]).includes(role) ? (role as (typeof ROLES)[number]) : "all",
    status: status && (STATUSES as readonly string[]).includes(status) ? (status as (typeof STATUSES)[number]) : "all",
    ...pageParams(searchParams, 25),
  });
  return Response.json(result);
}

const CreateUser = z.object({
  email: z.string().trim().toLowerCase().email("valid email is required"),
  name: z.string().trim().min(1, "name is required").max(120),
  password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  role: z.enum(ROLES).default("user"),
  status: z.enum(["active", "suspended"]).default("active"),
});

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;
  const body = await parseBody(request, CreateUser);
  if (body.invalid) return body.invalid;
  const { email, name, password, role, status } = body.data;

  if (!canGrantRole(guard.user, role)) {
    return adminError(403, "forbidden", "Only a Super Admin can create admin or super admin accounts.");
  }
  if (getUserByEmail(email)) {
    return adminError(409, "conflict", "An account with this email already exists.");
  }

  try {
    const newUser = createUser({ email, name, password, role, status });
    logAudit({
      actorId: guard.user.id,
      action: "admin.create_user",
      target: newUser.id,
      details: { email, role, status },
    });
    return Response.json({ ok: true, user: newUser }, { status: 201 });
  } catch (err) {
    console.error("Admin create user error:", err);
    return adminError(500, "server_error", "Failed to create user.");
  }
}
