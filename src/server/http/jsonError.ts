import { NextResponse } from "next/server";

export interface JsonErrorOptions {
  code: string;
  message: string;
  status?: number;
  retryAfterMs?: number;
  headers?: HeadersInit;
  details?: unknown;
  meta?: Record<string, unknown>;
  requestId?: string;
}

export function jsonError({
  code,
  message,
  status = 500,
  retryAfterMs,
  headers,
  details,
  meta,
  requestId
}: JsonErrorOptions): NextResponse {
  const responseHeaders = new Headers(headers);
  const body: Record<string, unknown> = {
    code,
    message
  };

  if (requestId) {
    body.requestId = requestId;
  }

  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)) {
    const sanitized = Math.max(0, Math.floor(retryAfterMs));
    body.retryAfterMs = sanitized;
    // Translate milliseconds into seconds for the HTTP header.
    const retryAfterSeconds = Math.max(0, Math.ceil(sanitized / 1000));
    responseHeaders.set("Retry-After", retryAfterSeconds.toString());
  }

  if (details !== undefined) {
    body.details = details;
  }

  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (key === "code" || key === "message" || (key === "retryAfterMs" && retryAfterMs !== undefined)) {
        continue;
      }
      body[key] = value;
    }
  }

  if (requestId) {
    responseHeaders.set("X-Request-Id", requestId);
  }

  return NextResponse.json(body, {
    status,
    headers: responseHeaders
  });
}
