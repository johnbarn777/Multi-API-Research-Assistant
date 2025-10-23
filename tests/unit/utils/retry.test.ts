import { describe, expect, it, vi } from "vitest";
import { NonRetryableError, retryWithBackoff } from "@/lib/utils/retry";
import type { RetryCallContext } from "@/lib/utils/retry";

describe("retryWithBackoff", () => {
  it("retries with exponential backoff until the operation succeeds", async () => {
    vi.useFakeTimers();

    const attempts = [
      new Error("transient failure"),
      new Error("another transient failure"),
      "success" as const
    ];

    const onRetry = vi.fn();
    const operation = vi.fn(async ({ attempt }: RetryCallContext) => {
      const result = attempts[attempt - 1];
      if (result instanceof Error) {
        throw result;
      }
      return result;
    });

    const promise = retryWithBackoff(operation, {
      initialDelayMs: 100,
      maxAttempts: 3,
      onRetry
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      attempts[0],
      expect.objectContaining({ attempt: 1, maxAttempts: 3, delayMs: 100 })
    );
    expect(onRetry).toHaveBeenNthCalledWith(
      2,
      attempts[1],
      expect.objectContaining({ attempt: 2, maxAttempts: 3, delayMs: 200 })
    );

    vi.useRealTimers();
  });

  it("stops retrying when a NonRetryableError is thrown", async () => {
    vi.useFakeTimers();

    const onRetry = vi.fn();
    const operation = vi.fn(async (_context: RetryCallContext) => {
      throw new NonRetryableError("Do not retry");
    });

    await expect(
      retryWithBackoff(operation, {
        maxAttempts: 5,
        onRetry
      })
    ).rejects.toThrow(NonRetryableError);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("honors retryAfterMs metadata when scheduling retries", async () => {
    vi.useFakeTimers();

    const transientError = Object.assign(new Error("rate limited"), {
      retryAfterMs: 1500
    });

    const attempts = [transientError, "success" as const];
    const onRetry = vi.fn();
    const operation = vi.fn(async ({ attempt }: RetryCallContext) => {
      const result = attempts[attempt - 1];
      if (result instanceof Error) {
        throw result;
      }
      return result;
    });

    const promise = retryWithBackoff(operation, {
      initialDelayMs: 100,
      maxAttempts: 2,
      onRetry
    });

    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      transientError,
      expect.objectContaining({
        attempt: 1,
        maxAttempts: 2,
        delayMs: 1500
      })
    );

    vi.useRealTimers();
  });
});
