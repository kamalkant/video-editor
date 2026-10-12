import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default function PlayerPage() {
  redirect("/editor");
}
