import { Suspense } from "react";

import { AuthPage } from "@/components/auth/auth-page";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage
        eyebrow="New Account"
        title="Create your Mavigo account"
        description="Registration still provisions the backend user first, then stores the JWT locally for the new App Router client."
        alternateHref="/login"
        alternateLabel="Already have an account?"
      >
        <RegisterForm />
      </AuthPage>
    </Suspense>
  );
}
