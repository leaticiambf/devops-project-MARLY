import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { JourneyWorkspace } from "@/features/journey/journey-workspace";

export const metadata: Metadata = {
  title: "Journey Planner",
  description: "Plan, start, and adapt public transport journeys in Paris with Mavigo.",
};

export default function HomePage() {
  return (
    <AuthGate>
      <JourneyWorkspace />
    </AuthGate>
  );
}
