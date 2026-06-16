import type { Metadata } from "next";

import { ComfortPresetsWorkspace } from "@/features/comfort-presets/comfort-presets-workspace";

export const metadata: Metadata = {
  title: "Comfort Presets",
  description: "Manage saved route comfort preferences.",
};

export default function ComfortPresetsPage() {
  return <ComfortPresetsWorkspace />;
}
