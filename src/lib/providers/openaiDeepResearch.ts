import { getServerEnv } from "@/config/env";
import { normalizeOpenAIDeepResearchResult } from "@/lib/providers/normalizers";
import { logger } from "@/lib/utils/logger";
import type { ProviderResult } from "@/types/research";

interface FetchWithRetryOptions {
  operation: string;
  provider: string;
  maxAttempts?: number;
  initialDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  { operation, provider, maxAttempts = DEFAULT_MAX_ATTEMPTS, initialDelayMs = DEFAULT_INITIAL_DELAY_MS }: FetchWithRetryOptions
): Promise<Response> {
  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        const errorBody = await safeJson(response);
        if (!retryable) {
          throw new Error(
            `${provider}.${operation} failed with status ${response.status}: ${JSON.stringify(errorBody)}`
          );
        }

        throw new FetchRetryError(response.status, errorBody);
      }

      return response;
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= maxAttempts) {
        break;
      }

      logger.warn("provider.request.retry", {
        provider,
        operation,
        attempt,
        maxAttempts,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error)
      });

      await sleep(delay);
      delay *= 2;
    }
  }

  const errorMessage =
    lastError instanceof Error
      ? lastError.message
      : `${provider}.${operation} failed after ${maxAttempts} attempts`;
  logger.error("provider.request.failed", {
    provider,
    operation,
    attempts: maxAttempts,
    error: errorMessage
  });
  throw lastError instanceof Error ? lastError : new Error(errorMessage);
}

class FetchRetryError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Retryable HTTP error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch (error) {
    logger.warn("provider.response.parse_failed", {
      provider: "openai-deep-research",
      error: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

interface StartSessionOptions {
  topic: string;
  context?: string;
}

export interface StartSessionResult {
  sessionId: string;
  questions: Array<{ index: number; text: string }>;
  raw: unknown;
}

export async function startSession({ topic, context }: StartSessionOptions): Promise<StartSessionResult> {
  const env = getServerEnv();
  const url = `${env.OPENAI_DR_BASE_URL.replace(/\/$/, "")}/deep-research/sessions`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  };

  logger.info("openai.deepResearch.startSession", {
    provider: "openai-deep-research",
    topicLength: topic.length
  });

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ topic, context })
    },
    { provider: "openai-deep-research", operation: "startSession" }
  );

  const payload = await safeJson(response);
  const data = (payload ?? {}) as Record<string, any>;

  const questions: Array<{ index: number; text: string }> = Array.isArray(data.questions)
    ? data.questions.map((question: any, index: number) => ({
        index: typeof question.index === "number" ? question.index : index + 1,
        text: typeof question.text === "string" ? question.text : String(question)
      }))
    : [];

  const result: StartSessionResult = {
    sessionId: typeof data.id === "string" ? data.id : "",
    questions,
    raw: payload
  };

  if (!result.sessionId) {
    throw new Error("OpenAI Deep Research session response did not include an id");
  }

  return result;
}

interface SubmitAnswerOptions {
  sessionId: string;
  answer: string;
}

export interface SubmitAnswerResult {
  nextQuestion?: { index: number; text: string };
  finalPrompt?: string;
  raw: unknown;
}

export async function submitAnswer({ sessionId, answer }: SubmitAnswerOptions): Promise<SubmitAnswerResult> {
  if (!sessionId) {
    throw new Error("sessionId is required to submit an answer");
  }

  const env = getServerEnv();
  const base = env.OPENAI_DR_BASE_URL.replace(/\/$/, "");
  const url = `${base}/deep-research/sessions/${encodeURIComponent(sessionId)}/responses`;

  logger.info("openai.deepResearch.submitAnswer", {
    provider: "openai-deep-research",
    sessionId,
    answerLength: answer.length
  });

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ answer })
    },
    { provider: "openai-deep-research", operation: "submitAnswer" }
  );

  const payload = await safeJson(response);
  const data = (payload ?? {}) as Record<string, any>;

  const nextQuestionPayload = data.next_question ?? data.nextQuestion;
  const finalPrompt = typeof (data.final_prompt ?? data.finalPrompt) === "string"
    ? (data.final_prompt ?? data.finalPrompt)
    : undefined;

  const nextQuestion = nextQuestionPayload
    ? {
        index:
          typeof nextQuestionPayload.index === "number"
            ? nextQuestionPayload.index
            : data.questions_answered
              ? data.questions_answered + 1
              : 1,
        text:
          typeof nextQuestionPayload.text === "string"
            ? nextQuestionPayload.text
            : String(nextQuestionPayload)
      }
    : undefined;

  return {
    nextQuestion,
    finalPrompt,
    raw: payload
  };
}

interface ExecuteRunOptions {
  sessionId: string;
  prompt: string;
}

export interface ExecuteRunResult {
  runId: string;
  status: string;
  raw: unknown;
}

export async function executeRun({ sessionId, prompt }: ExecuteRunOptions): Promise<ExecuteRunResult> {
  if (!sessionId) {
    throw new Error("sessionId is required to execute a run");
  }

  const env = getServerEnv();
  const base = env.OPENAI_DR_BASE_URL.replace(/\/$/, "");
  const url = `${base}/deep-research/sessions/${encodeURIComponent(sessionId)}/runs`;

  logger.info("openai.deepResearch.executeRun", {
    provider: "openai-deep-research",
    sessionId,
    promptLength: prompt.length
  });

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    },
    { provider: "openai-deep-research", operation: "executeRun" }
  );

  const payload = await safeJson(response);
  const data = (payload ?? {}) as Record<string, any>;

  const runId = typeof (data.id ?? data.run_id) === "string" ? data.id ?? data.run_id : "";
  const status = typeof data.status === "string" ? data.status : "queued";

  if (!runId) {
    throw new Error("OpenAI Deep Research run response did not include an id");
  }

  return {
    runId,
    status,
    raw: payload
  };
}

interface PollResultOptions {
  runId: string;
  maxAttempts?: number;
  initialDelayMs?: number;
}

export interface PollResultResponse {
  status: string;
  result?: ProviderResult;
  raw: unknown;
}

export async function pollResult({
  runId,
  maxAttempts = 10,
  initialDelayMs = 1000
}: PollResultOptions): Promise<PollResultResponse> {
  if (!runId) {
    throw new Error("runId is required to poll for a result");
  }

  const env = getServerEnv();
  const base = env.OPENAI_DR_BASE_URL.replace(/\/$/, "");
  const url = `${base}/deep-research/runs/${encodeURIComponent(runId)}`;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxAttempts) {
    logger.info("openai.deepResearch.poll", {
      provider: "openai-deep-research",
      runId,
      attempt: attempt + 1
    });

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        }
      },
      {
        provider: "openai-deep-research",
        operation: "pollResult",
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        initialDelayMs: DEFAULT_INITIAL_DELAY_MS
      }
    );

    const payload = await safeJson(response);
    const data = (payload ?? {}) as Record<string, any>;
    const status = typeof data.status === "string" ? data.status : "unknown";

    if (status === "completed") {
      const normalized = normalizeOpenAIDeepResearchResult(data);
      return {
        status,
        result: normalized,
        raw: payload
      };
    }

    if (status === "failed") {
      const errorMessage =
        typeof data.error?.message === "string"
          ? data.error.message
          : "OpenAI Deep Research run reported failure";
      throw new Error(errorMessage);
    }

    attempt += 1;
    if (attempt >= maxAttempts) {
      break;
    }

    await sleep(delay);
    delay *= 2;
  }

  throw new Error(
    `OpenAI Deep Research result not ready after ${maxAttempts} attempts`
  );
}
