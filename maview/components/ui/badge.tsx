import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type BadgeVariant = "muted" | "accent" | "success";

const badgeStyles: Record<BadgeVariant, string> = {
  muted: "border border-line bg-surface-strong text-secondary",
  accent: "border border-accent/30 bg-accent text-[#0c1222]",
  success: "border border-brand/30 bg-brand text-white",
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
        "inline-flex items-center rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em]",
        badgeStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
