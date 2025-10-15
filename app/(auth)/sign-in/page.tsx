"use client";

import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-lg">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold text-white">Sign in</h1>
          <p className="text-sm text-slate-400">
            Google authentication will be wired up via Firebase Auth + Next middleware in a future iteration.
          </p>
        </header>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
        >
          <span role="img" aria-label="google">
            🔒
          </span>
          Continue with Google
        </button>
        <p className="text-center text-xs text-slate-500">
          By signing in you agree to the future Terms of Service. Placeholder UI only.
        </p>
        <Link href="/" className="block text-center text-xs text-brand underline">
          Back to landing page
        </Link>
      </div>
    </main>
  );
}
