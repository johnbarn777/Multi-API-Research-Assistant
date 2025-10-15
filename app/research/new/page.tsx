"use client";

import { useState } from "react";
import Link from "next/link";

export default function NewResearchPage() {
  const [title, setTitle] = useState("");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/dashboard" className="text-brand underline">
          Dashboard
        </Link>
        <span>/</span>
        <span>New Research</span>
      </div>
      <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/50 p-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Create a research session</h1>
          <p className="text-sm text-slate-400">
            This form will call the OpenAI Deep Research session initiator backend once wired up. For now we only capture
            local state to illustrate the flow.
          </p>
        </header>
        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <div className="space-y-2">
            <label htmlFor="topic" className="text-sm font-medium text-slate-200">
              Research topic
            </label>
            <input
              id="topic"
              name="topic"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder="e.g., Responsible AI policies in healthcare"
            />
            <p className="text-xs text-slate-500">
              Validation and API hooks will be implemented once the backend contract is ready.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
            >
              Start Refinement
            </button>
            <span className="text-xs text-slate-500">
              Submission currently disabled. Backend scaffolding pending.
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}
