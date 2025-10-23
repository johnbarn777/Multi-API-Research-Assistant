import { randomUUID } from "crypto";

import { getServerEnv, type ServerEnv } from "@/config/env";
import {
  normalizeOpenAIDeepResearchResult,
  type OpenAIDeepResearchRunPayload
} from "@/lib/providers/normalizers";
import { logger } from "@/lib/utils/logger";
import { NonRetryableError, retryWithBackoff, wait } from "@/lib/utils/retry";
import type { ProviderResult } from "@/types/research";
import { acquireDistributedOpenAiSlot } from "@/server/research/rateLimiter";

interface FetchWithRetryOptions {
  operation: string;
  provider: string;
  maxAttempts?: number;
  initialDelayMs?: number;
}

interface CreateResponseOptions {
  env: ServerEnv;
  model: string;
  input: unknown;
  instructions?: string;
  tools?: Array<Record<string, unknown>>;
  background?: boolean;
  maxOutputTokens?: number;
  responseFormat?: { type: string } & Record<string, unknown>;
  metadata?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;
const MAX_CLARIFICATION_QUESTIONS = 3;
const DEFAULT_CLARIFIER_MODEL = "gpt-4.1-mini";
const DEFAULT_PROMPT_WRITER_MODEL = "gpt-4.1-mini";
const DEFAULT_DEEP_RESEARCH_MODEL = "o4-mini-deep-research";
const DEFAULT_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_MAX_PROMPT_CHARS = 20000;
const DEFAULT_MAX_COMPLETION_TOKENS = 16000;
const DEFAULT_RUNS_PER_MINUTE = 2;
const ONE_MINUTE_MS = 60_000;
const MIN_RATE_LIMIT_DELAY_MS = 250;
const DEFAULT_INITIAL_POLL_DELAY_MS = 1_000;
const DEFAULT_MAX_POLL_DELAY_MS = 60_000;

const runWindow: number[] = [];

type ClarifierSchema = {
  questions: Array<{
    question: string;
  }>;
};

type PromptWriterSchema = {
  final_prompt: string;
};

interface ResponsesOutputMessageContent {
  type?: string;
  text?: string;
}

interface ResponsesOutputItem {
  type?: string;
  role?: string;
  content?: ResponsesOutputMessageContent[];
  [key: string]: unknown;
}

interface OpenAIResponsesPayload {
  id?: string;
  status?: string;
  model?: string;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
  };
  output?: ResponsesOutputItem[];
  error?: {
    message?: string;
    code?: string;
    [key: string]: unknown;
  };
  last_error?: {
    message?: string;
    code?: string;
    param?: string;
    [key: string]: unknown;
  };
  incomplete_details?: {
    reason?: string;
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getBaseUrl(env: ServerEnv): string {
  return env.OPENAI_DR_BASE_URL.replace(/\/$/, "");
}

function createHeaders(env: ServerEnv): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  if (env.OPENAI_PROJECT_ID) {
    headers["OpenAI-Project"] = env.OPENAI_PROJECT_ID;
  }

  return headers;
}

function parseRetryAfterMs(headers: Headers): number | null {
  const header = headers.get("Retry-After");
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : 0;
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
          const retryAfterMs = response.status === 429 ? parseRetryAfterMs(response.headers) : null;
          const baseMessage = `${provider}.${operation} failed with status ${response.status}`;
          if (!retryable) {
            throw new NonRetryableError(`${baseMessage}: ${JSON.stringify(errorBody)}`, {
              cause: { status: response.status, body: errorBody }
            });
          }

          const retryError = new Error(`${baseMessage}; retrying`);
          Object.assign(retryError, {
            status: response.status,
            body: errorBody,
            ...(retryAfterMs !== null ? { retryAfterMs } : {})
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
              : {}),
            ...(error && typeof error === "object" && "retryAfterMs" in error
              ? { retryAfterMs: (error as { retryAfterMs?: number }).retryAfterMs }
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
    try {
      const text = await response.clone().text();
      return text.length > 0 ? text : undefined;
    } catch {
      // ignore secondary failure
    }
    return undefined;
  }
}

async function createResponse({
  env,
  model,
  input,
  instructions,
  tools,
  background,
  maxOutputTokens,
  responseFormat,
  metadata,
  reasoning
}: CreateResponseOptions): Promise<OpenAIResponsesPayload> {
  const url = `${getBaseUrl(env)}/responses`;
  const headers = createHeaders(env);
  const body: Record<string, unknown> = {
    model,
    input
  };

  if (instructions) {
    body.instructions = instructions;
  }
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }
  if (typeof background === "boolean") {
    body.background = background;
  }
  if (typeof maxOutputTokens === "number") {
    body.max_output_tokens = maxOutputTokens;
  }
  if (responseFormat) {
    const { type, ...rest } = responseFormat;
    body.text = {
      ...(body.text as Record<string, unknown> | undefined),
      format: {
        type,
        ...rest
      }
    };
  }
  if (metadata) {
    body.metadata = metadata;
  }
  if (reasoning) {
    body.reasoning = reasoning;
  }

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    },
    { provider: "openai-deep-research", operation: "createResponse" }
  );

  const payload = await safeJson(response);
  return (payload ?? {}) as OpenAIResponsesPayload;
}

async function retrieveResponse(env: ServerEnv, responseId: string): Promise<OpenAIResponsesPayload> {
  const url = `${getBaseUrl(env)}/responses/${encodeURIComponent(responseId)}`;
  const headers = createHeaders(env);

  const response = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers
    },
    { provider: "openai-deep-research", operation: "retrieveResponse" }
  );

  const payload = await safeJson(response);
  return (payload ?? {}) as OpenAIResponsesPayload;
}

function extractOutputText(payload: OpenAIResponsesPayload): string | null {
  const items = Array.isArray(payload.output) ? payload.output : [];
  const textFragments: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.type === "message") {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const fragment of content) {
        if (fragment?.type === "output_text" && typeof fragment.text === "string") {
          textFragments.push(fragment.text);
        }
      }
    }
  }

  if (textFragments.length === 0) {
    return null;
  }

  return textFragments.join("\n").trim();
}

function parseJsonFromResponse<T>(payload: OpenAIResponsesPayload): T | null {
  const text = extractOutputText(payload);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    logger.warn("openai.deepResearch.json_parse_failed", {
      error: error instanceof Error ? error.message : String(error),
      text
    });
    return null;
  }
}

function clampQuestionCount(questions: Array<{ question: string }>): Array<{ index: number; text: string }> {
  const sanitized: Array<{ index: number; text: string }> = [];

  for (let idx = 0; idx < questions.length && sanitized.length < MAX_CLARIFICATION_QUESTIONS; idx += 1) {
    const question = questions[idx]?.question?.trim();
    if (question) {
      sanitized.push({
        index: sanitized.length + 1,
        text: question
      });
    }
  }

  return sanitized;
}

function findNextUnansweredQuestion(
  questions: Array<{ index: number; text: string }>,
  answers: Array<{ index: number; answer: string }>
): { index: number; text: string } | null {
  if (questions.length === 0) {
    return null;
  }

  const answeredIndexes = new Set(
    answers
      .filter((entry) => typeof entry.index === "number")
      .map((entry) => entry.index)
  );

  const ordered = [...questions].sort((a, b) => a.index - b.index);
  for (const question of ordered) {
    if (!answeredIndexes.has(question.index)) {
      return question;
    }
  }

  return null;
}

function buildDeepResearchPayload(
  response: OpenAIResponsesPayload,
  finalOutputText: string | null
): OpenAIDeepResearchRunPayload {
  const summary = finalOutputText?.split(/\n{2,}/)[0]?.trim() ?? "";
  const remaining = finalOutputText
    ? finalOutputText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];
  const insights = remaining.length > 1 ? remaining.slice(1) : [];

  return {
    id: response.id,
    status: response.status,
    output: {
      summary,
      insights: insights.length
        ? [
            {
              title: insights[0],
              bullets: insights.slice(1)
            }
          ]
        : [],
      sources: extractSources(response)
    },
    usage: {
      total_tokens: response.usage?.total_tokens,
      model: response.model
    },
    meta: {
      rawText: finalOutputText,
      output: response.output
    }
  };
}

function extractSources(payload: OpenAIResponsesPayload): Array<{ title?: string; url?: string }> | undefined {
  const items = Array.isArray(payload.output) ? payload.output : [];
  const sources: Array<{ title?: string; url?: string }> = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (item.type === "web_search_call") {
      const results = (item as { results?: Array<Record<string, unknown>> }).results;
      if (Array.isArray(results)) {
        for (const result of results) {
          const title = typeof result?.title === "string" ? result.title.trim() : undefined;
          const url = typeof result?.url === "string" ? result.url : undefined;
          if (title || url) {
            sources.push({ title, url });
          }
        }
      }
    }
  }

  return sources.length > 0 ? sources : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickSerializableFields(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const trimmed = value
        .filter((entry) => ["string", "number", "boolean"].includes(typeof entry))
        .slice(0, 5);
      if (trimmed.length > 0) {
        result[key] = trimmed;
      }
    }
  }

  return result;
}

function extractIncompleteDetails(payload: OpenAIResponsesPayload): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  if (isRecord(payload.incomplete_details)) {
    const sanitized = pickSerializableFields(payload.incomplete_details);
    if (Object.keys(sanitized).length > 0) {
      details.incomplete = sanitized;
    }
  }

  if (isRecord(payload.last_error)) {
    const sanitized = pickSerializableFields(payload.last_error);
    if (Object.keys(sanitized).length > 0) {
      details.lastError = sanitized;
    }
  }

  if (isRecord(payload.error)) {
    const sanitized = pickSerializableFields(payload.error);
    if (Object.keys(sanitized).length > 0) {
      details.error = sanitized;
    }
  }

  const outputText = extractOutputText(payload);
  if (outputText) {
    details.outputText = outputText.slice(0, 500);
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

export interface StartSessionOptions {
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
  const clarifierModel = env.OPENAI_CLARIFIER_MODEL ?? DEFAULT_CLARIFIER_MODEL;

  logger.info("openai.deepResearch.startSession", {
    provider: "openai-deep-research",
    topicLength: topic.length,
    clarifierModel
  });

  const clarifierInstructions = [
    "You are helping a researcher gather clarification before a deep research task.",
    `Ask up to ${MAX_CLARIFICATION_QUESTIONS} concise follow-up questions only when they are necessary.`,
    "If the topic is already sufficiently detailed, you may return an empty list.",
    "Return a JSON object that matches the provided schema."
  ].join(" ");

  const fallbackClarifier: ClarifierSchema = {
    questions: []
  };

  const clarifierResponse = await createResponse({
    env,
    model: clarifierModel,
    input: [
      `Research topic: ${topic.trim()}`,
      context ? `Additional context: ${context.trim()}` : null
    ]
      .filter(Boolean)
      .join("\n"),
    instructions: clarifierInstructions,
    responseFormat: {
      type: "json_schema",
      name: "clarification_questions",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["questions"],
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["question"],
              properties: {
                question: {
                  type: "string",
                  description: "A concise clarifying question."
                }
              }
            }
          }
        }
      }
    },
    maxOutputTokens: 400
  });

  const parsed = parseJsonFromResponse<ClarifierSchema>(clarifierResponse) ?? fallbackClarifier;
  const questions = clampQuestionCount(parsed.questions ?? []);
  const sessionId = randomUUID();

  return {
    sessionId,
    questions,
    raw: clarifierResponse
  };
}

interface SubmitAnswerOptions {
  sessionId: string;
  answer: string;
  topic: string;
  questions: Array<{ index: number; text: string }>;
  answers: Array<{ index: number; answer: string }>;
  context?: string;
}

export interface SubmitAnswerResult {
  nextQuestion?: { index: number; text: string };
  finalPrompt?: string;
  raw: unknown;
}

export async function submitAnswer({
  sessionId,
  answer,
  topic,
  questions,
  answers,
  context
}: SubmitAnswerOptions): Promise<SubmitAnswerResult> {
  const env = getServerEnv();
  const pendingQuestion = findNextUnansweredQuestion(questions, answers);

  logger.info("openai.deepResearch.submitAnswer", {
    provider: "openai-deep-research",
    sessionId,
    answerLength: answer.length,
    remainingQuestions: pendingQuestion ? 1 : 0
  });

  if (pendingQuestion) {
    return {
      nextQuestion: pendingQuestion,
      raw: { sessionId, pendingQuestion }
    };
  }

  const promptWriterModel = env.OPENAI_PROMPT_WRITER_MODEL ?? DEFAULT_PROMPT_WRITER_MODEL;

  const instructions = [
    "You rewrite user-provided research tasks into a fully-specified prompt for a deep research model.",
    "Use all answers that the user supplied to craft a single, detailed prompt in the user's voice.",
    "Explicitly mention any constraints, goals, and desired outputs.",
    "Return JSON that matches the provided schema."
  ].join(" ");

  const formattedAnswers = answers
    .sort((a, b) => a.index - b.index)
    .map((entry) => `Q${entry.index}: ${questions.find((q) => q.index === entry.index)?.text ?? ""}\nA${entry.index}: ${entry.answer}`)
    .join("\n\n");

  const promptWriterResponse = await createResponse({
    env,
    model: promptWriterModel,
    input: [
      `Research topic: ${topic.trim()}`,
      context ? `Additional context: ${context.trim()}` : null,
      formattedAnswers ? `Clarifications:\n${formattedAnswers}` : null
    ]
      .filter(Boolean)
      .join("\n\n"),
    instructions,
    responseFormat: {
      type: "json_schema",
      name: "deep_research_prompt",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["final_prompt"],
        properties: {
          final_prompt: {
            type: "string",
            description: "A detailed prompt ready for the deep research model."
          }
        }
      }
    },
    maxOutputTokens: 600
  });

  const parsed = parseJsonFromResponse<PromptWriterSchema>(promptWriterResponse);
  const finalPrompt = parsed?.final_prompt?.trim();

  if (!finalPrompt) {
    throw new Error("Failed to generate final prompt from clarification answers");
  }

  return {
    finalPrompt,
    raw: promptWriterResponse
  };
}

interface ExecuteRunOptions {
  sessionId: string;
  prompt: string;
  requestId?: string;
}

function resolveMaxOutputTokens(env: ServerEnv): number {
  const configured = env.OPENAI_DR_MAX_OUTPUT_TOKENS;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_MAX_OUTPUT_TOKENS;
}

function resolveMaxPromptChars(env: ServerEnv): number {
  const configured = env.OPENAI_DR_MAX_PROMPT_CHARS;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_MAX_PROMPT_CHARS;
}

function resolveMaxCompletionTokens(env: ServerEnv): number {
  const configured = env.OPENAI_DR_MAX_COMPLETION_TOKENS;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_MAX_COMPLETION_TOKENS;
}

function resolveRunsPerMinute(env: ServerEnv): number {
  const configured = env.OPENAI_DR_RUNS_PER_MINUTE;
  if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.floor(configured));
  }
  const estimatedTokensPerRun = Math.max(
    resolveMaxCompletionTokens(env),
    resolveMaxOutputTokens(env)
  );
  const conservativeLimit = estimatedTokensPerRun > 0 ? Math.floor(200000 / estimatedTokensPerRun) : 1;
  return Math.max(1, Math.min(DEFAULT_RUNS_PER_MINUTE, conservativeLimit));
}

async function acquireRunSlot(env: ServerEnv): Promise<number> {
  const limit = resolveRunsPerMinute(env);
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }

  while (true) {
    const now = Date.now();
    while (runWindow.length > 0 && now - runWindow[0] >= ONE_MINUTE_MS) {
      runWindow.shift();
    }

    if (runWindow.length < limit) {
      runWindow.push(now);
      return limit;
    }

    const nextAvailable = runWindow[0] + ONE_MINUTE_MS;
    const waitMs = Math.max(MIN_RATE_LIMIT_DELAY_MS, nextAvailable - now);

    logger.info("openai.deepResearch.rate_limit.wait", {
      provider: "openai-deep-research",
      limitPerMinute: limit,
      waitMs
    });

    await wait(waitMs);
  }

  // Unreachable, but satisfies TypeScript control flow analysis.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return limit as number;
}

function clampPrompt(prompt: string, maxChars: number): { prompt: string; truncated: boolean } {
  if (prompt.length <= maxChars) {
    return { prompt, truncated: false };
  }

  const truncatedPrompt = prompt.slice(0, Math.max(0, maxChars)).replace(/\s+$/u, "").concat("\n\n[Truncated due to length]");
  return { prompt: truncatedPrompt, truncated: true };
}

export interface ExecuteRunResult {
  runId: string;
  status: string;
  raw: unknown;
}

export async function executeRun({ sessionId, prompt, requestId }: ExecuteRunOptions): Promise<ExecuteRunResult> {
  const env = getServerEnv();
  const model = env.OPENAI_DR_MODEL ?? DEFAULT_DEEP_RESEARCH_MODEL;

  const perProcessLimit = await acquireRunSlot(env);
  if (perProcessLimit > 0) {
    await acquireDistributedOpenAiSlot(perProcessLimit, requestId);
  }

  const { prompt: constrainedPrompt, truncated } = clampPrompt(prompt, resolveMaxPromptChars(env));
  if (truncated) {
    logger.warn("openai.deepResearch.prompt_truncated", {
      provider: "openai-deep-research",
      sessionId,
      requestId,
      originalLength: prompt.length,
      maxChars: resolveMaxPromptChars(env)
    });
  }

  logger.info("openai.deepResearch.executeRun", {
    provider: "openai-deep-research",
    sessionId,
    promptLength: constrainedPrompt.length,
    model
  });

  const response = await createResponse({
    env,
    model,
    input: constrainedPrompt,
    tools: [
      {
        type: "web_search_preview"
      }
    ],
    background: true,
    maxOutputTokens: resolveMaxOutputTokens(env)
  });

  const runId = response.id;
  if (!runId) {
    throw new Error("OpenAI Deep Research response did not include an id");
  }

  const status = typeof response.status === "string" ? response.status : "in_progress";

  return {
    runId,
    status,
    raw: response
  };
}

interface PollResultOptions {
  runId: string;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface PollResultResponse {
  status: string;
  result?: ProviderResult;
  raw: unknown;
}

export async function pollResult({
  runId,
  maxAttempts,
  initialDelayMs = DEFAULT_INITIAL_POLL_DELAY_MS,
  maxDelayMs
}: PollResultOptions): Promise<PollResultResponse> {
  const env = getServerEnv();
  const resolvedMaxAttempts =
    maxAttempts ?? env.OPENAI_DR_POLL_MAX_ATTEMPTS ?? null;
  const resolvedMaxDelay = Math.max(
    MIN_RATE_LIMIT_DELAY_MS,
    maxDelayMs ?? env.OPENAI_DR_POLL_MAX_DELAY_MS ?? DEFAULT_MAX_POLL_DELAY_MS
  );

  let attempt = 0;
  let delay = Math.max(MIN_RATE_LIMIT_DELAY_MS, initialDelayMs);
  let lastStatus: string | null = null;
  let lastStatusDetails: Record<string, unknown> | undefined;

  while (resolvedMaxAttempts === null || attempt < resolvedMaxAttempts) {
    logger.info("openai.deepResearch.poll", {
      provider: "openai-deep-research",
      runId,
      attempt: attempt + 1
    });

    const response = await retrieveResponse(env, runId);
    const status = typeof response.status === "string" ? response.status : "unknown";
    const statusDetails = status !== "completed" ? extractIncompleteDetails(response) : undefined;
    lastStatus = status;
    lastStatusDetails = statusDetails;

    logger.info("openai.deepResearch.poll.status", {
      provider: "openai-deep-research",
      runId,
      attempt: attempt + 1,
      status,
      ...(statusDetails ? { statusDetails } : {})
    });

    if (status === "completed") {
      const outputText = extractOutputText(response);
      const payload = buildDeepResearchPayload(response, outputText);
      const normalized = normalizeOpenAIDeepResearchResult(payload);

      return {
        status,
        result: normalized,
        raw: response
      };
    }

    if (status === "failed" || status === "cancelled") {
      const errorMessage = outputErrorMessage(response);
      throw new Error(errorMessage ?? "OpenAI Deep Research run reported failure");
    }

    attempt += 1;
    if (resolvedMaxAttempts !== null && attempt >= resolvedMaxAttempts) {
      break;
    }

    await wait(delay);
    delay = Math.min(delay * 2, resolvedMaxDelay);
  }

  if (resolvedMaxAttempts !== null) {
    throw new Error(
      [
        `Timed out waiting for OpenAI Deep Research result after ${resolvedMaxAttempts} attempts`,
        lastStatus ? `last status: ${lastStatus}` : null,
        lastStatusDetails ? `details: ${JSON.stringify(lastStatusDetails)}` : null
      ]
        .filter(Boolean)
        .join("; ")
    );
  }

  // The loop should continue indefinitely when no attempt limit is configured.
  throw new Error(
    [
      "Timed out waiting for OpenAI Deep Research result",
      lastStatus ? `last status: ${lastStatus}` : null,
      lastStatusDetails ? `details: ${JSON.stringify(lastStatusDetails)}` : null
    ]
      .filter(Boolean)
      .join("; ")
  );
}

function outputErrorMessage(response: OpenAIResponsesPayload): string | undefined {
  const errorObj = typeof response.error === "object" && response.error !== null ? (response.error as Record<string, unknown>) : null;
  if (errorObj) {
    const message = typeof errorObj.message === "string" ? errorObj.message : undefined;
    const code = typeof errorObj.code === "string" ? errorObj.code : undefined;
    if (message) {
      return code ? `${message} (code: ${code})` : message;
    }
  }
  const text = extractOutputText(response);
  if (text) {
    return text;
  }
  if (typeof response.status === "string") {
    return `Deep research job ended with status ${response.status}`;
  }
  return undefined;
}
