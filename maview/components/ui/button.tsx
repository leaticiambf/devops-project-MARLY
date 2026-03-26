import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-strong",
  secondary:
    "bg-surface-strong text-foreground border border-line hover:bg-surface",
  ghost: "bg-transparent text-secondary border border-line hover:bg-surface-strong hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-90",
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
    "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
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
