"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FilePlus2,
  FileSearch,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutGrid };

export function AppShell({
  user,
  role,
  orgName,
  signOutAction,
  children,
}: {
  user: { name: string | null; email: string | null; image: string | null };
  role: Role;
  orgName: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Reviews", icon: LayoutGrid },
    { href: "/reviews/new", label: "New review", icon: FilePlus2 },
  ];
  if (role === "ORG_ADMIN" || role === "SUPER_ADMIN") {
    nav.push({ href: "/admin", label: "Admin", icon: SlidersHorizontal });
  }
  if (role === "SUPER_ADMIN") {
    nav.push({ href: "/platform", label: "Platform", icon: ShieldCheck });
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r bg-card">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSearch className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Proposal Agent</div>
            <div className="text-xs text-muted-foreground">{orgName}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
              {(user.name ?? user.email ?? "?").slice(0, 1)}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">
                {user.name ?? "User"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user.email}
              </div>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="ml-60 flex-1">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
