import { getServerEnv } from "@/config/env";
import { normalizeGeminiResult, type GeminiGenerateContentPayload } from "@/lib/providers/normalizers";
import { logger } from "@/lib/utils/logger";
import { NonRetryableError, retryWithBackoff, wait } from "@/lib/utils/retry";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface GeminiOperationResponse extends GeminiGenerateContentPayload {
  name?: string;
  done?: boolean;
  response?: GeminiGenerateContentPayload;
  result?: GeminiGenerateContentPayload;
  error?: {
    message?: string;
  };
}

function toGeminiOperationResponse(value: unknown): GeminiOperationResponse {
  return isRecord(value) ? (value as GeminiOperationResponse) : {};
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
  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, init);
        if (!response.ok) {
          const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status);
          const errorBody = await safeJson(response);
          const baseMessage = `Gemini ${operation} failed with status ${response.status}`;
          if (!shouldRetry) {
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
          logger.warn("gemini.request.retry", {
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
        : `Gemini ${operation} failed after ${maxAttempts} attempts`;

    const status =
      error && typeof error === "object" && "status" in error
        ? (error as { status?: number }).status
        : undefined;

    logger.error("gemini.request.failed", {
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
  const data = toGeminiOperationResponse(payload);

  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    return normalizeGeminiResult(data);
  }

  const name = typeof data.name === "string" ? data.name : undefined;
  const isDone = data.done === true;

  if (isDone && isRecord(data.response)) {
    return normalizeGeminiResult(data.response as GeminiGenerateContentPayload);
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
    const data = toGeminiOperationResponse(payload);

    if (data.done === true) {
      const resultPayload = data.response ?? data.result ?? data;
      return normalizeGeminiResult(resultPayload);
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

    await wait(delay);
    delay *= 2;
  }

  throw new Error(`Gemini operation ${operationName} did not complete after ${maxAttempts} attempts`);
}
