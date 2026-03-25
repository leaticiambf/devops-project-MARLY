import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "glass-panel rounded-[28px] p-6 text-slate-900 subtle-ring",
        className,
      )}
    />
  );
}
