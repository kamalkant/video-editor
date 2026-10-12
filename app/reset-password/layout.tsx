import type { Metadata } from "next";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: NO_INDEX_ROBOTS,
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
