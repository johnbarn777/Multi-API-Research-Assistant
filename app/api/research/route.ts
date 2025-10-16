import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { startSession as startOpenAiSession } from "@/lib/providers/openaiDeepResearch";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { serializeResearch } from "@/server/serializers/research";

const createResearchSchema = z.object({
  title: z
    .string({ required_error: "title is required" })
    .min(1, "title is required")
    .max(200, "title must be 200 characters or fewer")
});

export async function GET(request: NextRequest) {
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized");
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const searchParams = request.nextUrl.searchParams;
  const limitParam = searchParams.get("limit");
  const cursorParam = searchParams.get("cursor");

  let limit: number | undefined;
  if (limitParam) {
    const parsedLimit = Number(limitParam);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return NextResponse.json(
        { error: "Invalid limit parameter. Must be an integer between 1 and 50." },
        { status: 400 }
      );
    }
    limit = parsedLimit;
  }

  const repository = getResearchRepository();

  try {
    const { items, nextCursor } = await repository.listByOwner(sessionOrResponse.uid, {
      limit,
      cursor: cursorParam
    });

    return NextResponse.json(
      {
        items: items.map(serializeResearch),
        nextCursor
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized");
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const payload = await request
    .json()
    .catch(() => null);

  const parsed = createResearchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  const repository = getResearchRepository();
  const title = parsed.data.title.trim();

  const openAiSession = await startOpenAiSession({ topic: title }).catch((error) => {
    logger.error("api.research.start_session_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });

  if (!openAiSession) {
    return NextResponse.json(
      { error: "Failed to start OpenAI Deep Research session" },
      { status: 502 }
    );
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

    return NextResponse.json(
      {
        item: serializeResearch(created)
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
