import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { middleware } from "../../middleware";
import {
  AUTH_HEADER_EMAIL,
  AUTH_HEADER_TOKEN,
  AUTH_HEADER_UID
} from "@/server/auth/session";

const mockTokenVerifier = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn()
}));

vi.mock("@/lib/firebase/tokenVerifier", () => mockTokenVerifier);

const verifyFirebaseIdToken = mockTokenVerifier.verifyFirebaseIdToken;

function createRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url), init);
}

function decodeRequestHeaders(response: Response) {
  const serialized = response.headers.get("x-middleware-request-headers");
  if (serialized) {
    const buffer = Buffer.from(serialized, "base64");
    return JSON.parse(buffer.toString("utf8")) as Record<string, string>;
  }

  const overrideKeys = response.headers.get("x-middleware-override-headers");
  if (!overrideKeys) {
    return null;
  }

  const entries: Record<string, string> = {};
  for (const key of overrideKeys.split(",")) {
    const value = response.headers.get(`x-middleware-request-${key}`);
    if (value) {
      entries[key] = value;
    }
  }

  return Object.keys(entries).length > 0 ? entries : null;
}

describe("middleware", () => {
  beforeEach(() => {
    verifyFirebaseIdToken.mockReset();
  });

  it("returns 401 for API routes without credentials", async () => {
    const request = createRequest("http://localhost/api/research");
    const response = await middleware(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated page requests to the landing page", async () => {
    const request = createRequest("http://localhost/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost/sign-in?redirectedFrom=%2Fdashboard"
    );
  });

  it("injects Firebase identity headers when verification succeeds", async () => {
    verifyFirebaseIdToken.mockResolvedValue({
      uid: "abc123",
      email: "user@example.com"
    });

    const request = createRequest("http://localhost/api/research", {
      headers: {
        authorization: "Bearer valid-token"
      }
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(verifyFirebaseIdToken).toHaveBeenCalledWith("valid-token");

    const headers = decodeRequestHeaders(response);
    expect(headers).toBeTruthy();
    expect(headers?.[AUTH_HEADER_UID]).toBe("abc123");
    expect(headers?.[AUTH_HEADER_EMAIL]).toBe("user@example.com");
    expect(headers?.[AUTH_HEADER_TOKEN]).toBe("valid-token");
  });
});
