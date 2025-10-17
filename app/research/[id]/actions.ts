"use server";

import { headers } from "next/headers";
import { requireAuth } from "@/server/auth/session";
import { getRefinementHydrationState } from "@/server/research/refinement";
import { serializeResearch } from "@/server/serializers/research";

export async function hydrateRefinementState(researchId: string, currentIndex = 0) {
  const session = requireAuth(headers());

  const state = await getRefinementHydrationState({
    researchId,
    ownerUid: session.uid,
    currentIndex
  });

  return {
    research: serializeResearch(state.research),
    questions: state.questions,
    answers: state.answers,
    currentQuestion: state.currentQuestion,
    nextQuestion: state.nextQuestion,
    previousQuestion: state.previousQuestion,
    totalQuestions: state.totalQuestions,
    finalPrompt: state.finalPrompt
  };
}
