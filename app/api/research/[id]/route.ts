import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import { serializeResearch } from "@/server/serializers/research";
import { jsonError } from "@/server/http/jsonError";
import { resolveRequestId, withRequestId } from "@/server/http/requestContext";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(request: NextRequest, { params }: Params) {
  const requestId = resolveRequestId(request.headers);
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  const repository = getResearchRepository();

  try {
    const research = await repository.getById(params.id, { ownerUid: sessionOrResponse.uid });

    if (!research) {
      return jsonError({
        code: "research.not_found",
        message: "Research not found",
        status: 404,
        requestId,
        meta: { researchId: params.id }
      });
    }

    const response = NextResponse.json(
      {
        item: serializeResearch(research)
      },
      { status: 200 }
    );
    return withRequestId(response, requestId);
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return jsonError({
        code: "research.detail.failed",
        message: error.message,
        status,
        requestId,
        meta: { researchId: params.id }
      });
    }

    throw error;
  }
}
