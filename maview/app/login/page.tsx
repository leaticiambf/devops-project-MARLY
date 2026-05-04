import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Mavigo to resume journeys, tasks, and eco-score progress.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage
        eyebrow="Welcome Back"
        title="Sign in to Mavigo"
        description="Pick up your saved journeys, task-aware routes, and travel preferences in one place."
        alternateHref="/register"
        alternateLabel="Create an account"
      >
        <LoginForm />
      </AuthPage>
    </Suspense>
  );
}
