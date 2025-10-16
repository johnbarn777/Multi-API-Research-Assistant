import { describe, expect, it } from "vitest";
import {
  findQuestionIndex,
  mergeDraftAnswers,
  sortQuestions,
  type DraftAnswers,
  type Question
} from "../../app/research/[id]/state";

describe("refinement state helpers", () => {
  it("sortQuestions orders questions by index ascending", () => {
    const questions: Question[] = [
      { index: 3, text: "Third" },
      { index: 1, text: "First" },
      { index: 2, text: "Second" }
    ];

    const sorted = sortQuestions(questions);

    expect(sorted.map((q) => q.index)).toEqual([1, 2, 3]);
  });

  it("mergeDraftAnswers preserves previous drafts and merges persisted answers", () => {
    const previous: DraftAnswers = {
      1: "Draft one",
      3: "Unsaved third answer",
      99: "Orphaned"
    };
    const answers = [
      { index: 1, answer: "Persisted first" },
      { index: 2, answer: "New persisted answer" }
    ];
    const questions: Question[] = [
      { index: 1, text: "First" },
      { index: 2, text: "Second" },
      { index: 3, text: "Third" }
    ];

    const merged = mergeDraftAnswers(previous, answers, questions);

    expect(merged).toEqual({
      1: "Persisted first",
      2: "New persisted answer",
      3: "Unsaved third answer"
    });
    expect(merged).not.toHaveProperty("99");
  });

  it("findQuestionIndex resolves the best index match", () => {
    const questions: Question[] = [
      { index: 10, text: "Intro" },
      { index: 20, text: "Main" }
    ];

    expect(findQuestionIndex(questions, questions[1])).toBe(1);
    expect(findQuestionIndex(questions, { index: 999, text: "Missing" })).toBe(1);
    expect(findQuestionIndex(questions, null)).toBe(0);
    expect(findQuestionIndex([], null)).toBe(0);
  });
});
