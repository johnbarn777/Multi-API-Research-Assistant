"use client";

import type {
  ResearchProviderState,
  ResearchReportState,
  ResearchStatus
} from "@/types/research";

export interface ResearchItem {
  id: string;
  ownerUid: string;
  title: string;
  status: ResearchStatus;
  dr: ResearchProviderState;
  gemini: ResearchProviderState;
  report: ResearchReportState;
  createdAt: string;
  updatedAt: string;
}

export interface ListResearchResponse {
  items: ResearchItem[];
  nextCursor: string | null;
}

export interface ResearchResponse {
  item: ResearchItem;
}

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

async function parseErrorResponse(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { error?: string; details?: unknown };
    return {
      message: body.error ?? fallbackMessage,
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
