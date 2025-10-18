import { submitAnswer as submitOpenAiAnswer } from "@/lib/providers/openaiDeepResearch";
import { logger } from "@/lib/utils/logger";
import {
  getResearchRepository,
  type ResearchRepository
} from "@/server/repositories/researchRepository";
import type { Research, ResearchStatus } from "@/types/research";

const REFINEMENT_STATUSES = new Set<ResearchStatus>(["awaiting_refinements", "refining"]);

export interface SubmitRefinementAnswerInput {
  researchId: string;
  ownerUid: string;
  answer: string;
  questionIndex: number;
  requestId?: string;
}

export interface SubmitRefinementAnswerResult {
  research: Research;
  nextQuestion: { index: number; text: string } | null;
  finalPrompt: string | null;
}

function getRepository(): ResearchRepository {
  return getResearchRepository();
}

function sanitizeAnswer(answer: string): string {
  return answer.trim();
}

function upsertAnswer(
  current: Array<{ index: number; answer: string }> | undefined,
  entry: { index: number; answer: string }
) {
  const next = (current ?? []).filter((item) => item.index !== entry.index);
  next.push(entry);
  next.sort((a, b) => a.index - b.index);
  return next;
}

function upsertQuestion(
  current: Array<{ index: number; text: string }> | undefined,
  entry: { index: number; text: string }
) {
  if (!entry.text.trim()) {
    return current ?? [];
  }

  const next = (current ?? []).filter((item) => item.index !== entry.index);
  next.push(entry);
  next.sort((a, b) => a.index - b.index);
  return next;
}

function resolveStatusTransition(current: ResearchStatus, finalPrompt: string | null): ResearchStatus | undefined {
  if (finalPrompt) {
    return "ready_to_run";
  }

  if (current === "awaiting_refinements") {
    return "refining";
  }

  return undefined;
}

export async function submitRefinementAnswer({
  researchId,
  ownerUid,
  answer,
  questionIndex,
  requestId
}: SubmitRefinementAnswerInput): Promise<SubmitRefinementAnswerResult> {
  const repository = getRepository();
  const research = await repository.getById(researchId, { ownerUid });

  if (!research) {
    throw Object.assign(new Error(`Research ${researchId} was not found`), { statusCode: 404 });
  }

  if (!REFINEMENT_STATUSES.has(research.status)) {
    throw Object.assign(
      new Error(`Research ${researchId} is not accepting refinement answers`),
      { statusCode: 409 }
    );
  }

  const sessionId = research.dr.sessionId?.trim();
  if (!sessionId) {
    throw Object.assign(new Error("Research session is missing OpenAI Deep Research sessionId"), {
      statusCode: 409
    });
  }

  if (research.dr.finalPrompt) {
    throw Object.assign(
      new Error("Final prompt already recorded for this research"),
      { statusCode: 409 }
    );
  }

  const sanitizedAnswer = sanitizeAnswer(answer);
  if (!sanitizedAnswer) {
    throw Object.assign(new Error("Answer cannot be empty"), { statusCode: 400 });
  }

  logger.info("research.refinement.submit", {
    researchId,
    ownerUid,
    questionIndex,
    requestId
  });

  const providerResponse = await submitOpenAiAnswer({
    sessionId,
    answer: sanitizedAnswer
  });

  const nextQuestion = providerResponse.nextQuestion ?? null;
  const finalPrompt = providerResponse.finalPrompt?.trim() || null;

  logger.info("research.refinement.provider_response", {
    researchId,
    ownerUid,
    requestId,
    questionIndex,
    nextQuestionIndex: nextQuestion?.index ?? null,
    finalPromptCaptured: Boolean(finalPrompt)
  });

  const nextAnswers = upsertAnswer(research.dr.answers, {
    index: questionIndex,
    answer: sanitizedAnswer
  });

  const nextQuestions =
    nextQuestion !== null
      ? upsertQuestion(research.dr.questions, nextQuestion)
      : research.dr.questions ?? [];

  const status = resolveStatusTransition(research.status, finalPrompt);

  const updated = await repository.update(
    researchId,
    {
      status,
      dr: {
        answers: nextAnswers,
        questions: nextQuestions,
        ...(finalPrompt ? { finalPrompt } : {})
      }
    },
    { ownerUid }
  );

  logger.info("research.refinement.persisted", {
    researchId,
    ownerUid,
    requestId,
    nextStatus: status ?? research.status,
    recordedAnswers: nextAnswers.length,
    hasFinalPrompt: Boolean(finalPrompt)
  });

  return {
    research: updated,
    nextQuestion,
    finalPrompt
  };
}

export interface RefinementHydrationState {
  research: Research;
  questions: Array<{ index: number; text: string }>;
  answers: Array<{ index: number; answer: string }>;
  currentQuestion: { index: number; text: string } | null;
  nextQuestion: { index: number; text: string } | null;
  previousQuestion: { index: number; text: string } | null;
  totalQuestions: number;
  finalPrompt: string | null;
}

export async function getRefinementHydrationState({
  researchId,
  ownerUid,
  currentIndex
}: {
  researchId: string;
  ownerUid: string;
  currentIndex: number;
}): Promise<RefinementHydrationState> {
  const repository = getRepository();
  const research = await repository.getById(researchId, { ownerUid });

  if (!research) {
    throw Object.assign(new Error(`Research ${researchId} was not found`), { statusCode: 404 });
  }

  const questions = [...(research.dr.questions ?? [])].sort((a, b) => a.index - b.index);
  const answers = [...(research.dr.answers ?? [])].sort((a, b) => a.index - b.index);
  const totalQuestions = questions.length;
  const hasQuestions = totalQuestions > 0;
  const safeIndex = hasQuestions
    ? Math.min(Math.max(currentIndex, 0), totalQuestions - 1)
    : 0;
  const currentQuestion = hasQuestions ? questions[safeIndex] ?? null : null;
  const previousQuestion = hasQuestions && safeIndex > 0 ? questions[safeIndex - 1] : null;
  const nextQuestion =
    hasQuestions && safeIndex < totalQuestions - 1 ? questions[safeIndex + 1] : null;

  return {
    research,
    questions,
    currentQuestion,
    answers,
    nextQuestion,
    previousQuestion,
    totalQuestions,
    finalPrompt: research.dr.finalPrompt ?? null
  };
}
