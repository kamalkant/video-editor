import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";
import { Icon } from "@/components/ui/Icon";
import { AdminLayoutShell } from "./AdminLayoutShell";
import { ChangePasswordGate } from "./ChangePasswordGate";
import { NO_INDEX_ROBOTS } from "@/lib/seo/config";

export const metadata: Metadata = {
  title: "Super Admin",
  robots: NO_INDEX_ROBOTS,
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!isAdmin(user)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-app p-4 text-center">
        <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-4">
          <Icon name="lock" className="size-8" />
        </div>
        <h1 className="text-xl font-bold text-ink">Access Denied</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Your account ({user.email}) does not have administrative privileges. Please contact a Super Administrator.
        </p>
        <Link href="/" className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover">
          Return to Studio
        </Link>
      </div>
    );
  }

  if (user.must_change_password) return <ChangePasswordGate email={user.email ?? ""} />;

  return (
    <AdminLayoutShell user={{ id: user.id, name: user.name ?? "", email: user.email ?? "", role: user.role }}>{children}</AdminLayoutShell>
  );
}
