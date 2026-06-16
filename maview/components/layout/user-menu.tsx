"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usersApi } from "@/lib/api/users";
import type { User } from "@/lib/types/api";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

type UserMenuProps = {
  user: User;
  onLogout: () => Promise<void>;
};

export function UserMenu({ user, onLogout }: UserMenuProps) {
  const { token, refreshUser } = useAuth();
  const { toast } = useToast();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [homeAddressDraft, setHomeAddressDraft] = useState(user.homeAddress ?? "");

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const connectedLabel = useMemo(() => {
    if (user.googleAccountLinked) {
      return user.googleAccountEmail || "Google Tasks connected";
    }
    return "Google Tasks optional";
  }, [user.googleAccountEmail, user.googleAccountLinked]);

  const saveHomeAddress = useMutation({
    mutationFn: (value: string) => usersApi.updateHomeAddress(user.userId, value, token!),
    onSuccess: async (updatedUser) => {
      setHomeAddressDraft(updatedUser.homeAddress ?? "");
      await refreshUser();
      toast({
        title: updatedUser.homeAddress ? "Home saved" : "Home cleared",
        description: updatedUser.homeAddress
          ? "Smart suggestions can now prefill the planner."
          : "The saved home address was removed.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Home update failed",
        description:
          error instanceof Error ? error.message : "Could not save the home address.",
        variant: "error",
      });
    },
  });

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-strong/90 p-1 text-left transition hover:border-brand/40 hover:bg-surface sm:h-auto sm:w-auto sm:min-w-[14rem] sm:justify-between sm:gap-3 sm:px-3 sm:py-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            {user.displayName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.displayName}
            </p>
            <p className="truncate text-xs text-secondary">{connectedLabel}</p>
          </div>
        </div>
        <span className="hidden text-lg leading-none text-secondary sm:inline">
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {isOpen ? (
        <div className="fixed inset-x-3 top-16 z-[80] max-h-[calc(100vh-9.5rem)] overflow-hidden rounded-[1.35rem] border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[min(28rem,calc(100vw-2rem))]">
          <div className="border-b border-line bg-[linear-gradient(135deg,rgba(0,155,72,0.16),rgba(56,189,248,0.08))] px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-secondary sm:text-xs sm:tracking-[0.24em]">
                  Your account
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground sm:mt-2 sm:text-xl">
                  {user.displayName}
                </h2>
                <p className="mt-1 break-all text-xs text-secondary sm:text-sm">{user.email}</p>
              </div>
              <Badge
                variant={user.googleAccountLinked ? "success" : "muted"}
                className="max-w-[8rem] justify-center px-2 py-0.5 text-center text-[0.58rem] tracking-[0.12em] sm:max-w-none sm:px-3 sm:py-1 sm:text-[0.68rem] sm:tracking-[0.2em]"
              >
                {user.googleAccountLinked ? "Google Tasks connected" : "Google Tasks optional"}
              </Badge>
            </div>
          </div>

          <div className="grid max-h-[calc(100vh-15rem)] gap-4 overflow-y-auto px-4 py-4 sm:max-h-[75vh] sm:gap-5 sm:px-5 sm:py-5">
            <section className="grid gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Home address</p>
                <p className="mt-1 text-sm text-secondary">
                  Used to prefill suggested trips in the journey planner.
                </p>
              </div>
              <Input
                label="Saved home"
                value={homeAddressDraft}
                onChange={(event) => setHomeAddressDraft(event.target.value)}
                placeholder="12 Rue de Rivoli, Paris"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => saveHomeAddress.mutate(homeAddressDraft.trim())}
                  disabled={saveHomeAddress.isPending}
                >
                  Save home
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setHomeAddressDraft("");
                    saveHomeAddress.mutate("");
                  }}
                  disabled={saveHomeAddress.isPending}
                >
                  Clear
                </Button>
              </div>
            </section>

            <section className="grid gap-3 border-t border-line pt-4">
              <Link
                href="/comfort-presets"
                onClick={() => setIsOpen(false)}
                className="rounded-2xl border border-line bg-surface-strong px-4 py-3 text-sm font-semibold text-foreground transition hover:border-brand/40 hover:bg-surface"
              >
                Manage comfort presets
              </Link>
            </section>

            <section className="border-t border-line pt-5">
              <Button className="w-full" variant="ghost" onClick={() => void onLogout()}>
                Log out
              </Button>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
