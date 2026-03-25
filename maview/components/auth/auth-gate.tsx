"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isRestoring } = useAuth();

  useEffect(() => {
    if (!isRestoring && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isRestoring, pathname, router]);

  if (isRestoring || !isAuthenticated) {
    return (
      <Card className="mx-auto mt-20 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Session
        </p>
        <h1 className="mt-3 page-title">Restoring access</h1>
        <p className="mt-3 page-copy">
          Maview restores the JWT session client-side before protected pages
          render. Unauthenticated users are redirected onto dedicated auth
          pages instead of modal overlays.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
