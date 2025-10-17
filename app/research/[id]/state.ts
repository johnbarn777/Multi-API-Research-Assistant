export type Question = { index: number; text: string };
export type Answer = { index: number; answer: string };
export type DraftAnswers = Record<number, string>;

export function sortQuestions(questions: Question[] | undefined | null): Question[] {
  return [...(questions ?? [])].sort((a, b) => a.index - b.index);
}

export function mergeDraftAnswers(
  previous: DraftAnswers,
  answers: Answer[],
  questions: Question[]
): DraftAnswers {
  const allowed = new Set(questions.map((item) => item.index));
  const next: DraftAnswers = {};

  for (const [key, value] of Object.entries(previous)) {
    const index = Number(key);
    if (allowed.has(index)) {
      next[index] = value;
    }
  }

  for (const answer of answers) {
    next[answer.index] = answer.answer;
  }

  return next;
}

export function findQuestionIndex(questions: Question[], target: Question | null | undefined): number {
  if (!target) {
    return 0;
  }

  const match = questions.findIndex((question) => question.index === target.index);
  if (match >= 0) {
    return match;
  }

  return Math.max(questions.length - 1, 0);
}
