"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type MockQuestion = {
  index: number;
  text: string;
};

export default function ResearchDetailPage() {
  const questions: MockQuestion[] = useMemo(
    () => [
      { index: 1, text: "What is the primary objective of this research topic?" },
      { index: 2, text: "Are there any notable constraints or desired outcomes?" },
      { index: 3, text: "Which regions or industries should we focus on?" }
    ],
    []
  );

  const [current, setCurrent] = useState(0);
  const question = questions[current];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-12">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/dashboard" className="text-brand underline">
          Dashboard
        </Link>
        <span>/</span>
        <span>Research Session</span>
      </div>
      <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/60 p-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Refinement Loop</h1>
          <p className="text-sm text-slate-400">
            OpenAI Deep Research refinement questions will flow through here. Placeholder loop highlights the desired UX.
          </p>
        </header>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Question {question.index} of {questions.length}
          </p>
          <p className="text-lg text-slate-100">{question.text}</p>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="Your answer will be submitted to OpenAI Deep Research backend."
          />
          <div className="flex items-center justify-between">
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-brand hover:text-brand"
              disabled={current === 0}
              onClick={() => setCurrent((prev) => Math.max(prev - 1, 0))}
            >
              Back
            </button>
            <button
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
              disabled={current === questions.length - 1}
              onClick={() => setCurrent((prev) => Math.min(prev + 1, questions.length - 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <section className="grid gap-6 md:grid-cols-2">
        <article className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-6">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">OpenAI Deep Research</h2>
            <span className="rounded-full border border-emerald-500 px-3 py-1 text-xs uppercase text-emerald-400">
              Pending
            </span>
          </header>
          <p className="text-sm text-slate-400">
            Execution progress, polling status, and summarized results will live here. Replace with real-time updates.
          </p>
        </article>
        <article className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-6">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Google Gemini</h2>
            <span className="rounded-full border border-amber-500 px-3 py-1 text-xs uppercase text-amber-400">
              Pending
            </span>
          </header>
          <p className="text-sm text-slate-400">
            Parallel execution results for Gemini will be displayed in this panel after backend integration.
          </p>
        </article>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Final report</h2>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase text-slate-300">
            Awaiting completion
          </span>
        </header>
        <p className="text-sm text-slate-400">
          Once both providers complete, the system will generate a PDF report and email it to the user. This area will
          display download links and delivery status.
        </p>
      </section>
    </main>
  );
}
