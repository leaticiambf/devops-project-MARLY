import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Mavigo account to plan smarter journeys and track your progress.",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage
        eyebrow="New Account"
        title="Create your Mavigo account"
        description="Create your account to plan smarter journeys, connect Google Tasks, and track your eco progress."
        alternateHref="/login"
        alternateLabel="Already have an account?"
      >
        <RegisterForm />
      </AuthPage>
    </Suspense>
  );
}
