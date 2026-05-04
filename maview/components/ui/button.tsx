import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-[0_12px_28px_rgba(0,155,72,0.24)] hover:-translate-y-px hover:bg-brand-strong",
  secondary:
    "border border-line bg-surface-strong text-foreground hover:-translate-y-px hover:bg-surface",
  ghost: "border border-line/80 bg-transparent text-secondary hover:border-line hover:bg-surface-strong hover:text-foreground",
  danger: "bg-danger text-white shadow-[0_12px_28px_rgba(227,0,27,0.18)] hover:-translate-y-px hover:opacity-90",
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
    "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
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
