"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/providers/auth-provider";

const navItems = [
  { href: "/", label: "Journey" },
  { href: "/tasks", label: "Tasks" },
  { href: "/eco-score", label: "Eco Score" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isRestoring, logout, user } = useAuth();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen pb-10">
      <header className="shell-grid sticky top-0 z-40 pt-4">
        <div className="glass-panel flex flex-col gap-4 rounded-[28px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-sm font-semibold text-white">
                MV
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Mavigo
                </p>
                <p className="text-lg font-semibold tracking-tight text-slate-900">
                  Frontend Migration
                </p>
              </div>
            </Link>
            <Badge variant="accent">Next.js App Router</Badge>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <nav className="flex flex-wrap items-center gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      active
                        ? "bg-slate-900 text-white"
                        : "bg-white/70 text-slate-700 hover:bg-white",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {isRestoring ? (
              <Badge variant="muted">Restoring session</Badge>
            ) : isAuthenticated && user ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full bg-white/80 px-4 py-2 text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                {user.googleAccountLinked ? (
                  <Badge variant="success">Google linked</Badge>
                ) : (
                  <Badge variant="muted">Google pending</Badge>
                )}
                <Button variant="ghost" onClick={handleLogout}>
                  Log out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Register</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="shell-grid mt-8">{children}</main>
    </div>
  );
}
