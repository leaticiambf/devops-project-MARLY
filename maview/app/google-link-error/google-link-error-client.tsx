"use client";

type GoogleLinkErrorClientProps = {
  error: string | null;
};

export function GoogleLinkErrorClient({ error }: GoogleLinkErrorClientProps) {
  return (
    <main className="shell-grid py-16">
      <section className="rounded-xl border border-danger/30 bg-surface p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-danger font-mono">
          Google Tasks
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Connection failed
        </h1>
        <p className="mt-4 text-sm leading-6 text-secondary">
          {error || "We could not finish linking this Google account."}
        </p>
        <p className="mt-2 text-sm leading-6 text-secondary">
          You can close this window and try again.
        </p>
      </section>
    </main>
  );
}
