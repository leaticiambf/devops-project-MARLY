import { AuthGate } from "@/components/auth/auth-gate";
import { TasksWorkspace } from "@/features/tasks/tasks-workspace";

export default function TasksPage() {
  return (
    <AuthGate>
      <TasksWorkspace />
    </AuthGate>
  );
}
