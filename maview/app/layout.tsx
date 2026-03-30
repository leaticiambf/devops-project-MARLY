import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { getAppUrl } from "@/lib/config/env";
import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "Mavigo",
    template: "%s | Mavigo",
  },
  description:
    "Plan public transport journeys, coordinate tasks, and track greener travel choices with Mavigo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
