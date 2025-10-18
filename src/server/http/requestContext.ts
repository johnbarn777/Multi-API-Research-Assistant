import type { NextResponse } from "next/server";

const REQUEST_ID_HEADERS = ["x-request-id", "x-vercel-id", "traceparent"] as const;
const RESPONSE_HEADER_NAME = "X-Request-Id";

function normalizeCandidate(value: string, header: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (header === "traceparent") {
    const [version, traceId] = trimmed.split("-");
    if (version && traceId && traceId.length > 0) {
      return traceId;
    }
  }

  return trimmed;
}

function generateRequestId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveRequestId(headers: Headers, fallback?: string): string {
  for (const header of REQUEST_ID_HEADERS) {
    const value = headers.get(header);
    if (typeof value === "string") {
      const resolved = normalizeCandidate(value, header);
      if (resolved) {
        return resolved;
      }
    }
  }

  return fallback ?? generateRequestId();
}

export function withRequestId(response: NextResponse, requestId: string): NextResponse {
  if (!requestId) {
    return response;
  }

  response.headers.set(RESPONSE_HEADER_NAME, requestId);
  return response;
}
