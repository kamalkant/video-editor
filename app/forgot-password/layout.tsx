import type { Metadata } from "next";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: NO_INDEX_ROBOTS,
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
