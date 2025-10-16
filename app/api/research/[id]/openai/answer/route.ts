import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ensureAuthenticated } from "@/server/auth/session";
import { submitRefinementAnswer } from "@/server/research/refinement";
import { serializeResearch } from "@/server/serializers/research";
import { logger } from "@/lib/utils/logger";

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
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized");
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const payload = await request
    .json()
    .catch(() => null);

  const parsed = answerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  try {
    const result = await submitRefinementAnswer({
      researchId: params.id,
      ownerUid: sessionOrResponse.uid,
      answer: parsed.data.answer,
      questionIndex: parsed.data.questionIndex
    });

    return NextResponse.json(
      {
        item: serializeResearch(result.research),
        nextQuestion: result.nextQuestion,
        finalPrompt: result.finalPrompt
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return NextResponse.json({ error: error.message }, { status });
    }

    logger.error("api.research.answer.unexpected", {
      researchId: params.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "Failed to submit refinement answer" },
      { status: 502 }
    );
  }
}
