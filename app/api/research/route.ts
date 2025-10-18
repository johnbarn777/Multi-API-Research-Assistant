import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { isDemoMode } from "@/config/features";
import { startSession as startOpenAiSession } from "@/lib/providers/openaiDeepResearch";
import { createDemoResearchSession } from "@/lib/demo/demoFixtures";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { serializeResearch } from "@/server/serializers/research";
import { jsonError } from "@/server/http/jsonError";
import { resolveRequestId, withRequestId } from "@/server/http/requestContext";

const createResearchSchema = z.object({
  title: z
    .string({ required_error: "title is required" })
    .min(1, "title is required")
    .max(200, "title must be 200 characters or fewer")
});

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers);
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  const searchParams = request.nextUrl.searchParams;
  const limitParam = searchParams.get("limit");
  const cursorParam = searchParams.get("cursor");

  let limit: number | undefined;
    if (limitParam) {
      const parsedLimit = Number(limitParam);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
        return jsonError({
          code: "research.list.invalid_limit",
          message: "Invalid limit parameter. Must be an integer between 1 and 50.",
          status: 400,
          requestId
        });
      }
      limit = parsedLimit;
    }

  const repository = getResearchRepository();

  try {
    const { items, nextCursor } = await repository.listByOwner(sessionOrResponse.uid, {
      limit,
      cursor: cursorParam
    });

    const response = NextResponse.json(
      {
        items: items.map(serializeResearch),
        nextCursor
      },
      { status: 200 }
    );
    return withRequestId(response, requestId);
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return jsonError({
        code: "research.list.failed",
        message: error.message,
        status,
        requestId
      });
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request.headers);
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  const payload = await request
    .json()
    .catch(() => null);

  const parsed = createResearchSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError({
      code: "validation.invalid_request",
      message: "Invalid request",
      status: 400,
      details: parsed.error.flatten().fieldErrors,
      requestId
    });
  }

  const repository = getResearchRepository();
  const title = parsed.data.title.trim();

  logger.info("api.research.create.start", {
    requestId,
    ownerUid: sessionOrResponse.uid,
    titleLength: title.length
  });

  const demoMode = isDemoMode();

  const openAiSession = demoMode
    ? createDemoResearchSession(title)
    : await startOpenAiSession({ topic: title }).catch((error) => {
        logger.error("api.research.start_session_failed", {
          requestId,
          ownerUid: sessionOrResponse.uid,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      });

  if (!openAiSession) {
    return jsonError({
      code: "research.create.openai_start_failed",
      message: "Failed to start OpenAI Deep Research session",
      status: 502,
      requestId
    });
  }

  try {
    const created = await repository.create({
      ownerUid: sessionOrResponse.uid,
      title,
      status: openAiSession.questions.length > 0 ? "refining" : "awaiting_refinements",
      dr: {
        sessionId: openAiSession.sessionId,
        questions: openAiSession.questions
      }
    });

    logger.info("api.research.create.success", {
      requestId,
      ownerUid: sessionOrResponse.uid,
      researchId: created.id,
      initialQuestionCount: openAiSession.questions.length,
      demoMode
    });

    const response = NextResponse.json(
      {
        item: serializeResearch(created)
      },
      { status: 201 }
    );
    return withRequestId(response, requestId);
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return jsonError({
        code: "research.create.failed",
        message: error.message,
        status,
        requestId
      });
    }

    throw error;
  }
}
