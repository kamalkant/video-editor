import { NextResponse } from "next/server";
import { listPlans } from "@/lib/db/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plans = listPlans(false);
    return NextResponse.json(
      {
        ok: true,
        plans,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch public plans:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load pricing plans." },
      { status: 500 }
    );
  }
}
