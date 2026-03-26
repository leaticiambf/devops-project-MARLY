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
      <Card className="mx-auto mt-20 max-w-2xl border-l-4 border-l-brand">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-secondary font-mono">
          Session
        </p>
        <h1 className="mt-3 page-title">Restoring access</h1>
        <p className="mt-3 page-copy">
          We're checking your account before opening this page. If you are not
          signed in, you will be redirected to the login screen.
        </p>
      </Card>
    );
  }

  return <>{children}</>;
}
