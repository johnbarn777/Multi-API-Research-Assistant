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
import {
  executeRun,
  pollResult,
  startSession,
  submitAnswer
} from "@/lib/providers/openaiDeepResearch";
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

const OPTIONAL_ENV_KEYS = ["SENDGRID_API_KEY"] as const;

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

describe("openaiDeepResearch provider", () => {
  beforeEach(() => {
    applyEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("creates a session and returns normalized questions", async () => {
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/deep-research/sessions`;
    let receivedBody: any;

    server.use(
      http.post(url, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          id: "session_123",
          questions: [
            { index: 2, text: "What scope should we narrow down to?" },
            { text: "Provide key stakeholders" }
          ]
        });
      })
    );

    const session = await startSession({ topic: "AI safety" });

    expect(receivedBody).toEqual({ topic: "AI safety", context: undefined });
    expect(session.sessionId).toBe("session_123");
    expect(session.questions).toEqual([
      { index: 2, text: "What scope should we narrow down to?" },
      { index: 2, text: "Provide key stakeholders" }
    ]);
    expect(session.raw).toBeDefined();
  });

  it("retries transient failures when starting a session", async () => {
    vi.useFakeTimers();
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/deep-research/sessions`;
    let callCount = 0;

    server.use(
      http.post(url, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({ error: "transient" }, { status: 503 });
        }

        return HttpResponse.json({
          id: "session_456",
          questions: []
        });
      })
    );

    const promise = startSession({ topic: "climate" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.sessionId).toBe("session_456");
    expect(callCount).toBe(2);
  });

  it("submits answers and surfaces next question and final prompt", async () => {
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/deep-research/sessions/session_123/responses`;

    server.use(
      http.post(url, async ({ request }) => {
        const body = await request.json();
        expect(body).toEqual({ answer: "We should focus on policy impacts." });
        return HttpResponse.json({
          next_question: { index: 3, text: "List critical policy levers." },
          final_prompt: "Investigate policy levers for AI safety."
        });
      })
    );

    const response = await submitAnswer({
      sessionId: "session_123",
      answer: "We should focus on policy impacts."
    });

    expect(response.nextQuestion).toEqual({ index: 3, text: "List critical policy levers." });
    expect(response.finalPrompt).toBe("Investigate policy levers for AI safety.");
    expect(response.raw).toBeDefined();
  });

  it("executes a run and polls until the normalized result is returned", async () => {
    vi.useFakeTimers();
    const env = getServerEnv();
    const runUrl = `${env.OPENAI_DR_BASE_URL}/deep-research/sessions/session_123/runs`;
    const pollUrl = `${env.OPENAI_DR_BASE_URL}/deep-research/runs/run_123`;
    let runRequestBody: any;
    let pollCount = 0;

    server.use(
      http.post(runUrl, async ({ request }) => {
        runRequestBody = await request.json();
        return HttpResponse.json({ id: "run_123", status: "queued" });
      }),
      http.get(pollUrl, () => {
        pollCount += 1;
        if (pollCount < 2) {
          return HttpResponse.json({ status: "running" });
        }

        return HttpResponse.json({
          status: "completed",
          output: {
            summary: "Summary of findings",
            insights: [
              {
                title: "Key takeaway",
                bullets: ["Insight A", "Insight B"]
              }
            ],
            sources: [
              {
                title: "Example Source",
                url: "https://example.com"
              }
            ]
          },
          usage: {
            total_tokens: 1234,
            model: "gpt-deep-research-1",
            started_at: "2024-01-01T00:00:00Z",
            completed_at: "2024-01-01T00:05:00Z"
          }
        });
      })
    );

    const run = await executeRun({ sessionId: "session_123", prompt: "Do research" });
    const pollPromise = pollResult({ runId: run.runId, initialDelayMs: 10, maxAttempts: 5 });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    const pollResultResponse = await pollPromise;

    expect(runRequestBody).toEqual({ prompt: "Do research" });
    expect(pollCount).toBe(2);
    expect(pollResultResponse.status).toBe("completed");
    expect(pollResultResponse.result).toMatchObject({
      summary: "Summary of findings",
      insights: ["Key takeaway", "Insight A", "Insight B"],
      meta: {
        tokens: 1234,
        model: "gpt-deep-research-1",
        startedAt: "2024-01-01T00:00:00Z",
        completedAt: "2024-01-01T00:05:00Z"
      }
    });
  });
});
