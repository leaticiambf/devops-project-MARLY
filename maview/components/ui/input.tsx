import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <label className="grid gap-2 text-sm font-medium text-secondary">
      <span>{label}</span>
      <input
        {...props}
        className={cn(
          "w-full rounded-lg border border-line bg-surface-strong px-4 py-3 text-sm text-foreground font-mono outline-none transition placeholder:text-secondary focus:border-brand focus:ring-2 focus:ring-brand-soft",
          error && "border-danger focus:border-danger focus:ring-danger/20",
          className,
        )}
      />
      {error ? (
        <span className="text-xs font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-secondary">{hint}</span>
      ) : null}
    </label>
  );
}
