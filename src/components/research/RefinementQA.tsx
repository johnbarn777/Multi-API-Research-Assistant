import type { ReactNode } from "react";

export type RefinementQAProps = {
  index: number;
  total: number;
  question: string;
  answer: string;
  onAnswerChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  footer?: ReactNode;
};

export function RefinementQA({
  index,
  total,
  question,
  answer,
  onAnswerChange,
  onPrev,
  onNext,
  footer
}: RefinementQAProps) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Question {index + 1} of {total}
      </p>
      <p className="text-lg font-medium text-slate-100">{question}</p>
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
            onClick={onPrev}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-brand hover:text-brand disabled:opacity-50"
            disabled={index === 0}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:bg-brand/60"
            disabled={index === total - 1}
          >
            Next
          </button>
        </div>
        {footer}
      </div>
    </div>
  );
}
