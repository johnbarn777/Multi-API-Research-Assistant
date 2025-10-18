import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { scheduleResearchRun } from "@/server/research/run";
import { serializeResearch } from "@/server/serializers/research";
import { logger } from "@/lib/utils/logger";
import { jsonError } from "@/server/http/jsonError";
import { resolveRequestId, withRequestId } from "@/server/http/requestContext";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, { params }: Params) {
  const requestId = resolveRequestId(request.headers);
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  try {
    const { research, alreadyRunning } = await scheduleResearchRun({
      researchId: params.id,
      ownerUid: sessionOrResponse.uid,
      requestId
    });

    const response = NextResponse.json(
      {
        item: serializeResearch(research),
        alreadyRunning
      },
      { status: alreadyRunning ? 200 : 202 }
    );
    return withRequestId(response, requestId);
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return jsonError({
        code: "research.run.invalid_state",
        message: error.message,
        status,
        requestId,
        meta: { researchId: params.id }
      });
    }

    logger.error("api.research.run.unexpected", {
      researchId: params.id,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return jsonError({
      code: "research.run.unexpected",
      message: "Failed to start provider execution",
      status: 502,
      requestId,
      meta: { researchId: params.id }
    });
  }
}
