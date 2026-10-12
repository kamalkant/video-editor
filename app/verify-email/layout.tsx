import type { Metadata } from "next";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: "Verify Email",
  robots: NO_INDEX_ROBOTS,
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
