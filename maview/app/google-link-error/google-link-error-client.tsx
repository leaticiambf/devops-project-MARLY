"use client";

type GoogleLinkErrorClientProps = {
  error: string | null;
};

export function GoogleLinkErrorClient({ error }: GoogleLinkErrorClientProps) {
  return (
    <main className="shell-grid py-16">
      <section className="glass-panel rounded-[28px] border border-rose-200 p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-700">
          Google Tasks
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Connection failed
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {error || "We could not finish linking this Google account."}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          You can close this window and try again.
        </p>
      </section>
    </main>
  );
}
