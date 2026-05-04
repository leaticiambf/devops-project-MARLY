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
      <span className="text-[0.72rem] font-bold uppercase tracking-[0.2em] text-secondary">
        {label}
      </span>
      <input
        aria-label={props["aria-label"] ?? label}
        {...props}
        className={cn(
          "w-full rounded-2xl border border-line bg-[rgba(255,255,255,0.03)] px-4 py-3.5 text-sm text-foreground font-mono outline-none transition placeholder:text-secondary/80 focus:border-brand focus:bg-surface-strong focus:ring-2 focus:ring-brand-soft",
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
