import { adminDb } from "@/lib/firebase/admin";
import { logger } from "@/lib/utils/logger";
import { wait } from "@/lib/utils/retry";

const COLLECTION_NAME = "rate_limits";
const DOCUMENT_ID = "openai_deep_research";
const ONE_MINUTE_MS = 60_000;
const MIN_WAIT_MS = 250;
const MAX_RETRIES = 5;

class DistributedRateLimitError extends Error {
  constructor(public readonly waitMs: number) {
    super(`Distributed rate limit exceeded. Retry after ${waitMs}ms.`);
    this.name = "DistributedRateLimitError";
  }
}

export async function acquireDistributedOpenAiSlot(limit: number, requestId?: string): Promise<void> {
  if (!Number.isFinite(limit) || limit <= 0) {
    return;
  }

  const db = adminDb();
  const docRef = db.collection(COLLECTION_NAME).doc(DOCUMENT_ID);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const now = Date.now();

    try {
      await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(docRef);
        const data = snapshot.exists ? (snapshot.data() as { timestamps?: number[] }) : {};
        const timestamps = Array.isArray(data.timestamps) ? data.timestamps : [];

        const window = timestamps
          .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < ONE_MINUTE_MS)
          .sort((a, b) => a - b);

        if (window.length >= limit) {
          const nextAvailable = window[0] + ONE_MINUTE_MS;
          const waitMs = Math.max(MIN_WAIT_MS, nextAvailable - now);
          throw new DistributedRateLimitError(waitMs);
        }

        window.push(now);
        tx.set(docRef, { timestamps: window }, { merge: false });
      });

      logger.info("openai.deepResearch.rate_limit.distributed", {
        provider: "openai-deep-research",
        limitPerMinute: limit,
        attempt: attempt + 1,
        requestId
      });

      return;
    } catch (error) {
      if (error instanceof DistributedRateLimitError) {
        logger.info("openai.deepResearch.rate_limit.distributed_wait", {
          provider: "openai-deep-research",
          limitPerMinute: limit,
          waitMs: error.waitMs,
          attempt: attempt + 1,
          requestId
        });
        await wait(error.waitMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to acquire distributed OpenAI Deep Research slot after retries");
}
