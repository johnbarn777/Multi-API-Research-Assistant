import { NextResponse } from "next/server";

// Placeholder implementation. Actual handler will validate Firebase token,
// ensure Gmail OAuth scope, and return session context for the client.
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "Session endpoint stub. Implement Firebase Auth token exchange here."
    },
    { status: 200 }
  );
}
