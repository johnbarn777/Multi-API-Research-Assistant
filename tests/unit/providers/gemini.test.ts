import { http, HttpResponse } from "msw";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { getServerEnv, resetEnvCache } from "@/config/env";
import { generateContent } from "@/lib/providers/gemini";
import { server } from "@/tests/mocks/server";

const REQUIRED_ENV: Record<string, string> = {
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_CLIENT_EMAIL: "firebase-admin@test-project.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nline1\\nline2\\n-----END PRIVATE KEY-----",
  OPENAI_API_KEY: "openai-test-key",
  OPENAI_DR_BASE_URL: "https://api.openai.com/v1",
  GEMINI_API_KEY: "gemini-test-key",
  GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1",
  GEMINI_MODEL: "gemini-2.0-pro",
  GOOGLE_OAUTH_CLIENT_ID: "oauth-client-id.apps.googleusercontent.com",
  GOOGLE_OAUTH_CLIENT_SECRET: "oauth-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://example.com/oauth/callback",
  GOOGLE_OAUTH_SCOPES: "https://www.googleapis.com/auth/gmail.send",
  TOKEN_ENCRYPTION_KEY: "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  FROM_EMAIL: "noreply@example.com",
  APP_BASE_URL: "http://localhost:3000",
  NEXT_PUBLIC_FIREBASE_API_KEY: "public-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc"
};

const OPTIONAL_ENV_KEYS = ["SENDGRID_API_KEY", "FIREBASE_STORAGE_BUCKET"] as const;
const ORIGINAL_ENV: Partial<Record<string, string | undefined>> = {};

function applyEnv(overrides: Record<string, string | undefined> = {}) {
  resetEnvCache();
  for (const key of Object.keys(REQUIRED_ENV)) {
    ORIGINAL_ENV[key] ??= process.env[key];
    process.env[key] = overrides[key] ?? REQUIRED_ENV[key];
  }
  for (const key of OPTIONAL_ENV_KEYS) {
    ORIGINAL_ENV[key] ??= process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreEnv() {
  resetEnvCache();
  for (const key of Object.keys(REQUIRED_ENV)) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }

  for (const key of OPTIONAL_ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

describe("gemini provider", () => {
  beforeEach(() => {
    applyEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("sends the prompt payload and normalizes the immediate response", async () => {
    const env = getServerEnv();
    const url = `${env.GEMINI_BASE_URL}/models/${env.GEMINI_MODEL}:generateContent`;
    let requestBody: any;

    server.use(
      http.post(url, async ({ request }) => {
        const parsedUrl = new URL(request.url);
        expect(parsedUrl.searchParams.get("key")).toBe(env.GEMINI_API_KEY);
        requestBody = await request.json();
        return HttpResponse.json({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Summary line" },
                  { text: "Insight one" },
                  { text: "Insight two" }
                ]
              }
            }
          ],
          modelVersion: "gemini-2.0-pro"
        });
      })
    );

    const result = await generateContent({ prompt: "Explain AI safety" });

    expect(requestBody).toEqual({
      contents: [
        {
          role: "user",
          parts: [{ text: "Explain AI safety" }]
        }
      ]
    });
    expect(result.summary).toBe("Summary line");
    expect(result.insights).toEqual(["Insight one", "Insight two"]);
    expect(result.meta).toEqual({ model: "gemini-2.0-pro" });
  });

  it("polls long running operations when requested", async () => {
    vi.useFakeTimers();
    const env = getServerEnv();
    const url = `${env.GEMINI_BASE_URL}/models/${env.GEMINI_MODEL}:generateContent`;
    const operationUrl = `${env.GEMINI_BASE_URL}/operations/operation-123`;
    let postCount = 0;
    let getCount = 0;

    server.use(
      http.post(url, ({ request }) => {
        const parsedUrl = new URL(request.url);
        expect(parsedUrl.searchParams.get("key")).toBe(env.GEMINI_API_KEY);
        postCount += 1;
        return HttpResponse.json({
          name: "operations/operation-123"
        });
      }),
      http.get(operationUrl, ({ request }) => {
        const parsedUrl = new URL(request.url);
        expect(parsedUrl.searchParams.get("key")).toBe(env.GEMINI_API_KEY);
        getCount += 1;
        if (getCount < 2) {
          return HttpResponse.json({ done: false });
        }

        return HttpResponse.json({
          done: true,
          response: {
            candidates: [
              {
                content: {
                  parts: [
                    { text: "Completed summary" },
                    { text: "Completed insight" }
                  ]
                }
              }
            ],
            modelVersion: "gemini-2.0-pro"
          }
        });
      })
    );

    const promise = generateContent({
      prompt: "Explain AI safety",
      polling: { initialDelayMs: 10, maxAttempts: 5 }
    });

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    const result = await promise;

    expect(postCount).toBe(1);
    expect(getCount).toBe(2);
    expect(result.summary).toBe("Completed summary");
    expect(result.insights).toEqual(["Completed insight"]);
  });
});
