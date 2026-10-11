import { getCurrentUser } from "@/lib/auth/session";
import { getComputedFeaturesForUser } from "@/lib/db/features";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  const features = getComputedFeaturesForUser(user);

  return Response.json({
    user,
    features,
  });
}
