import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeVariant = "muted" | "accent" | "success";

const badgeStyles: Record<BadgeVariant, string> = {
  muted: "bg-white/70 text-slate-600",
  accent: "bg-accent-soft text-amber-800",
  success: "bg-brand-soft text-brand-strong",
};

export function Badge({
  className,
  children,
  variant = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        badgeStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
