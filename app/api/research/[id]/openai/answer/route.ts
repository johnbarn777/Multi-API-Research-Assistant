import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ensureAuthenticated } from "@/server/auth/session";
import { submitRefinementAnswer } from "@/server/research/refinement";
import { serializeResearch } from "@/server/serializers/research";
import { logger } from "@/lib/utils/logger";
import { jsonError } from "@/server/http/jsonError";
import { resolveRequestId, withRequestId } from "@/server/http/requestContext";

type Params = {
  params: {
    id: string;
  };
};

const answerSchema = z.object({
  answer: z
    .string({ required_error: "answer is required" })
    .min(1, "answer is required"),
  questionIndex: z
    .number({ required_error: "questionIndex is required" })
    .int("questionIndex must be an integer")
    .min(0, "questionIndex must be zero or greater")
});

export async function POST(request: NextRequest, { params }: Params) {
  const requestId = resolveRequestId(request.headers);
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  const payload = await request
    .json()
    .catch(() => null);

  const parsed = answerSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError({
      code: "validation.invalid_request",
      message: "Invalid request",
      status: 400,
      details: parsed.error.flatten().fieldErrors,
      requestId
    });
  }

  try {
    const result = await submitRefinementAnswer({
      researchId: params.id,
      ownerUid: sessionOrResponse.uid,
      answer: parsed.data.answer,
      questionIndex: parsed.data.questionIndex,
      requestId
    });

    const response = NextResponse.json(
      {
        item: serializeResearch(result.research),
        nextQuestion: result.nextQuestion,
        finalPrompt: result.finalPrompt
      },
      { status: 200 }
    );
    return withRequestId(response, requestId);
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return jsonError({
        code: "research.refinement.failed",
        message: error.message,
        status,
        requestId,
        meta: { researchId: params.id }
      });
    }

    logger.error("api.research.answer.unexpected", {
      researchId: params.id,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return jsonError({
      code: "research.refinement.unexpected",
      message: "Failed to submit refinement answer",
      status: 502,
      requestId,
      meta: { researchId: params.id }
    });
  }
}
