import { useMemo } from "react";
import type { ReactNode } from "react";

export type RefinementQAProps = {
  questionNumber: number;
  totalQuestions: number;
  question: string;
  answer: string;
  onAnswerChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  helperText?: string | null;
  footer?: ReactNode;
};

export function RefinementQA({
  questionNumber,
  totalQuestions,
  question,
  answer,
  onAnswerChange,
  onBack,
  onNext,
  onSubmit,
  canGoBack,
  canGoNext,
  isSubmitting = false,
  submitDisabled = false,
  helperText,
  footer
}: RefinementQAProps) {
  const progress = useMemo(() => {
    if (totalQuestions <= 0) {
      return 0;
    }

    const ratio = (questionNumber + 1) / totalQuestions;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  }, [questionNumber, totalQuestions]);

  const isSubmitDisabled = isSubmitting || submitDisabled || answer.trim().length === 0;

  return (
    <section
      aria-labelledby="refinement-question-title"
      className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6"
    >
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Question {questionNumber + 1} of {Math.max(totalQuestions, questionNumber + 1)}
          </p>
          <span className="inline-flex min-w-[64px] items-center justify-end text-xs text-slate-500">
            {progress}% complete
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 w-full rounded-full bg-slate-800"
        >
          <div
            className="h-2 rounded-full bg-brand transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          id="refinement-question-title"
          className="text-lg font-medium text-slate-100"
        >
          {question}
        </p>
      </header>

      <textarea
        value={answer}
        onChange={(event) => onAnswerChange(event.target.value)}
        className="min-h-[140px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
        placeholder="Compose your response to the refinement question."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-brand hover:text-brand disabled:opacity-50"
            disabled={!canGoBack}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-brand hover:text-brand disabled:opacity-50"
            disabled={!canGoNext}
          >
            Next
          </button>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:bg-brand/60"
            disabled={isSubmitDisabled}
          >
            {isSubmitting ? "Saving..." : "Submit answer"}
          </button>
        </div>
        {footer}
      </div>
    </section>
  );
}
