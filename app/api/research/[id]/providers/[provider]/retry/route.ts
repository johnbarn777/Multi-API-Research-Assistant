import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { logger } from "@/lib/utils/logger";
import { ensureAuthenticated } from "@/server/auth/session";
import { jsonError } from "@/server/http/jsonError";
import { resolveRequestId, withRequestId } from "@/server/http/requestContext";
import { retryProviderRun } from "@/server/research/run";
import { serializeResearch } from "@/server/serializers/research";

type Params = {
  params: {
    id: string;
    provider: string;
  };
};

const SUPPORTED_PROVIDERS = new Set<"openai" | "gemini">(["openai", "gemini"]);

export async function POST(request: NextRequest, { params }: Params) {
  const requestId = resolveRequestId(request.headers);
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  if (!SUPPORTED_PROVIDERS.has(params.provider as "openai" | "gemini")) {
    return withRequestId(
      jsonError({
        code: "research.provider.unsupported",
        message: `Provider ${params.provider} is not supported`,
        status: 400,
        requestId,
        meta: {
          provider: params.provider
        }
      }),
      requestId
    );
  }

  try {
    const { research, alreadyRunning } = await retryProviderRun({
      provider: params.provider as "openai" | "gemini",
      researchId: params.id,
      ownerUid: sessionOrResponse.uid,
      userEmail: sessionOrResponse.email,
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
      return withRequestId(
        jsonError({
          code: "research.provider.retry_invalid_state",
          message: error.message,
          status,
          requestId,
          meta: { researchId: params.id, provider: params.provider }
        }),
        requestId
      );
    }

    logger.error("api.research.provider.retry_unexpected", {
      researchId: params.id,
      provider: params.provider,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return withRequestId(
      jsonError({
        code: "research.provider.retry_unexpected",
        message: "Failed to retry provider execution",
        status: 502,
        requestId,
        meta: { researchId: params.id, provider: params.provider }
      }),
      requestId
    );
  }
}
