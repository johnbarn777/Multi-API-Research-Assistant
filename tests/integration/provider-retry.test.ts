import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/config/env";
import { generateContent as generateGeminiContent } from "@/lib/providers/gemini";
import { logger } from "@/lib/utils/logger";

const ORIGINAL_ENV = { ...process.env };

function setTestEnv() {
  process.env.FIREBASE_PROJECT_ID = "test-project";
  process.env.FIREBASE_CLIENT_EMAIL = "service@test.dev";
  process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.OPENAI_DR_BASE_URL = "https://openai.example.com";
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.GEMINI_BASE_URL = "https://gemini.example.com";
  process.env.GEMINI_MODEL = "models/test";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://example.com/oauth";
  process.env.GOOGLE_OAUTH_SCOPES = "scope";
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.FROM_EMAIL = "reports@example.com";
  process.env.APP_BASE_URL = "https://app.example.com";
  process.env.SENDGRID_API_KEY = "sendgrid-key";
}

describe("Provider retry integration", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    setTestEnv();
    resetEnvCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...ORIGINAL_ENV };
    resetEnvCache();
    vi.restoreAllMocks();
  });

  it("retries Gemini requests after transient 5xx failures", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      attempt += 1;
      if (attempt <= 2) {
        return new Response(JSON.stringify({ error: { message: "upstream failure" } }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Gemini result" }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const warnSpy = vi.spyOn(logger, "warn");
    const errorSpy = vi.spyOn(logger, "error");

    const app = express();
    app.get("/gemini", async (_req, res) => {
      try {
        const result = await generateGeminiContent({ prompt: "Test prompt" });
        res.status(200).json({ ok: true, text: result.summary });
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    const response = await request(app).get("/gemini").expect(200);

    expect(response.body).toEqual({ ok: true, text: "Gemini result" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(
      warnSpy.mock.calls.every(([message]) => message === "gemini.request.retry")
    ).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
