import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAuthenticated } from "@/server/auth/session";
import { finalizeResearch } from "@/server/research/finalize";
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
  const sessionOrResponse = ensureAuthenticated(request, "Authentication required", requestId);
  if (sessionOrResponse instanceof NextResponse) {
    return withRequestId(sessionOrResponse, requestId);
  }

  try {
    const result = await finalizeResearch({
      researchId: params.id,
      ownerUid: sessionOrResponse.uid,
      userEmail: sessionOrResponse.email,
      requestId
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
      if (result.emailResult.preview) {
        const encodedPreview = Buffer.from(result.emailResult.preview, "utf8").toString("base64");
        headers.set("X-Email-Preview-Base64", encodedPreview);
      }
    }

    const response = new NextResponse(result.pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers
    });
    return withRequestId(response, requestId);
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      const status = (error as { statusCode: number }).statusCode;
      return jsonError({
        code: "research.finalize.invalid_state",
        message: error.message,
        status,
        requestId,
        meta: { researchId: params.id }
      });
    }

    logger.error("api.research.finalize.unexpected", {
      researchId: params.id,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    return jsonError({
      code: "research.finalize.unexpected",
      message: "Failed to generate research PDF",
      status: 502,
      requestId,
      meta: { researchId: params.id }
    });
  }
}
