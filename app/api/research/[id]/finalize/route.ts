import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { finalizeResearch } from "@/server/research/finalize";
import { logger } from "@/lib/utils/logger";

type Params = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, { params }: Params) {
  const sessionOrResponse = ensureAuthenticated(request, "Authentication required");
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  try {
    const result = await finalizeResearch({
      researchId: params.id,
      ownerUid: sessionOrResponse.uid,
      userEmail: sessionOrResponse.email
    });

    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Length": result.pdfBuffer.byteLength.toString(),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(result.filename)}"`
    });

    headers.set("X-Storage-Status", result.storageStatus);
    if (result.pdfPath) {
      headers.set("X-Report-Pdf-Path", result.pdfPath);
    }
    if (result.emailResult) {
      headers.set("X-Email-Status", result.emailResult.status);
      headers.set("X-Email-Provider", result.emailResult.provider);
      if (result.emailResult.messageId) {
        headers.set("X-Email-Message-Id", result.emailResult.messageId);
      }
      if (result.emailResult.errorMessage) {
        headers.set("X-Email-Error", result.emailResult.errorMessage);
      }
    }

    return new NextResponse(result.pdfBuffer, {
      status: 200,
      headers
    });
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return NextResponse.json({ error: error.message }, { status });
    }

    logger.error("api.research.finalize.unexpected", {
      researchId: params.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: "Failed to generate research PDF" },
      { status: 502 }
    );
  }
}
