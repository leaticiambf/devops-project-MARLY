import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type StatePanelTone = "neutral" | "success" | "warning" | "danger";

const toneStyles: Record<StatePanelTone, string> = {
  neutral: "bg-white/70 text-slate-700 border border-line",
  success: "border border-emerald-200 bg-emerald-50/80 text-slate-800",
  warning: "border border-amber-200 bg-amber-50/90 text-slate-800",
  danger: "border border-rose-200 bg-rose-50/90 text-rose-950",
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
      className={cn("rounded-[24px] px-5 py-4", toneStyles[tone], className)}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {eyebrow}
        </p>
      ) : null}
      <p className={cn("font-semibold", eyebrow ? "mt-2" : "")}>{title}</p>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
