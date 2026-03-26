import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type StatePanelTone = "neutral" | "success" | "warning" | "danger";

const toneStyles: Record<StatePanelTone, string> = {
  neutral: "bg-surface-strong text-foreground border border-line",
  success: "border border-brand/30 bg-brand-soft text-foreground",
  warning: "border border-accent/30 bg-accent-soft text-foreground",
  danger: "border border-danger/30 bg-[rgba(227,0,27,0.08)] text-foreground",
};

type StatePanelProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: string;
  title: string;
  description?: string;
  tone?: StatePanelTone;
  actions?: ReactNode;
};

export function StatePanel({
  eyebrow,
  title,
  description,
  tone = "neutral",
  actions,
  className,
  ...props
}: StatePanelProps) {
  return (
    <div
      {...props}
      className={cn("rounded-lg px-5 py-4", toneStyles[tone], className)}
    >
      {eyebrow ? (
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
          {eyebrow}
        </p>
      ) : null}
      <p className={cn("font-semibold text-foreground", eyebrow ? "mt-2" : "")}>{title}</p>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-secondary">{description}</p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
