"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { hydrateRefinementState } from "./actions";
import {
  findQuestionIndex,
  mergeDraftAnswers,
  sortQuestions,
  type DraftAnswers,
  type Question
} from "./state";
import { RefinementQA } from "@/components/research/RefinementQA";
import { ProviderProgress } from "@/components/research/ProviderProgress";
import { useResearchDetail } from "@/hooks/useResearchDetail";
import { useAuth } from "@/lib/firebase/auth-context";
import type { ResearchItem } from "@/lib/api/researchClient";

type AnswerResponse = {
  item: ResearchItem;
  nextQuestion: Question | null;
  finalPrompt: string | null;
};

type RunResponse = {
  item: ResearchItem;
  alreadyRunning?: boolean;
};

function formatStatus(status: ResearchItem["status"] | undefined) {
  if (!status) {
    return "Unknown";
  }

  return status.replace(/_/g, " ");
}

export default function ResearchDetailPage() {
  const params = useParams<{ id: string }>();
  const researchId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? null;

  const { token } = useAuth();
  const { item: research, isLoading, error, mutate } = useResearchDetail(researchId);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<DraftAnswers>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!researchId) {
      return;
    }

    let canceled = false;
    setIsHydrating(true);

    hydrateRefinementState(researchId, 0)
      .then((state) => {
        if (canceled) {
          return;
        }

        const sorted = sortQuestions(state.questions);
        setQuestions(sorted);
        setFinalPrompt(state.finalPrompt ?? null);
        setDraftAnswers((prev) => mergeDraftAnswers(prev, state.answers, sorted));
        setCurrentIndex(findQuestionIndex(sorted, state.currentQuestion));

        mutate(
          {
            item: state.research
          },
          false
        );
      })
      .catch((err) => {
        if (canceled) {
          return;
        }
        setHydrationError(err instanceof Error ? err.message : "Failed to load refinement state.");
      })
      .finally(() => {
        if (!canceled) {
          setIsHydrating(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [researchId, mutate]);

  useEffect(() => {
    if (!research) {
      return;
    }

    const sorted = sortQuestions(research.dr?.questions ?? []);
    setQuestions(sorted);
    setFinalPrompt(research.dr?.finalPrompt ?? null);
    setDraftAnswers((prev) => mergeDraftAnswers(prev, research.dr?.answers ?? [], sorted));
  }, [research]);

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (questions.length === 0) {
        return 0;
      }
      return Math.min(Math.max(prev, 0), questions.length - 1);
    });
  }, [questions.length]);

  useEffect(() => {
    if (!submitSuccess) {
      return;
    }

    const timer = setTimeout(() => setSubmitSuccess(null), 2500);
    return () => clearTimeout(timer);
  }, [submitSuccess]);

  useEffect(() => {
    if (!runSuccess) {
      return;
    }

    const timer = setTimeout(() => setRunSuccess(null), 2500);
    return () => clearTimeout(timer);
  }, [runSuccess]);

  const currentQuestion = useMemo(
    () => (questions.length > 0 ? questions[currentIndex] ?? null : null),
    [questions, currentIndex]
  );
  const currentAnswer = currentQuestion ? draftAnswers[currentQuestion.index] ?? "" : "";

  const showRefinement =
    research?.status === "awaiting_refinements" || research?.status === "refining";
  const awaitingQuestions =
    showRefinement &&
    !isLoading &&
    !isHydrating &&
    questions.length === 0 &&
    !finalPrompt;

  const helperText = submitError ?? submitSuccess ?? null;
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < questions.length - 1;
  const canStartRun = research?.status === "ready_to_run";
  const isRunInProgress = research?.status === "running";
  const runHelperText = runError ?? runSuccess ?? null;
  const runStatusMeta = (() => {
    switch (research?.status) {
      case "running":
        return { label: "Running", className: "border-amber-400 text-amber-200" };
      case "completed":
        return { label: "Completed", className: "border-emerald-400 text-emerald-200" };
      case "failed":
        return { label: "Failed", className: "border-rose-400 text-rose-200" };
      case "ready_to_run":
        return { label: "Ready", className: "border-emerald-300 text-emerald-100" };
      default:
        return { label: "Pending", className: "border-slate-600 text-slate-300" };
    }
  })();
  const runButtonDisabled = !canStartRun || isStartingRun;
  const emailStatus = research?.report?.emailStatus ?? null;
  const emailedTo = research?.report?.emailedTo ?? null;
  const emailError = research?.report?.emailError ?? null;

  const emailStatusMeta = (() => {
    switch (emailStatus) {
      case "sent":
        return { label: "Email sent", className: "border-emerald-500 text-emerald-100" };
      case "failed":
        return { label: "Email failed", className: "border-rose-500 text-rose-200" };
      case "queued":
        return { label: "Email queued", className: "border-amber-400 text-amber-100" };
      default:
        return { label: "Awaiting delivery", className: "border-slate-700 text-slate-300" };
    }
  })();

  const handleAnswerChange = (value: string) => {
    if (!currentQuestion) {
      return;
    }

    setDraftAnswers((prev) => ({
      ...prev,
      [currentQuestion.index]: value
    }));
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const handleBack = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, Math.max(questions.length - 1, 0)));
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const handleSubmit = async () => {
    if (!researchId || !currentQuestion) {
      return;
    }

    const draft = (draftAnswers[currentQuestion.index] ?? "").trim();
    if (!draft) {
      setSubmitError("Answer is required before submitting");
      setSubmitSuccess(null);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json"
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `/api/research/${encodeURIComponent(researchId)}/openai/answer`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            answer: draft,
            questionIndex: currentQuestion.index
          })
        }
      );

      const body = (await response.json().catch(() => null)) as
        | AnswerResponse
        | { error?: string };

      if (!response.ok || !body || !("item" in body)) {
        const message =
          body && typeof body === "object" && "error" in body && body.error
            ? body.error
            : "Failed to submit refinement answer";
        throw new Error(message);
      }

      const payload = body as AnswerResponse;
      const updatedQuestions = sortQuestions(payload.item.dr?.questions ?? []);
      const updatedAnswers = payload.item.dr?.answers ?? [];

      setQuestions(updatedQuestions);
      setFinalPrompt(payload.finalPrompt ?? payload.item.dr?.finalPrompt ?? null);
      setDraftAnswers((prev) => mergeDraftAnswers(prev, updatedAnswers, updatedQuestions));

      mutate({ item: payload.item }, false);

      if (payload.nextQuestion) {
        const index = updatedQuestions.findIndex(
          (questionItem) => questionItem.index === payload.nextQuestion?.index
        );
        if (index >= 0) {
          setCurrentIndex(index);
        }
      } else if (payload.finalPrompt && updatedQuestions.length > 0) {
        setCurrentIndex(updatedQuestions.length - 1);
      }

      setSubmitSuccess("Answer saved");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit refinement answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartRun = async () => {
    if (!researchId) {
      return;
    }

    setIsStartingRun(true);
    setRunError(null);
    setRunSuccess(null);

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json"
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `/api/research/${encodeURIComponent(researchId)}/run`,
        {
          method: "POST",
          headers
        }
      );

      const body = (await response.json().catch(() => null)) as RunResponse | { error?: string };

      if (!response.ok || !body || !("item" in body)) {
        const message =
          body && typeof body === "object" && "error" in body && body.error
            ? body.error
            : "Failed to start provider execution";
        throw new Error(message);
      }

      mutate({ item: body.item }, false);
      setRunSuccess(body.alreadyRunning ? "Run already in progress" : "Provider execution started");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to start provider execution");
    } finally {
      setIsStartingRun(false);
    }
  };

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
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white">
              {research?.title ?? "Refinement Loop"}
            </h1>
            <p className="text-sm text-slate-400">
              Answer each refinement question to shape the final research prompt. You can revisit previous
              questions at any time before finalizing.
            </p>
          </div>
          <span className="self-start rounded-full border border-slate-700 px-3 py-1 text-xs uppercase text-slate-300">
            {formatStatus(research?.status)}
          </span>
        </header>

        {error ? (
          <div className="rounded-md border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error instanceof Error ? error.message : "Failed to load research session."}
          </div>
        ) : null}

        {hydrationError ? (
          <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-4 text-sm text-amber-200">
            {hydrationError}
          </div>
        ) : null}

        {showRefinement ? (
          questions.length > 0 && currentQuestion ? (
            <RefinementQA
              questionNumber={currentIndex}
              totalQuestions={questions.length}
              question={currentQuestion.text}
              answer={currentAnswer}
              onAnswerChange={handleAnswerChange}
              onBack={handleBack}
              onNext={handleNext}
              onSubmit={handleSubmit}
              canGoBack={canGoBack}
              canGoNext={canGoNext}
              isSubmitting={isSubmitting}
              submitDisabled={isHydrating || !currentQuestion}
              helperText={helperText}
            />
          ) : (
            <div className="rounded-md border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-400">
              {awaitingQuestions
                ? "Waiting for OpenAI Deep Research to provide the first refinement question..."
                : "No refinement questions are available right now. Please check back shortly."}
            </div>
          )
        ) : (
          <div className="rounded-md border border-emerald-600/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            Refinement is complete. Review the final prompt below and continue to provider execution.
          </div>
        )}
      </section>

      {finalPrompt ? (
        <section className="space-y-4 rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-6">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-emerald-100">Refined prompt ready</h2>
              <p className="text-sm text-emerald-200/80">
                This prompt will be used for OpenAI Deep Research and Gemini when you start the run.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span className={`rounded-full border px-3 py-1 text-xs uppercase ${runStatusMeta.className}`}>
                {runStatusMeta.label}
              </span>
              {canStartRun ? (
                <button
                  type="button"
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/90 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                  onClick={handleStartRun}
                  disabled={runButtonDisabled}
                >
                  {isStartingRun ? "Starting..." : "Run providers"}
                </button>
              ) : null}
              {isRunInProgress ? (
                <p className="text-xs text-amber-200">
                  Providers are running. This view refreshes automatically with new progress.
                </p>
              ) : null}
              {runHelperText ? (
                <p className={`text-xs ${runError ? "text-rose-200" : "text-emerald-200"}`}>{runHelperText}</p>
              ) : null}
            </div>
          </header>
          <pre className="max-h-64 overflow-auto rounded-md bg-slate-950/60 px-4 py-3 text-sm text-emerald-100">
            {finalPrompt}
          </pre>
        </section>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        <ProviderProgress provider="openai" state={research?.dr} />
        <ProviderProgress provider="gemini" state={research?.gemini} />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Final report</h2>
          <span
            className={`rounded-full border px-3 py-1 text-xs uppercase ${emailStatusMeta.className}`}
          >
            {emailStatusMeta.label}
          </span>
        </header>
        {emailStatus === "sent" ? (
          <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Report emailed to {emailedTo ?? "your account"}. Check your inbox for the attached PDF.
          </div>
        ) : null}
        {emailStatus === "failed" ? (
          <div className="mb-4 rounded-md border border-rose-500/60 bg-rose-500/10 p-4 text-sm text-rose-100">
            We couldn&apos;t deliver the email automatically.
            {emailError ? <span className="ml-1">Reason: {emailError}</span> : null}
          </div>
        ) : null}
        {emailStatus === "queued" ? (
          <div className="mb-4 rounded-md border border-amber-400/60 bg-amber-400/10 p-4 text-sm text-amber-100">
            The PDF is generating and will be emailed shortly. You will receive a confirmation once delivery
            completes.
          </div>
        ) : null}
        <p className="text-sm text-slate-400">
          Once both providers complete, the system generates a PDF report and emails it to the user. This area
          will display download links and delivery status.
        </p>
      </section>
    </main>
  );
}
