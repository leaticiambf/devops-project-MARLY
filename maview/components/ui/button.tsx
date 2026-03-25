import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-[0_12px_24px_rgba(12,124,89,0.18)] hover:bg-brand-strong",
  secondary:
    "bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] hover:bg-slate-700",
  ghost: "bg-white/70 text-slate-700 hover:bg-white",
  danger: "bg-danger text-white hover:bg-rose-700",
};

type BaseProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  asChild?: boolean;
};

type ButtonProps = BaseProps & ComponentPropsWithoutRef<"button">;

export function Button({
  children,
  className,
  variant = "primary",
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const styles = cn(
    "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variantStyles[variant],
    className,
  );

  if (asChild) {
    const child = children as React.ReactElement<ComponentPropsWithoutRef<typeof Link>>;
    return (
      <Link {...child.props} className={cn(styles, child.props.className)}>
        {child.props.children}
      </Link>
    );
  }

  return (
    <button {...props} type={type} className={styles}>
      {children}
    </button>
  );
}
