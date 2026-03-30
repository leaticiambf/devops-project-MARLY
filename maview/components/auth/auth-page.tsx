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
    <div className="grid min-h-[calc(100vh-10rem)] gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="panel-shell relative overflow-hidden px-8 py-10 sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(0,155,72,0.14),transparent_38%)]" />
        <div className="relative flex h-full flex-col justify-between gap-10">
          <div>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-lg font-bold text-white shadow-[0_14px_34px_rgba(0,155,72,0.24)]">
                MV
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">
                  {eyebrow}
                </p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.22em] text-secondary">
                  Paris Transit Console
                </p>
              </div>
            </div>
            <h1 className="mt-8 max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-secondary">
              {description}
            </p>
          </div>

          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.35rem] border border-line bg-[rgba(255,255,255,0.03)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Journey
                </p>
                <p className="mt-2 text-sm text-foreground">Plan faster with saved preferences.</p>
              </div>
              <div className="rounded-[1.35rem] border border-line bg-[rgba(255,255,255,0.03)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Tasks
                </p>
                <p className="mt-2 text-sm text-foreground">Keep errands close to the route.</p>
              </div>
              <div className="rounded-[1.35rem] border border-line bg-[rgba(255,255,255,0.03)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Eco Score
                </p>
                <p className="mt-2 text-sm text-foreground">Track greener travel over time.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-line bg-[rgba(12,18,34,0.4)] px-5 py-5">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-brand" />
                <span className="h-3 w-3 rounded-full bg-[#ffd100]" />
                <span className="h-3 w-3 rounded-full bg-[#e3001b]" />
                <span className="h-3 w-3 rounded-full bg-[#4a73c2]" />
              </div>
              <div className="mt-5 grid gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-brand/60" />
                  <p className="text-sm font-semibold text-foreground">Saved home address</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-px w-[72%] bg-accent/60" />
                  <p className="text-sm font-semibold text-foreground">Task-aware routing</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-px w-[58%] bg-[#ffd100]" />
                  <p className="text-sm font-semibold text-foreground">Badge progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-col justify-center">
        <Card className="flex flex-col justify-center rounded-[2rem] p-7 sm:p-8">
          {children}
          <p className="mt-6 text-sm text-secondary">
            <Link href={alternateHref} className="font-semibold text-brand">
              {alternateLabel}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
