"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  title: string;
  description: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (input: Omit<ToastItem, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  success: "border-brand/25 bg-white text-slate-900",
  error: "border-danger/25 bg-white text-slate-900",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast(input) {
        const id = Date.now() + Math.random();
        setItems((current) => [...current, { ...input, id }]);
        window.setTimeout(() => {
          setItems((current) => current.filter((item) => item.id !== id));
        }, 4200);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-[24px] border p-4 shadow-[0_18px_40px_rgba(18,33,43,0.14)]",
              variantStyles[item.variant],
            )}
          >
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-1 text-sm text-slate-600">{item.description}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
