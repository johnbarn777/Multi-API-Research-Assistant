import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import { serializeResearch } from "../serialize";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(request: NextRequest, { params }: Params) {
  const sessionOrResponse = ensureAuthenticated(request, "Unauthorized");
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const repository = getResearchRepository();

  try {
    const research = await repository.getById(params.id, { ownerUid: sessionOrResponse.uid });

    if (!research) {
      return NextResponse.json({ error: "Research not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        item: serializeResearch(research)
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
