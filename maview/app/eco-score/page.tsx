import { AuthGate } from "@/components/auth/auth-gate";
import { EcoScoreWorkspace } from "@/features/eco-score/eco-score-workspace";

export default function EcoScorePage() {
  return (
    <AuthGate>
      <EcoScoreWorkspace />
    </AuthGate>
  );
}
