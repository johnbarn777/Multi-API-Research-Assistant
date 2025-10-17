import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefinementQA } from "@/components/research/RefinementQA";

describe("RefinementQA", () => {
  it("renders question metadata and progress details", () => {
    render(
      <RefinementQA
        questionNumber={1}
        totalQuestions={4}
        question="How will you measure success?"
        answer="By tracking key metrics."
        onAnswerChange={() => undefined}
        onBack={() => undefined}
        onNext={() => undefined}
        onSubmit={() => undefined}
        canGoBack
        canGoNext
      />
    );

    expect(screen.getByText("Question 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByDisplayValue("By tracking key metrics.")).toBeInTheDocument();
  });

  it("disables submit until an answer is present and fires callbacks", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    const handleBack = vi.fn();
    const handleNext = vi.fn();

    const { rerender } = render(
      <RefinementQA
        questionNumber={0}
        totalQuestions={2}
        question="What is the primary objective?"
        answer=""
        onAnswerChange={() => undefined}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleSubmit}
        canGoBack={false}
        canGoNext={false}
      />
    );

    const submit = screen.getByRole("button", { name: /submit answer/i });
    const back = screen.getByRole("button", { name: "Back" });
    const next = screen.getByRole("button", { name: "Next" });

    expect(submit).toBeDisabled();
    expect(back).toBeDisabled();
    expect(next).toBeDisabled();

    rerender(
      <RefinementQA
        questionNumber={0}
        totalQuestions={2}
        question="What is the primary objective?"
        answer="Grow the user base."
        onAnswerChange={() => undefined}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleSubmit}
        canGoBack
        canGoNext
      />
    );

    expect(submit).not.toBeDisabled();
    expect(back).not.toBeDisabled();
    expect(next).not.toBeDisabled();

    await user.click(submit);
    await user.click(back);
    await user.click(next);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleBack).toHaveBeenCalledTimes(1);
    expect(handleNext).toHaveBeenCalledTimes(1);
  });
});
