"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { LogoMark } from "@/components/brand/logo-mark";
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
    <div className="grid min-h-[calc(100vh-9rem)] gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="panel-shell relative overflow-hidden px-6 py-5 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(0,155,72,0.14),transparent_38%)]" />
        <div className="relative flex h-full flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-4">
              <LogoMark className="h-12 w-12 p-1.5" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">
                  {eyebrow}
                </p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.22em] text-secondary">
                  Paris Transit Console
                </p>
              </div>
            </div>
            <h1 className="mt-4 max-w-xl text-3xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-secondary sm:text-base">
              {description}
            </p>
            <div className="mt-4 flex justify-center">
              <LogoMark
                className="h-[150px] w-[150px] p-4"
                imageClassName="scale-125"
              />
            </div>
          </div>

          <div className="grid gap-2.5">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-[1.1rem] border border-line bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Journey
                </p>
                <p className="mt-1.5 text-xs leading-5 text-foreground">Plan faster with saved preferences.</p>
              </div>
              <div className="rounded-[1.1rem] border border-line bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Tasks
                </p>
                <p className="mt-1.5 text-xs leading-5 text-foreground">Keep errands close to the route.</p>
              </div>
              <div className="rounded-[1.1rem] border border-line bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Eco Score
                </p>
                <p className="mt-1.5 text-xs leading-5 text-foreground">Track greener travel over time.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.1rem] border border-line bg-[rgba(12,18,34,0.4)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffd100]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e3001b]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#4a73c2]" />
              </div>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-brand/60" />
                  <p className="text-xs font-semibold text-foreground">Saved home address</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-px w-[72%] bg-accent/60" />
                  <p className="text-xs font-semibold text-foreground">Task-aware routing</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-px w-[58%] bg-[#ffd100]" />
                  <p className="text-xs font-semibold text-foreground">Badge progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-col justify-center">
        <Card className="flex flex-col justify-center rounded-[2rem] p-6 sm:p-7">
          {children}
          <p className="mt-5 text-sm text-secondary">
            <Link href={alternateHref} className="font-semibold text-brand">
              {alternateLabel}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
