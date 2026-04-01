import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "panel-shell p-6 text-foreground backdrop-blur-sm",
        className,
      )}
    />
  );
}
