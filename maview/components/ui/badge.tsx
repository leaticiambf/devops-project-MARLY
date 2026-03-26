import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeVariant = "muted" | "accent" | "success";

const badgeStyles: Record<BadgeVariant, string> = {
  muted: "bg-surface-strong text-secondary border border-line",
  accent: "bg-accent text-[#0c1222]",
  success: "bg-brand text-white",
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
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]",
        badgeStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
