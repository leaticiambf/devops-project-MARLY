"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/layout/user-menu";
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
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-background/90 backdrop-blur-xl">
        <div className="shell-grid py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
              <Badge variant="accent" className="hidden sm:inline-flex">
                Live planning
              </Badge>
            </div>

            <nav className="flex-1 lg:flex lg:justify-center">
              <div className="inline-flex w-full max-w-xl items-center rounded-full border border-line bg-surface/80 p-1">
                {navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition",
                        active
                          ? "bg-surface-strong text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "text-secondary hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="flex justify-end">
              {isRestoring ? (
                <Badge variant="muted">Restoring access</Badge>
              ) : isAuthenticated && user ? (
                <UserMenu user={user} onLogout={handleLogout} />
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
        </div>
      </header>

      <main className="shell-grid mt-8">{children}</main>
    </div>
  );
}
