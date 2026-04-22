import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { JourneyWorkspace } from "@/features/journey/journey-workspace";
import { getMapboxToken } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Journey Planner",
  description: "Plan, start, and adapt public transport journeys in Paris with Mavigo.",
};

export default function HomePage() {
  const mapboxToken = getMapboxToken();

  return (
    <AuthGate>
      <JourneyWorkspace mapboxToken={mapboxToken} />
    </AuthGate>
  );
}
