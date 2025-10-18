import { getServerEnv } from "@/config/env";
import {
  normalizeOpenAIDeepResearchResult,
  type OpenAIDeepResearchRunPayload
} from "@/lib/providers/normalizers";
import { logger } from "@/lib/utils/logger";
import { NonRetryableError, retryWithBackoff, wait } from "@/lib/utils/retry";
import type { ProviderResult } from "@/types/research";

interface FetchWithRetryOptions {
  operation: string;
  provider: string;
  maxAttempts?: number;
  initialDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeQuestionPayload(
  question: unknown,
  fallbackIndex: number
): { index: number; text: string } | null {
  if (typeof question === "string") {
    const text = toTrimmedString(question);
    return text ? { index: fallbackIndex, text } : null;
  }

  if (isRecord(question)) {
    const candidate = question as {
      index?: unknown;
      text?: unknown;
      prompt?: unknown;
    };
    const text =
      toTrimmedString(candidate.text) ?? toTrimmedString(candidate.prompt);
    if (!text) {
      return null;
    }
    const indexValue =
      typeof candidate.index === "number" && Number.isFinite(candidate.index)
        ? candidate.index
        : fallbackIndex;
    return { index: indexValue, text };
  }

  return null;
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  { operation, provider, maxAttempts = DEFAULT_MAX_ATTEMPTS, initialDelayMs = DEFAULT_INITIAL_DELAY_MS }: FetchWithRetryOptions
): Promise<Response> {
  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(input, init);
        if (!response.ok) {
          const errorBody = await safeJson(response);
          const retryable = response.status >= 500 || response.status === 429;
          const baseMessage = `${provider}.${operation} failed with status ${response.status}`;
          if (!retryable) {
            throw new NonRetryableError(`${baseMessage}: ${JSON.stringify(errorBody)}`, {
              cause: { status: response.status, body: errorBody }
            });
          }

          const retryError = new Error(`${baseMessage}; retrying`);
          Object.assign(retryError, {
            status: response.status,
            body: errorBody
          });
          throw retryError;
        }

        return response;
      },
      {
        maxAttempts,
        initialDelayMs,
        onRetry: (error, context) => {
          logger.warn("provider.request.retry", {
            provider,
            operation,
            attempt: context.attempt,
            maxAttempts: context.maxAttempts,
            delayMs: context.delayMs,
            error: error instanceof Error ? error.message : String(error),
            ...(error && typeof error === "object" && "status" in error
              ? { status: (error as { status?: number }).status }
              : {})
          });
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `${provider}.${operation} failed after ${maxAttempts} attempts`;

    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status?: number }).status
        : undefined;

    logger.error("provider.request.failed", {
      provider,
      operation,
      attempts: maxAttempts,
      error: message,
      ...(typeof status === "number" ? { status } : {})
    });

    throw error instanceof Error ? error : new Error(message);
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
  const data = isRecord(payload) ? (payload as Record<string, unknown>) : {};

  const questionsRaw = Array.isArray(data.questions) ? data.questions : [];
  const questions = questionsRaw
    .map((question, index) => normalizeQuestionPayload(question, index + 1))
    .filter((item): item is { index: number; text: string } => item !== null);

  const sessionIdValue = data.id;
  const result: StartSessionResult = {
    sessionId: typeof sessionIdValue === "string" ? sessionIdValue : "",
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
  const data = isRecord(payload) ? (payload as Record<string, unknown>) : {};

  const nextQuestionPayload = data.next_question ?? data.nextQuestion;
  const questionsAnswered = toNumber(data.questions_answered);
  const fallbackIndex = questionsAnswered ? questionsAnswered + 1 : 1;

  const normalizedNext = normalizeQuestionPayload(nextQuestionPayload, fallbackIndex);
  const nextQuestion = normalizedNext ?? undefined;

  const finalPromptValue = data.final_prompt ?? data.finalPrompt;
  const finalPrompt = toTrimmedString(finalPromptValue);

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
  const data = isRecord(payload) ? (payload as Record<string, unknown>) : {};

  const runIdCandidate = data.id ?? data.run_id;
  const runId = typeof runIdCandidate === "string" ? runIdCandidate : "";
  const status = toTrimmedString(data.status) ?? "queued";

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
    const data = isRecord(payload) ? (payload as Record<string, unknown>) : {};
    const status = toTrimmedString(data.status) ?? "unknown";

    if (status === "completed") {
      const normalized = normalizeOpenAIDeepResearchResult(
        data as OpenAIDeepResearchRunPayload
      );
      return {
        status,
        result: normalized,
        raw: payload
      };
    }

    if (status === "failed") {
      const errorPayload = data.error;
      const errorMessage = isRecord(errorPayload)
        ? toTrimmedString(errorPayload.message)
        : toTrimmedString(errorPayload);
      throw new Error(errorMessage ?? "OpenAI Deep Research run reported failure");
    }

    attempt += 1;
    if (attempt >= maxAttempts) {
      break;
    }

    await wait(delay);
    delay *= 2;
  }

  throw new Error(
    `OpenAI Deep Research result not ready after ${maxAttempts} attempts`
  );
}
