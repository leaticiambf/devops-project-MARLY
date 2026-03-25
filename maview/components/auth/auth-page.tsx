"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { useAuth } from "@/providers/auth-provider";

type AuthPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  alternateHref: string;
  alternateLabel: string;
  children: React.ReactNode;
};

export function AuthPage({
  eyebrow,
  title,
  description,
  alternateHref,
  alternateLabel,
  children,
}: AuthPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isRestoring } = useAuth();

  useEffect(() => {
    if (!isRestoring && isAuthenticated) {
      router.replace(searchParams.get("next") || "/");
    }
  }, [isAuthenticated, isRestoring, router, searchParams]);

  return (
    <div className="grid min-h-[calc(100vh-10rem)] gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col justify-between rounded-[32px] border border-white/50 bg-[linear-gradient(135deg,rgba(12,124,89,0.12),rgba(255,255,255,0.72),rgba(242,143,59,0.16))] px-8 py-10 shadow-[0_30px_80px_rgba(18,33,43,0.1)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-strong">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-700">
            {description}
          </p>
        </div>
        <div className="grid gap-4 text-sm text-slate-600">
          <p>
            `/api/*`, `/oauth2/*`, `/login/oauth2/*`, and `/logout` stay on the
            same frontend origin through Next rewrites.
          </p>
          <p>
            Google Tasks remains Spring-session-based in v1, while the main app
            API keeps JWT in `localStorage`.
          </p>
        </div>
      </div>

      <Card className="mx-auto flex w-full max-w-xl flex-col justify-center">
        {children}
        <p className="mt-6 text-sm text-slate-600">
          <Link href={alternateHref} className="font-semibold text-brand-strong">
            {alternateLabel}
          </Link>
        </p>
      </Card>
    </div>
  );
}
