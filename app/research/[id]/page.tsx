"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useResearchDetail } from "@/hooks/useResearchDetail";
import type { ResearchProviderState } from "@/types/research";

function getQuestions(dr: ResearchProviderState | undefined) {
  return dr?.questions ?? [];
}

export default function ResearchDetailPage() {
  const params = useParams<{ id: string }>();
  const researchId = Array.isArray(params?.id) ? params?.id[0] : params?.id ?? null;

  const { item: research, isLoading, error } = useResearchDetail(researchId);
  const questions = useMemo(() => getQuestions(research?.dr), [research?.dr]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    setCurrent(0);
  }, [questions.length, research?.id]);

  const safeIndex = Math.min(current, Math.max(questions.length - 1, 0));
  const question = questions[safeIndex];
  const hasQuestions = questions.length > 0;

  const disableBack = !hasQuestions || safeIndex === 0;
  const disableNext = !hasQuestions || safeIndex >= questions.length - 1;

  const awaitingQuestions = !isLoading && !hasQuestions;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-12">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/dashboard" className="text-brand underline">
          Dashboard
        </Link>
        <span>/</span>
        <span>{research?.title ?? "Research Session"}</span>
      </div>

      <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/60 p-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">
            {research?.title ?? "Refinement Loop"}
          </h1>
          <p className="text-sm text-slate-400">
            Answer each refinement question from OpenAI Deep Research to shape the final prompt. Questions appear
            automatically once the session starts.
          </p>
        </header>

        {error ? (
          <div className="rounded-md border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error instanceof Error ? error.message : "Failed to load research session."}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-800" />
            <div className="h-5 w-full animate-pulse rounded bg-slate-800" />
            <div className="h-32 w-full animate-pulse rounded bg-slate-800" />
            <div className="flex items-center justify-between">
              <div className="h-10 w-24 animate-pulse rounded bg-slate-800" />
              <div className="h-10 w-32 animate-pulse rounded bg-slate-800" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {hasQuestions ? (
              <>
                <p className="text-sm text-slate-400">
                  Question {safeIndex + 1} of {questions.length}
                </p>
                <p className="text-lg text-slate-100">{question?.text}</p>
              </>
            ) : (
              <div className="rounded-md border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-400">
                {awaitingQuestions
                  ? "We are waiting for OpenAI Deep Research to provide the first refinement question."
                  : "No refinement questions available yet."}
              </div>
            )}

            <textarea
              className="min-h-[120px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder={
                hasQuestions
                  ? "Your answer will be submitted once the refinement API is connected."
                  : "Answers will be enabled when questions arrive."
              }
              disabled={!hasQuestions}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disableBack}
                onClick={() => setCurrent((prev) => Math.max(prev - 1, 0))}
              >
                Back
              </button>
              <span className="text-xs text-slate-500">
                Submission will be wired once the answer endpoint is available.
              </span>
              <button
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disableNext}
                onClick={() => setCurrent((prev) => Math.min(prev + 1, questions.length - 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
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
