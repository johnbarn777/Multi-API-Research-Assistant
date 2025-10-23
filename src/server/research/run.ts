import {
  executeRun as executeOpenAiRun,
  pollResult as pollOpenAiResult
} from "@/lib/providers/openaiDeepResearch";
import { isDemoMode } from "@/config/features";
import { generateContent as generateGeminiContent } from "@/lib/providers/gemini";
import { getDemoProviderResult } from "@/lib/demo/demoFixtures";
import { logger } from "@/lib/utils/logger";
import { wait } from "@/lib/utils/retry";
import { sanitizeForFirestore } from "@/lib/firebase/sanitizeForFirestore";
import {
  getResearchRepository,
  InvalidResearchStateError,
  ResearchNotFoundError,
  type ResearchRepository
} from "@/server/repositories/researchRepository";
import type { ProviderResult, Research, ResearchProviderState, ResearchStatus } from "@/types/research";
import { finalizeResearch } from "@/server/research/finalize";
import { getUserRepository } from "@/server/repositories/userRepository";

type ProviderKind = "openai" | "gemini";

interface ProviderOutcomeSuccess {
  provider: ProviderKind;
  status: "success";
  result: ProviderResult;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  jobId?: string;
}

interface ProviderOutcomeFailure {
  provider: ProviderKind;
  status: "failure";
  error: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  jobId?: string;
}

type ProviderOutcome = ProviderOutcomeSuccess | ProviderOutcomeFailure;

interface ScheduleResearchRunInput {
  researchId: string;
  ownerUid: string;
  userEmail?: string | null;
  requestId?: string;
}

interface ScheduleResearchRunResult {
  research: Research;
  alreadyRunning: boolean;
}

const RUNNABLE_STATUS = "ready_to_run";
const RUNNING_STATUS = "running";

const GEMINI_POLLING_CONFIG = {
  maxAttempts: 10,
  initialDelayMs: 1000
};

function sanitizePrompt(prompt: string | undefined): string | null {
  const trimmed = prompt?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeSessionId(sessionId: string | undefined): string | null {
  const trimmed = sessionId?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeProviderResult(result: ProviderResult): ProviderResult {
  const sanitizedMeta = result.meta
    ? (sanitizeForFirestore(result.meta) as ProviderResult["meta"])
    : undefined;

  const sanitizedRaw = sanitizeForFirestore(result.raw);

  return {
    ...result,
    raw: sanitizedRaw ?? null,
    meta: sanitizedMeta
  };
}

function resolveProviderPatch(outcome: ProviderOutcome): ResearchProviderState {
  if (outcome.status === "success") {
    return {
      status: "success",
      result: sanitizeProviderResult(outcome.result),
      error: null,
      durationMs: outcome.durationMs,
      startedAt: outcome.startedAt,
      completedAt: outcome.completedAt,
      jobId: outcome.jobId
    };
  }

  return {
    status: "failure",
    result: undefined,
    error: outcome.error,
    durationMs: outcome.durationMs,
    startedAt: outcome.startedAt,
    completedAt: outcome.completedAt,
    jobId: outcome.jobId
  };
}

async function settleResearchState({
  repository,
  researchId,
  ownerUid,
  fallbackEmail,
  requestId
}: {
  repository: ResearchRepository;
  researchId: string;
  ownerUid: string;
  fallbackEmail?: string | null;
  requestId?: string;
}): Promise<void> {
  try {
    const research = await repository.getById(researchId, { ownerUid });
    if (!research) {
      return;
    }

    const hasRunning =
      research.dr?.status === "running" || research.gemini?.status === "running";
    const successCount =
      (research.dr?.status === "success" ? 1 : 0) +
      (research.gemini?.status === "success" ? 1 : 0);

    let nextStatus: ResearchStatus;
    if (hasRunning) {
      nextStatus = "running";
    } else {
      nextStatus = successCount > 0 ? "completed" : "failed";
    }

    if (research.status !== nextStatus) {
      await repository.update(
        researchId,
        {
          status: nextStatus
        },
        { ownerUid }
      );
    }

    if (nextStatus === "completed") {
      const userRepository = getUserRepository();

      try {
        const user = await userRepository.getById(ownerUid);
        const normalizedSessionEmail =
          typeof fallbackEmail === "string" && fallbackEmail.trim().length > 0
            ? fallbackEmail.trim()
            : null;
        const normalizedProfileEmail =
          user?.email && user.email.trim().length > 0 ? user.email.trim() : null;
        const emailForFinalize = normalizedProfileEmail ?? normalizedSessionEmail ?? null;

        await finalizeResearch({
          researchId,
          ownerUid,
          userEmail: emailForFinalize,
          fallbackEmail: normalizedSessionEmail,
          requestId
        });
      } catch (error) {
        logger.error("research.run.auto_finalize_failed", {
          researchId,
          ownerUid,
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    logger.error("research.run.settle_failed", {
      researchId,
      ownerUid,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function runOpenAiProvider({
  researchId,
  sessionId,
  prompt,
  requestId,
  topic,
  answers
}: {
  researchId: string;
  sessionId: string;
  prompt: string;
  requestId?: string;
  topic: string;
  answers: Array<{ index: number; answer: string }>;
}): Promise<ProviderOutcome> {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  let jobId: string | undefined;
  const demoMode = isDemoMode();

  if (demoMode) {
    jobId = `demo-openai-${Math.random().toString(36).slice(2, 10)}`;
    logger.info("research.run.openai.demo", {
      researchId,
      requestId,
      jobId
    });

    await wait(200);
    const result = getDemoProviderResult("openai", {
      topic,
      prompt,
      answers
    });
    const completedAt = new Date().toISOString();

    return {
      provider: "openai",
      status: "success",
      result,
      durationMs: Math.max(0, Date.now() - started),
      startedAt,
      completedAt,
      jobId
    };
  }

  try {
    logger.info("research.run.openai.start", {
      researchId,
      requestId
    });

    const execution = await executeOpenAiRun({
      sessionId,
      prompt,
      requestId
    });

    jobId = execution.runId;

    const pollResult = await pollOpenAiResult({
      runId: jobId
    });

    if (!pollResult.result) {
      throw new Error("OpenAI Deep Research did not return a result payload");
    }

    const completedAt = new Date().toISOString();

    logger.info("research.run.openai.completed", {
      researchId,
      requestId,
      runId: jobId
    });

    return {
      provider: "openai",
      status: "success",
      result: pollResult.result,
      durationMs: Math.max(0, Date.now() - started),
      startedAt,
      completedAt,
      jobId
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "OpenAI Deep Research execution failed";

    logger.error("research.run.openai.failed", {
      researchId,
      requestId,
      runId: jobId,
      error: message
    });

    return {
      provider: "openai",
      status: "failure",
      error: message,
      durationMs: Math.max(0, Date.now() - started),
      startedAt,
      completedAt,
      jobId
    };
  }
}

async function runGeminiProvider({
  researchId,
  prompt,
  requestId,
  topic,
  answers
}: {
  researchId: string;
  prompt: string;
  requestId?: string;
  topic: string;
  answers: Array<{ index: number; answer: string }>;
}): Promise<ProviderOutcome> {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const demoMode = isDemoMode();

  if (demoMode) {
    logger.info("research.run.gemini.demo", {
      researchId,
      requestId
    });

    await wait(180);
    const result = getDemoProviderResult("gemini", {
      topic,
      prompt,
      answers
    });
    const completedAt = new Date().toISOString();

    return {
      provider: "gemini",
      status: "success",
      result,
      durationMs: Math.max(0, Date.now() - started),
      startedAt,
      completedAt
    };
  }

  try {
    logger.info("research.run.gemini.start", {
      researchId,
      requestId
    });

    const result = await generateGeminiContent({
      prompt,
      polling: GEMINI_POLLING_CONFIG
    });

    const completedAt = new Date().toISOString();

    logger.info("research.run.gemini.completed", {
      researchId,
      requestId
    });

    return {
      provider: "gemini",
      status: "success",
      result,
      durationMs: Math.max(0, Date.now() - started),
      startedAt,
      completedAt
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Gemini execution failed";

    logger.error("research.run.gemini.failed", {
      researchId,
      requestId,
      error: message
    });

    return {
      provider: "gemini",
      status: "failure",
      error: message,
      durationMs: Math.max(0, Date.now() - started),
      startedAt,
      completedAt
    };
  }
}

async function executeProviders({
  repository,
  researchId,
  ownerUid,
  sessionId,
  finalPrompt,
  requestId,
  topic,
  answers,
  fallbackEmail
}: {
  repository: ResearchRepository;
  researchId: string;
  ownerUid: string;
  sessionId: string;
  finalPrompt: string;
  requestId?: string;
  topic: string;
  answers: Array<{ index: number; answer: string }>;
  fallbackEmail?: string | null;
}): Promise<void> {
  let openAiOutcome: ProviderOutcome | null = null;
  let geminiOutcome: ProviderOutcome | null = null;

  try {
    const [openAiResult, geminiResult] = await Promise.all([
      runOpenAiProvider({
        researchId,
        sessionId,
        prompt: finalPrompt,
        requestId,
        topic,
        answers
      }).then(async (outcome) => {
        openAiOutcome = outcome;
        await repository.update(
          researchId,
          {
            dr: resolveProviderPatch(outcome)
          },
          { ownerUid }
        );
        return outcome;
      }),
      runGeminiProvider({
        researchId,
        prompt: finalPrompt,
        requestId,
        topic,
        answers
      }).then(async (outcome) => {
        geminiOutcome = outcome;
        await repository.update(
          researchId,
          {
            gemini: resolveProviderPatch(outcome)
          },
          { ownerUid }
        );
        return outcome;
      })
    ]);

    openAiOutcome = openAiResult;
    geminiOutcome = geminiResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider execution failed";
    logger.error("research.run.providers.persist_failed", {
      researchId,
      requestId,
      error: message
    });

    // Attempt to mark the research as failed while preserving the latest provider outcomes.
    const fallbackPatch: Record<string, ResearchProviderState | undefined> = {};
    if (openAiOutcome) {
      fallbackPatch.dr = resolveProviderPatch(openAiOutcome);
    }
    if (geminiOutcome) {
      fallbackPatch.gemini = resolveProviderPatch(geminiOutcome);
    }

    await repository
      .update(
        researchId,
        {
          status: "failed",
          ...(fallbackPatch.dr ? { dr: fallbackPatch.dr } : {}),
          ...(fallbackPatch.gemini ? { gemini: fallbackPatch.gemini } : {})
        },
        { ownerUid }
      )
      .catch((persistError) => {
        logger.error("research.run.providers.final_persist_failed", {
          researchId,
          requestId,
          error: persistError instanceof Error ? persistError.message : String(persistError)
        });
      });

    return;
  }

  await settleResearchState({
    repository,
    researchId,
    ownerUid,
    fallbackEmail,
    requestId
  });
}

export async function scheduleResearchRun({
  researchId,
  ownerUid,
  userEmail,
  requestId
}: ScheduleResearchRunInput): Promise<ScheduleResearchRunResult> {
  const sessionEmail = userEmail ? String(userEmail).trim() : null;
  const repository = getResearchRepository();
  const research = await repository.getById(researchId, { ownerUid });

  if (!research) {
    throw new ResearchNotFoundError(researchId);
  }

  if (research.status === RUNNING_STATUS) {
    logger.info("research.run.already_running", {
      researchId,
      requestId
    });
    return {
      research,
      alreadyRunning: true
    };
  }

  if (research.status !== RUNNABLE_STATUS) {
    throw new InvalidResearchStateError(
      `Research ${researchId} is not ready to run (current status: ${research.status})`
    );
  }

  const finalPrompt = sanitizePrompt(research.dr.finalPrompt);
  if (!finalPrompt) {
    throw Object.assign(new Error("Research does not have a final prompt to execute"), {
      statusCode: 409
    });
  }

  const sessionId = sanitizeSessionId(research.dr.sessionId);
  if (!sessionId) {
    throw Object.assign(new Error("Research is missing the OpenAI Deep Research sessionId"), {
      statusCode: 409
    });
  }

  const startedAt = new Date().toISOString();

  const updated = await repository.update(
    researchId,
    {
      status: RUNNING_STATUS,
      dr: {
        status: "running",
        startedAt,
        completedAt: undefined,
        durationMs: 0,
        error: null,
        result: undefined,
        jobId: undefined
      },
      gemini: {
        status: "running",
        startedAt,
        completedAt: undefined,
        durationMs: 0,
        error: null,
        result: undefined,
        jobId: undefined
      }
    },
    { ownerUid }
  );

  logger.info("research.run.started", {
    researchId,
    ownerUid,
    requestId
  });

  void executeProviders({
    repository,
    researchId,
    ownerUid,
    sessionId,
    finalPrompt,
    requestId,
    topic: research.title,
    answers: research.dr.answers ?? [],
    fallbackEmail: sessionEmail
  }).catch((error) => {
    logger.error("research.run.unhandled_error", {
      researchId,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return {
    research: updated,
    alreadyRunning: false
  };
}

interface RetryProviderRunInput {
  provider: ProviderKind;
  researchId: string;
  ownerUid: string;
  userEmail?: string | null;
  requestId?: string;
}

interface RetryProviderRunResult {
  research: Research;
  alreadyRunning: boolean;
}

export async function retryProviderRun({
  provider,
  researchId,
  ownerUid,
  userEmail,
  requestId
}: RetryProviderRunInput): Promise<RetryProviderRunResult> {
  const sessionEmail = userEmail ? String(userEmail).trim() : null;
  const repository = getResearchRepository();
  const research = await repository.getById(researchId, { ownerUid });

  if (!research) {
    throw new ResearchNotFoundError(researchId);
  }

  if (research.status === RUNNING_STATUS) {
    logger.info("research.retry.already_running", {
      researchId,
      provider,
      requestId
    });
    return {
      research,
      alreadyRunning: true
    };
  }

  const targetProvider = provider === "openai" ? research.dr : research.gemini;
  if (targetProvider?.status === "running") {
    logger.info("research.retry.provider_already_running", {
      researchId,
      provider,
      requestId
    });
    return {
      research,
      alreadyRunning: true
    };
  }

  const finalPrompt = sanitizePrompt(research.dr.finalPrompt);
  if (!finalPrompt) {
    throw Object.assign(new Error("Research does not have a final prompt to execute"), {
      statusCode: 409
    });
  }

  const sessionId = sanitizeSessionId(research.dr.sessionId);
  if (provider === "openai" && !sessionId) {
    throw Object.assign(new Error("Research is missing the OpenAI Deep Research sessionId"), {
      statusCode: 409
    });
  }

  const startedAt = new Date().toISOString();
  const providerPatch: ResearchProviderState = {
    status: "running",
    startedAt,
    completedAt: undefined,
    durationMs: 0,
    error: null,
    result: undefined,
    jobId: undefined
  };

  const updated = await repository.update(
    researchId,
    {
      status: RUNNING_STATUS,
      ...(provider === "openai" ? { dr: providerPatch } : {}),
      ...(provider === "gemini" ? { gemini: providerPatch } : {})
    },
    { ownerUid }
  );

  logger.info("research.retry.provider_start", {
    researchId,
    provider,
    ownerUid,
    requestId
  });

  const answers = research.dr.answers ?? [];
  void (async () => {
    const startedTimestamp = Date.now();
    try {
      const outcome =
        provider === "openai"
          ? await runOpenAiProvider({
              researchId,
              sessionId: sessionId!,
              prompt: finalPrompt,
              requestId,
              topic: research.title,
              answers
            })
          : await runGeminiProvider({
              researchId,
              prompt: finalPrompt,
              requestId,
              topic: research.title,
              answers
            });

      await repository.update(
        researchId,
        provider === "openai"
          ? {
              dr: resolveProviderPatch(outcome)
            }
          : {
              gemini: resolveProviderPatch(outcome)
            },
        { ownerUid }
      );

      await settleResearchState({
        repository,
        researchId,
        ownerUid,
        fallbackEmail: sessionEmail,
        requestId
      });
    } catch (error) {
      logger.error("research.retry.provider_unhandled", {
        researchId,
        provider,
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      const completedAt = new Date().toISOString();
      const fallbackOutcome: ProviderOutcome = {
        provider,
        status: "failure",
        error: error instanceof Error ? error.message : "Provider execution failed",
        durationMs: Math.max(0, Date.now() - startedTimestamp),
        startedAt,
        completedAt,
        jobId: undefined
      };

      await repository
        .update(
          researchId,
          {
            status: "failed",
            ...(provider === "openai"
              ? { dr: resolveProviderPatch(fallbackOutcome) }
              : { gemini: resolveProviderPatch(fallbackOutcome) })
          },
          { ownerUid }
        )
        .catch((persistError) => {
          logger.error("research.retry.status_update_failed", {
            researchId,
            provider,
            requestId,
            error: persistError instanceof Error ? persistError.message : String(persistError)
          });
        });
    }
  })();

  return {
    research: updated,
    alreadyRunning: false
  };
}
