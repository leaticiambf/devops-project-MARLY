import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { TourismWorkspace } from "@/features/tourism/tourism-workspace";
import { getMapboxToken } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Explore Paris",
  description:
    "Search restaurants, cafes, and attractions with Yelp or Tripadvisor suggestions inside Mavigo.",
};

export default function ExplorePage() {
  const mapboxToken = getMapboxToken();

  return (
    <AuthGate>
      <TourismWorkspace mapboxToken={mapboxToken} />
    </AuthGate>
  );
}
