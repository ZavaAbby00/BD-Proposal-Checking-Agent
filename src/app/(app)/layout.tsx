import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image }}
      role={user.role}
      orgName={user.organization?.name ?? "Platform (no organization)"}
      signOutAction={signOutAction}
    >
      {children}
    </AppShell>
  );
}
