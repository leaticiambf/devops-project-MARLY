"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/brand/logo-mark";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/providers/auth-provider";

const navItems = [
  { href: "/", label: "Journey" },
  { href: "/explore", label: "Explore" },
  { href: "/tasks", label: "Tasks" },
  { href: "/eco-score", label: "Eco Score" },
];

const mobileFeatureItems = [
  {
    href: "/",
    label: "Plan",
    description: "Trajet, options et resultats",
    icon: "J",
  },
  {
    href: "/transport-map",
    label: "Map",
    description: "Carte et lignes en direct",
    icon: "M",
  },
  {
    href: "/explore",
    label: "Explore",
    description: "Restaurants et lieux proches",
    icon: "E",
  },
  {
    href: "/tasks",
    label: "Tasks",
    description: "Google Tasks et arrets",
    icon: "T",
  },
  {
    href: "/eco-score",
    label: "Eco",
    description: "Badges et progression",
    icon: "C",
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isRestoring, logout, user } = useAuth();
  const isAuthPage = pathname === "/login" || pathname === "/register";

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-background",
        isAuthenticated && !isRestoring ? "pb-28 lg:pb-10" : "pb-4 lg:pb-6",
      )}
    >
      <header className="sticky top-0 z-40 border-b border-line/70 bg-background/90 backdrop-blur-xl">
        <div className="shell-grid py-3 lg:py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-3">
                <LogoMark className="h-11 w-11 p-1.5" />
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-secondary lg:text-xs lg:tracking-[0.28em]">
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

            <nav className="hidden flex-1 lg:flex lg:justify-center">
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
              {isRestoring && !isAuthPage ? (
                <Badge variant="muted">Restoring access</Badge>
              ) : isAuthenticated && user ? (
                <UserMenu user={user} onLogout={handleLogout} />
              ) : (
                <div className="flex items-center gap-2">
                  <Button asChild variant="ghost" className="px-3 text-sm sm:px-4">
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button asChild className="px-3 text-sm sm:px-4">
                    <Link href="/register">Register</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className={cn("shell-grid", isAuthenticated && !isRestoring ? "mt-5 lg:mt-8" : "mt-4 lg:mt-5")}>
        {isAuthenticated && !isRestoring ? (
          <section className="mb-5 grid gap-3 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Quick access
                </p>
                <h1 className="mt-1 text-xl font-bold text-foreground">
                  What do you need?
                </h1>
              </div>
              <Badge variant="accent">Mobile</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {mobileFeatureItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "min-h-[104px] rounded-2xl border border-line bg-surface/80 p-4 transition",
                      active
                        ? "border-brand/60 bg-brand-soft"
                        : "hover:border-brand/50 hover:bg-surface-strong",
                    )}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-strong text-sm font-black text-accent">
                      {item.icon}
                    </span>
                    <span className="mt-3 block text-base font-bold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-secondary">
                      {item.description}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
        {children}
      </main>

      {isAuthenticated && !isRestoring ? (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-background/95 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[1.35rem] border border-line bg-surface/90 p-1.5">
            {mobileFeatureItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-[58px] flex-col items-center justify-center rounded-2xl px-1 py-2 text-[0.68rem] font-bold transition",
                    active
                      ? "bg-surface-strong text-foreground"
                      : "text-secondary hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-lg text-[0.65rem] font-black",
                      active ? "bg-brand text-white" : "bg-background text-accent",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
