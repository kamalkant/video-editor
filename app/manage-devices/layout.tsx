import type { Metadata } from "next";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: "Manage Devices",
  robots: NO_INDEX_ROBOTS,
};

export default function ManageDevicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
