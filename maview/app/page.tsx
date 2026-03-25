import { AuthGate } from "@/components/auth/auth-gate";
import { JourneyWorkspace } from "@/features/journey/journey-workspace";

export default function HomePage() {
  return (
    <AuthGate>
      <JourneyWorkspace />
    </AuthGate>
  );
}
