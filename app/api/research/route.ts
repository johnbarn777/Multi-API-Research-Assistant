import { NextRequest, NextResponse } from "next/server";

// TODO: Replace mock data with Firestore queries filtered by the authenticated user.
const mockResearchList = [
  {
    id: "stub-1",
    title: "Responsible AI policy scan",
    status: "completed",
    createdAt: new Date().toISOString()
  }
];

export async function GET() {
  return NextResponse.json({ items: mockResearchList }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) ?? {};

  return NextResponse.json(
    {
      message: "Create research stub. Wire up OpenAI Deep Research session creation.",
      received: body
    },
    { status: 202 }
  );
}
