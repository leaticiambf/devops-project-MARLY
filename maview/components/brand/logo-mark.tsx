import Image from "next/image";

import { cn } from "@/lib/utils/cn";

type LogoMarkProps = {
  className?: string;
  imageClassName?: string;
  variant?: "circle" | "plain";
};

export function LogoMark({
  className,
  imageClassName,
  variant = "circle",
}: LogoMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        variant === "circle" &&
          "rounded-full border border-line bg-white shadow-[0_14px_34px_rgba(0,155,72,0.18)]",
        className,
      )}
    >
      <Image
        src="/mavigo-logo.png"
        alt="Mavigo"
        width={346}
        height={243}
        className={cn("h-full w-full object-contain", imageClassName)}
        priority
      />
    </span>
  );
}
