import { NextRequest, NextResponse } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import type { Research } from "@/types/research";
import { z } from "zod";

const createResearchSchema = z.object({
  title: z
    .string({ required_error: "title is required" })
    .min(1, "title is required")
    .max(200, "title must be 200 characters or fewer")
});

function serializeResearch(research: Research) {
  return {
    ...research,
    createdAt: research.createdAt.toDate().toISOString(),
    updatedAt: research.updatedAt.toDate().toISOString()
  };
}

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

  try {
    const created = await repository.create({
      ownerUid: sessionOrResponse.uid,
      title: parsed.data.title
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
