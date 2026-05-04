"use client";

import { useEffect } from "react";

type GoogleLinkCompleteClientProps = {
  email: string | null;
  name: string | null;
};

export function GoogleLinkCompleteClient({
  email,
  name,
}: GoogleLinkCompleteClientProps) {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage(
        {
          type: "GOOGLE_TASKS_LINKED",
          email,
          name,
        },
        window.location.origin,
      );
    }

    const timer = window.setTimeout(() => {
      window.close();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [email, name]);

  return (
    <main className="shell-grid py-16">
      <section className="rounded-xl border border-brand/30 bg-surface p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary font-mono">
          Google Tasks
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Connection complete
        </h1>
        <p className="mt-4 text-sm leading-6 text-secondary">
          {email
            ? `${email} is now connected to Mavigo.`
            : "Your Google Tasks account is now connected."}
        </p>
        <p className="mt-2 text-sm leading-6 text-secondary">
          This window can close automatically.
        </p>
      </section>
    </main>
  );
}
