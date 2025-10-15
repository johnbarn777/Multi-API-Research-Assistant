"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div className="space-y-4">
        <span className="rounded-full bg-brand-muted px-3 py-1 text-sm text-brand">
          Multi-API Deep Research Assistant
        </span>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Research smarter with OpenAI Deep Research and Gemini in one workflow.
        </h1>
        <p className="text-lg text-slate-300 md:text-xl">
          Sign in with Google to launch iterative research, compare providers, generate PDF reports, and share via email.
          Placeholder content until authentication and provider flows are implemented.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="rounded-md bg-brand px-6 py-3 text-white shadow transition hover:bg-brand/90"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/research/new"
          className="rounded-md border border-slate-700 px-6 py-3 text-slate-100 transition hover:border-brand hover:text-brand"
        >
          Create Research
        </Link>
      </div>
    </main>
  );
}
