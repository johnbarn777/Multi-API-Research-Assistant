import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { scheduleResearchRun } from "@/server/research/run";
import { serializeResearch } from "@/server/serializers/research";
import { logger } from "@/lib/utils/logger";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, { params }: Params) {
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized");
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  try {
    const { research, alreadyRunning } = await scheduleResearchRun({
      researchId: params.id,
      ownerUid: sessionOrResponse.uid
    });

    return NextResponse.json(
      {
        item: serializeResearch(research),
        alreadyRunning
      },
      { status: alreadyRunning ? 200 : 202 }
    );
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return NextResponse.json(
        { error: error.message },
        { status }
      );
    }

    logger.error("api.research.run.unexpected", {
      researchId: params.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "Failed to start provider execution" },
      { status: 502 }
    );
  }
}
