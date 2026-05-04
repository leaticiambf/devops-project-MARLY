import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { EcoScoreWorkspace } from "@/features/eco-score/eco-score-workspace";

export const metadata: Metadata = {
  title: "Eco Score",
  description: "Track carbon savings, badges, and greener travel progress in Mavigo.",
};

export default function EcoScorePage() {
  return (
    <AuthGate>
      <EcoScoreWorkspace />
    </AuthGate>
  );
}
