import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { TourismWorkspace } from "@/features/tourism/tourism-workspace";

export const metadata: Metadata = {
  title: "Explore Paris",
  description:
    "Search restaurants, cafes, and attractions with Yelp or Tripadvisor suggestions inside Mavigo.",
};

export default function ExplorePage() {
  return (
    <AuthGate>
      <TourismWorkspace />
    </AuthGate>
  );
}
