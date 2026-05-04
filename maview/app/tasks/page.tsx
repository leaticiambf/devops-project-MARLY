import type { Metadata } from "next";

import { AuthGate } from "@/components/auth/auth-gate";
import { TasksWorkspace } from "@/features/tasks/tasks-workspace";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Keep Google Tasks close to the route and prepare upcoming errands in Mavigo.",
};

export default function TasksPage() {
  return (
    <AuthGate>
      <TasksWorkspace />
    </AuthGate>
  );
}
