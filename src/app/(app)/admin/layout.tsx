import { requireOrgAdmin } from "@/lib/session";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOrgAdmin();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Organization access control, API keys and review configuration.
        </p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
