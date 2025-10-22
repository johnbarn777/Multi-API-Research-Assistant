"use client";

import type { ListResearchResponse, ResearchResponse } from "@/types/api";
export type {
  ResearchListItem as ResearchItem,
  ListResearchResponse,
  ResearchResponse
} from "@/types/api";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function extractFirstDetail(details: unknown): string | null {
  if (!details || typeof details !== "object") {
    return null;
  }

  if (Array.isArray(details)) {
    for (const item of details) {
      const message = extractFirstDetail(item);
      if (message) {
        return message;
      }
    }
    return null;
  }

  for (const value of Object.values(details as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim()) {
          return entry;
        }
      }
    }
    if (value && typeof value === "object") {
      const nested = extractFirstDetail(value);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

async function parseErrorResponse(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
      code?: string;
      details?: unknown;
    };

    const detailMessage = extractFirstDetail(body.details);
    const baseMessage = body.error ?? body.message ?? body.code ?? null;
    let message: string;

    if (detailMessage) {
      if (baseMessage) {
        const separator = baseMessage.endsWith(":") ? " " : ": ";
        message = `${baseMessage}${separator}${detailMessage}`;
      } else {
        message = detailMessage;
      }
    } else {
      message = baseMessage ?? fallbackMessage;
    }

    return {
      message,
      details: body.details
    };
  } catch {
    return {
      message: fallbackMessage,
      details: null
    };
  }
}

async function ensureResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  const { message, details } = await parseErrorResponse(response, fallbackMessage);
  throw new ApiError(response.status, message, details);
}

export async function listResearch({
  token,
  limit,
  cursor
}: {
  token: string;
  limit?: number;
  cursor?: string | null;
}): Promise<ListResearchResponse> {
  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  const params = new URLSearchParams();
  if (limit) {
    params.set("limit", String(limit));
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/research${params.size ? `?${params.toString()}` : ""}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return ensureResponse<ListResearchResponse>(response, "Failed to load research sessions");
}

export async function createResearch({
  token,
  title
}: {
  token: string;
  title: string;
}): Promise<ResearchResponse> {
  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  const response = await fetch("/api/research", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });

  return ensureResponse<ResearchResponse>(response, "Failed to create research session");
}

export async function getResearch({
  token,
  id
}: {
  token: string;
  id: string;
}): Promise<ResearchResponse> {
  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  const response = await fetch(`/api/research/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return ensureResponse<ResearchResponse>(response, "Failed to load research session");
}

export type CreateResearchResponse = ResearchResponse;
