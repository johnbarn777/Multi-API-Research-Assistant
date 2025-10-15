import { NextRequest, NextResponse } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";

// TODO: Replace mock data with Firestore queries filtered by the authenticated user.
const mockResearchList = [
  {
    id: "stub-1",
    title: "Responsible AI policy scan",
    status: "completed",
    createdAt: new Date().toISOString()
  }
];

export async function GET(request: NextRequest) {
  const sessionOrResponse = ensureAuthenticated(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  return NextResponse.json(
    {
      items: mockResearchList,
      requestedBy: {
        uid: sessionOrResponse.uid,
        email: sessionOrResponse.email
      }
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  const sessionOrResponse = ensureAuthenticated(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const body = (await request.json().catch(() => null)) ?? {};

  return NextResponse.json(
    {
      message: "Create research stub. Wire up OpenAI Deep Research session creation.",
      received: body,
      requestedBy: {
        uid: sessionOrResponse.uid,
        email: sessionOrResponse.email
      }
    },
    { status: 202 }
  );
}
