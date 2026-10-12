import type { Metadata } from "next";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: "Account",
  robots: NO_INDEX_ROBOTS,
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
