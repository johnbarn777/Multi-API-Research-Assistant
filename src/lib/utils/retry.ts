export interface RetryCallContext {
  /**
   * 1-based index of the attempt being executed.
   */
  attempt: number;
  /**
   * Maximum number of attempts that will be performed.
   */
  maxAttempts: number;
}

export interface RetryAttemptContext extends RetryCallContext {
  /**
   * Delay in milliseconds that will be awaited before the next attempt.
   */
  delayMs: number;
}

export interface RetryWithBackoffOptions {
  /**
   * Maximum number of attempts (including the initial attempt). Defaults to 3.
   */
  maxAttempts?: number;
  /**
   * Delay in milliseconds before the first retry. Defaults to 500ms.
   */
  initialDelayMs?: number;
  /**
   * Multiplier applied to the delay after each retry. Defaults to 2 (exponential backoff).
   */
  multiplier?: number;
  /**
   * Optional hook invoked after a failed attempt when another retry will be scheduled.
   */
  onRetry?(error: unknown, context: RetryAttemptContext): void | Promise<void>;
  /**
   * Predicate determining whether a retry should occur. When omitted, all errors
   * except `NonRetryableError` instances will be retried (up to `maxAttempts`).
   */
  shouldRetry?(error: unknown, context: RetryAttemptContext): boolean;
}

export class NonRetryableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "NonRetryableError";

    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function defaultShouldRetry(error: unknown): boolean {
  return !(error instanceof NonRetryableError);
}

export async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryWithBackoff<T>(
  operation: (context: RetryCallContext) => Promise<T>,
  options: RetryWithBackoffOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    multiplier = 2,
    onRetry,
    shouldRetry = defaultShouldRetry
  } = options;

  if (maxAttempts < 1) {
    throw new Error("maxAttempts must be at least 1");
  }

  let attemptIndex = 0;
  let delay = initialDelayMs;
  let lastError: unknown;

  while (attemptIndex < maxAttempts) {
    const attemptNumber = attemptIndex + 1;

    try {
      return await operation({ attempt: attemptNumber, maxAttempts });
    } catch (error) {
      lastError = error;

      if (attemptNumber >= maxAttempts) {
        break;
      }

      const retryAfterMs =
        error && typeof error === "object" && "retryAfterMs" in error
          ? Number((error as { retryAfterMs?: unknown }).retryAfterMs)
          : undefined;
      let delayForAttempt = delay;
      if (Number.isFinite(retryAfterMs) && (retryAfterMs as number) > 0) {
        delayForAttempt = Math.max(delayForAttempt, Math.ceil(retryAfterMs as number));
      }

      const retryContext: RetryAttemptContext = {
        attempt: attemptNumber,
        maxAttempts,
        delayMs: delayForAttempt
      };

      if (!shouldRetry(error, retryContext)) {
        throw error;
      }

      if (onRetry) {
        await onRetry(error, retryContext);
      }

      await wait(retryContext.delayMs);
      const nextDelay = retryContext.delayMs * multiplier;
      delay = Math.max(delay * multiplier, nextDelay);
    }

    attemptIndex += 1;
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Retry failed"));
}
