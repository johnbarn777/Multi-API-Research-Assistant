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

const OPTIONAL_ENV_KEYS = [
  "SENDGRID_API_KEY",
  "FIREBASE_STORAGE_BUCKET",
  "OPENAI_PROJECT_ID",
  "OPENAI_DR_MODEL",
  "OPENAI_CLARIFIER_MODEL",
  "OPENAI_PROMPT_WRITER_MODEL"
] as const;

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

function buildResponsePayload(id: string, status: string, outputText: string) {
  return {
    id,
    status,
    output: [
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: outputText
          }
        ]
      }
    ],
    usage: {
      total_tokens: 123
    }
  };
}

describe("openaiDeepResearch provider", () => {
  beforeEach(() => {
    applyEnv();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it("creates a session and returns clarifying questions", async () => {
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/responses`;
    let receivedBody: any;

    server.use(
      http.post(url, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          buildResponsePayload(
            "resp_clarify",
            "completed",
            JSON.stringify({
              questions: [
                { question: "What is the target timeframe?" },
                { question: "Are there preferred geographies?" }
              ]
            })
          )
        );
      })
    );

    const session = await startSession({ topic: "AI safety regulation trends" });

    expect(receivedBody.model).toBe("gpt-4.1-mini");
    expect(receivedBody.text?.format?.type).toBe("json_schema");
    expect(receivedBody.text?.format?.name).toBe("clarification_questions");
    expect(receivedBody.background).toBeUndefined();
    expect(receivedBody.text?.format?.type).toBe("json_schema");
    expect(session.sessionId).toMatch(/^.{8}-/); // uuid format
    expect(session.questions).toEqual([
      { index: 1, text: "What is the target timeframe?" },
      { index: 2, text: "Are there preferred geographies?" }
    ]);
    expect(session.raw).toBeDefined();
  });

  it("returns the next unanswered question without calling OpenAI", async () => {
    const result = await submitAnswer({
      sessionId: "session_1",
      answer: "Any timeframe works.",
      topic: "AI safety",
      questions: [
        { index: 1, text: "What timeframe are you considering?" },
        { index: 2, text: "Which regions matter most?" }
      ],
      answers: [{ index: 1, answer: "Any timeframe works." }]
    });

    expect(result.nextQuestion).toEqual({
      index: 2,
      text: "Which regions matter most?"
    });
    expect(result.finalPrompt).toBeUndefined();
  });

  it("generates a final prompt when all questions are answered", async () => {
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/responses`;
    let receivedBody: any;

    server.use(
      http.post(url, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(
          buildResponsePayload(
            "resp_prompt",
            "completed",
            JSON.stringify({
              final_prompt: "Investigate AI safety in 2024 across the EU and US."
            })
          )
        );
      })
    );

    const response = await submitAnswer({
      sessionId: "session_1",
      answer: "Focus on 2024 in the EU and US.",
      topic: "AI safety",
      questions: [
        { index: 1, text: "What timeframe are you considering?" },
        { index: 2, text: "Which regions matter most?" }
      ],
      answers: [
        { index: 1, answer: "Focus on 2024." },
        { index: 2, answer: "EU and US." }
      ]
    });

    expect(receivedBody.model).toBe("gpt-4.1-mini");
    expect(response.nextQuestion).toBeUndefined();
    expect(response.finalPrompt).toBe("Investigate AI safety in 2024 across the EU and US.");
  });

  it("executes a deep research run using the configured project header", async () => {
    applyEnv({
      OPENAI_PROJECT_ID: "proj_test",
      OPENAI_DR_MODEL: "o3-deep-research"
    });
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/responses`;
    let receivedHeaders: Headers | undefined;
    let receivedBody: any;

    server.use(
      http.post(url, async ({ request }) => {
        receivedHeaders = request.headers;
        receivedBody = await request.json();
        return HttpResponse.json({
          id: "resp_run",
          status: "in_progress"
        });
      })
    );

    const result = await executeRun({
      sessionId: "session_1",
      prompt: "Research AI safety regulations."
    });

    expect(receivedHeaders?.get("openai-project")).toBe("proj_test");
    expect(receivedBody.model).toBe("o3-deep-research");
    expect(receivedBody.background).toBe(true);
    expect(receivedBody.tools).toEqual([{ type: "web_search_preview" }]);
    expect(result.runId).toBe("resp_run");
    expect(result.status).toBe("in_progress");
  });

  it("polls until completion and normalizes the response", async () => {
    const env = getServerEnv();
    const url = `${env.OPENAI_DR_BASE_URL}/responses/resp_done`;
    let callCount = 0;

    server.use(
      http.get(url, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({
            id: "resp_done",
            status: "in_progress"
          });
        }

        return HttpResponse.json(
          buildResponsePayload(
            "resp_done",
            "completed",
            "Summary line\n\nInsight A\nInsight B"
          )
        );
      })
    );

    const response = await pollResult({ runId: "resp_done", initialDelayMs: 10, maxAttempts: 3 });

    expect(callCount).toBe(2);
    expect(response.status).toBe("completed");
    expect(response.result?.summary).toBe("Summary line");
    expect(response.result?.insights).toEqual(["Insight A", "Insight B"]);
  });
});
