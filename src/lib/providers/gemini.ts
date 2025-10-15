import { getServerEnv } from "@/config/env";
import { normalizeGeminiResult } from "@/lib/providers/normalizers";
import { logger } from "@/lib/utils/logger";
import type { ProviderResult } from "@/types/research";

interface GenerateContentOptions {
  prompt: string;
  generationConfig?: Record<string, unknown>;
  polling?: PollingOptions;
}

interface PollingOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
}

const DEFAULT_GEMINI_HEADERS = {
  "Content-Type": "application/json"
} satisfies HeadersInit;

const DEFAULT_POLLING_ATTEMPTS = 10;
const DEFAULT_POLLING_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  {
    operation,
    maxAttempts = 3,
    initialDelayMs = 500
  }: { operation: string; maxAttempts?: number; initialDelayMs?: number }
): Promise<Response> {
  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status);
        const errorBody = await safeJson(response);
        if (!shouldRetry) {
          throw new Error(
            `Gemini ${operation} failed with status ${response.status}: ${JSON.stringify(errorBody)}`
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

      logger.warn("gemini.request.retry", {
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

  const message =
    lastError instanceof Error
      ? lastError.message
      : `Gemini ${operation} failed after ${maxAttempts} attempts`;
  logger.error("gemini.request.failed", {
    operation,
    attempts: maxAttempts,
    error: message
  });
  throw lastError instanceof Error ? lastError : new Error(message);
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
    logger.warn("gemini.response.parse_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

export async function generateContent({
  prompt,
  generationConfig,
  polling
}: GenerateContentOptions): Promise<ProviderResult> {
  const env = getServerEnv();
  const base = env.GEMINI_BASE_URL.replace(/\/$/, "");
  const url = `${base}/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${env.GEMINI_API_KEY}`;

  logger.info("gemini.generate.start", {
    provider: "gemini",
    promptLength: prompt.length
  });

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  if (generationConfig) {
    body.generationConfig = generationConfig;
  }

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: DEFAULT_GEMINI_HEADERS,
      body: JSON.stringify(body)
    },
    { operation: "generateContent" }
  );

  const payload = await safeJson(response);
  const data = (payload ?? {}) as Record<string, any>;

  if (Array.isArray(data.candidates)) {
    const normalized = normalizeGeminiResult(data);
    return normalized;
  }

  const name = typeof data.name === "string" ? data.name : undefined;
  const done = data.done === true;

  if (done && data.response) {
    return normalizeGeminiResult(data.response as Record<string, unknown>);
  }

  if (!name) {
    throw new Error("Gemini generateContent response did not include candidates or operation name");
  }

  if (!polling) {
    logger.warn("gemini.generate.pending_without_poll", {
      operationName: name
    });
    throw new Error(
      "Gemini generation is pending; provide polling options to wait for completion"
    );
  }

  return pollOperation(name, polling);
}

export async function pollOperation(
  operationName: string,
  {
    maxAttempts = DEFAULT_POLLING_ATTEMPTS,
    initialDelayMs = DEFAULT_POLLING_DELAY_MS
  }: PollingOptions = {}
): Promise<ProviderResult> {
  const env = getServerEnv();
  const base = env.GEMINI_BASE_URL.replace(/\/$/, "");
  const url = `${base}/${operationName}?key=${env.GEMINI_API_KEY}`;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxAttempts) {
    logger.info("gemini.generate.poll", {
      operationName,
      attempt: attempt + 1
    });

    const response = await fetchWithRetry(
      url,
      { method: "GET" },
      { operation: "pollOperation" }
    );

    const payload = await safeJson(response);
    const data = (payload ?? {}) as Record<string, any>;

    if (data.done === true) {
      const resultPayload = data.response ?? data.result ?? data;
      return normalizeGeminiResult(resultPayload as Record<string, unknown>);
    }

    if (data.error) {
      const errorMessage =
        typeof data.error.message === "string"
          ? data.error.message
          : "Gemini operation returned an error";
      throw new Error(errorMessage);
    }

    attempt += 1;
    if (attempt >= maxAttempts) {
      break;
    }

    await sleep(delay);
    delay *= 2;
  }

  throw new Error(`Gemini operation ${operationName} did not complete after ${maxAttempts} attempts`);
}
