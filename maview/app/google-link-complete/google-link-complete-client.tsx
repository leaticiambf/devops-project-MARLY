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
      <section className="glass-panel rounded-[28px] p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          Google Tasks
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Connection complete
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {email
            ? `${email} is now connected to Mavigo.`
            : "Your Google Tasks account is now connected."}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This window can close automatically.
        </p>
      </section>
    </main>
  );
}
