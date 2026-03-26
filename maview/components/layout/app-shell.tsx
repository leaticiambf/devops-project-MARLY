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
    <div className="min-h-screen pb-10 bg-background">
      <header className="shell-grid sticky top-0 z-40 pt-4">
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                MV
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                  Paris Transit
                </p>
                <p className="text-base font-bold tracking-tight text-foreground">
                  MAVIGO
                </p>
              </div>
            </Link>
            <Badge variant="accent">Live planning</Badge>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <nav className="pt-0.5">
              <div className="relative flex items-start">
                <div className="absolute top-2 left-4 right-4 h-px bg-line" />
                {navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href} className="relative flex flex-col items-center px-5 z-10">
                      <div className={cn("w-4 h-4 rounded-full border-2", active ? "bg-brand border-brand" : "bg-surface border-line")} />
                      <span className={cn("text-xs mt-1.5 whitespace-nowrap", active ? "text-brand font-semibold" : "text-secondary")}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {isRestoring ? (
              <Badge variant="muted">Restoring access</Badge>
            ) : isAuthenticated && user ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-lg border border-line bg-surface-strong px-4 py-2 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-secondary font-mono">{user.email}</p>
                </div>
                {user.googleAccountLinked ? (
                  <Badge variant="success">Google Tasks connected</Badge>
                ) : (
                  <Badge variant="muted">Google Tasks optional</Badge>
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
