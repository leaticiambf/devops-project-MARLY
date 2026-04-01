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
  success: "border-l-4 border-l-brand bg-surface border border-line text-foreground",
  error: "border-l-4 border-l-danger bg-surface border border-line text-foreground",
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
              "pointer-events-auto rounded-lg p-4 shadow-[0_4px_24px_rgba(0,0,0,0.4)]",
              variantStyles[item.variant],
            )}
          >
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-secondary">{item.description}</p>
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
