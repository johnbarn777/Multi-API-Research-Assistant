import express from "express";
import request from "supertest";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../../middleware";
import { GET } from "../../app/api/research/route";
import { AUTH_HEADER_UID } from "@/server/auth/session";

const verifyIdToken = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: vi.fn(() => ({
    verifyIdToken
  }))
}));

function headersFromNode(headers: NodeJS.Dict<string | string[]>) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string") {
      result.set(key, value);
    } else if (Array.isArray(value)) {
      result.set(key, value.join(","));
    }
  }
  return result;
}

async function applyNextResponse(res: express.Response, nextResponse: NextResponse) {
  nextResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = await nextResponse.text();
  res.status(nextResponse.status).send(body);
}

function createApp() {
  const app = express();

  app.use(express.json());

  app.use(async (req, res, next) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextRequest = new NextRequest(url, {
      method: req.method,
      headers: headersFromNode(req.headers as Record<string, string | string[]>)
    });

    const response = await middleware(nextRequest);
    const shouldContinue = response.headers.get("x-middleware-next") === "1";

    if (!shouldContinue) {
      await applyNextResponse(res, response);
      return;
    }

    const encodedHeaders = response.headers.get("x-middleware-request-headers");
    if (encodedHeaders) {
      const overrides = JSON.parse(
        Buffer.from(encodedHeaders, "base64").toString("utf8")
      ) as Record<string, string>;

      for (const [key, value] of Object.entries(overrides)) {
        req.headers[key.toLowerCase()] = value;
      }
    }

    const overrideKeys = response.headers.get("x-middleware-override-headers");
    if (overrideKeys) {
      for (const key of overrideKeys.split(",")) {
        const value = response.headers.get(`x-middleware-request-${key}`);
        if (value) {
          req.headers[key.toLowerCase()] = value;
        }
      }
    }

    next();
  });

  app.get("/api/research", async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host ?? "localhost"}`);
    const nextReq = new NextRequest(url, {
      method: "GET",
      headers: headersFromNode(req.headers as Record<string, string | string[]>)
    });

    const response = await GET(nextReq);
    await applyNextResponse(res, response);
  });

  return app;
}

describe("API /api/research", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("returns 401 when authorization is missing", async () => {
    const app = createApp();

    const response = await request(app).get("/api/research").expect(401);

    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 200 and forwards auth context when token is valid", async () => {
    verifyIdToken.mockResolvedValue({ uid: "test-user", email: "user@example.com" });
    const app = createApp();

    const response = await request(app)
      .get("/api/research")
      .set("Authorization", "Bearer valid-token")
      .expect(200);

    expect(verifyIdToken).toHaveBeenCalledWith("valid-token");
    expect(response.body.requestedBy).toEqual({ uid: "test-user", email: "user@example.com" });
    expect(response.headers[AUTH_HEADER_UID]).toBeUndefined();
  });
});

describe.skip("API /api/research", () => {
  it("should create a research document and start OpenAI session", async () => {
    // TODO: Implement integration test with Next.js API route + Firestore emulator.
  });
});
