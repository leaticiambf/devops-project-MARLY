import { Suspense } from "react";

import { AuthPage } from "@/components/auth/auth-page";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage
        eyebrow="JWT Session"
        title="Sign in to Mavigo"
        description="The Next frontend keeps the current v1 auth model: JWT for API requests, Spring session for Google Tasks OAuth."
        alternateHref="/register"
        alternateLabel="Create an account"
      >
        <LoginForm />
      </AuthPage>
    </Suspense>
  );
}
