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
      <div className="flex flex-col justify-between rounded-xl border border-line bg-surface px-8 py-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-secondary">
            {description}
          </p>
        </div>
        <div className="grid gap-4 text-sm text-secondary">
          <p>
            Build everyday trips faster, keep your errands close to the route,
            and keep your travel preferences in one place.
          </p>
          <p>
            Use the same Mavigo account across journey planning, task syncing,
            and your eco score dashboard.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-col justify-center">
        <div className="flex flex-col gap-1 mb-8">
          <div className="h-1 rounded-full bg-[#009b48]" />
          <div className="h-1 rounded-full bg-[#ffd100]" />
          <div className="h-1 rounded-full bg-[#e3001b]" />
          <div className="h-1 rounded-full bg-[#4a73c2]" />
        </div>
        <Card className="flex flex-col justify-center">
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
