import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { getMapboxToken } from "@/lib/config/env";
import { TransportMapWorkspace } from "@/features/map/transport-map-workspace";

export const metadata: Metadata = {
  title: "Transport Map",
  description: "Explore an interactive transport map with live location and color-coded segments.",
};

export default function TransportMapPage() {
  const mapboxToken = getMapboxToken();

  return (
    <AuthGate>
      <TransportMapWorkspace mapboxToken={mapboxToken} />
    </AuthGate>
  );
}
