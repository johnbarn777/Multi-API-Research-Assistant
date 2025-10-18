import { getServerEnv } from "@/config/env";
import { isDemoMode } from "@/config/features";
import {
  sendWithGmail,
  sendWithSendgrid,
  type GmailSendResult,
  type GmailSendFailure,
  type GmailTokens
} from "@/lib/email";
import { buildDemoEmailPreview } from "@/lib/demo/demoFixtures";
import { encryptGmailToken } from "@/lib/security/crypto";
import { logger } from "@/lib/utils/logger";
import { NonRetryableError, retryWithBackoff } from "@/lib/utils/retry";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import { getUserRepository } from "@/server/repositories/userRepository";
import type { GmailOAuthTokens } from "@/types/research";

export interface SendResearchReportInput {
  researchId: string;
  ownerUid: string;
  to: string;
  title: string;
  filename: string;
  pdfBuffer: Buffer;
  requestId?: string;
}

export interface SendResearchReportResult {
  status: "sent" | "failed";
  provider: "gmail" | "sendgrid" | "demo" | "none";
  messageId: string | null;
  errorMessage?: string | null;
  gmailAttempt?: {
    ok: boolean;
    reason?: string;
    shouldInvalidateCredentials?: boolean;
  };
  preview?: string;
}

const APP_SIGNATURE = "— Multi-API Research Assistant";

function buildSubject(title: string) {
  return `${title} — Research report`;
}

function buildBody(appBaseUrl: string, researchId: string, title: string) {
  const detailUrl = `${appBaseUrl}/research/${encodeURIComponent(researchId)}`;

  return [
    "Hi there,",
    "",
    `Your research session "${title}" is complete. We've attached the PDF report for your records.`,
    "",
    "You can also revisit the session online:",
    detailUrl,
    "",
    APP_SIGNATURE
  ].join("\n");
}

function truncateError(message: string | undefined, maxLength = 500) {
  if (!message) {
    return null;
  }

  if (message.length <= maxLength) {
    return message;
  }

  return `${message.slice(0, maxLength - 1)}…`;
}

function toEncryptedTokens(tokens?: GmailTokens | null): GmailOAuthTokens | null {
  if (!tokens) {
    return null;
  }

  const next: GmailOAuthTokens = {};

  if (tokens.access_token) {
    next.access_token = encryptGmailToken(tokens.access_token);
  }
  if (tokens.refresh_token) {
    next.refresh_token = encryptGmailToken(tokens.refresh_token);
  }
  if (typeof tokens.expiry_date === "number") {
    next.expiry_date = tokens.expiry_date;
  }
  if (typeof tokens.scope === "string" && tokens.scope.length > 0) {
    next.scope = tokens.scope;
  }

  return next;
}

type GmailSendParams = Parameters<typeof sendWithGmail>[0];

function isGmailFailureResult(value: unknown): value is GmailSendFailure {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (!("ok" in (value as Record<string, unknown>))) {
    return false;
  }
  return (value as { ok?: unknown }).ok === false;
}

function extractGmailFailure(error: unknown): GmailSendFailure | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("cause" in error && isGmailFailureResult((error as { cause?: unknown }).cause)) {
    return (error as { cause: GmailSendFailure }).cause;
  }

  return null;
}

async function sendGmailWithRetry(
  params: GmailSendParams,
  context: { researchId: string; ownerUid: string; requestId?: string }
): Promise<GmailSendResult> {
  try {
    return await retryWithBackoff(
      async () => {
        const result = await sendWithGmail(params);
        if (result.ok) {
          return result;
        }

        const message = result.reason ?? "Failed to send email with Gmail";

        if (result.shouldInvalidateCredentials) {
          throw new NonRetryableError(message, { cause: result });
        }

        const retryError = new Error(message);
        (retryError as { cause?: unknown }).cause = result;
        throw retryError;
      },
      {
        maxAttempts: 2,
        initialDelayMs: 500,
        onRetry: (error, attemptContext) => {
          const failure = extractGmailFailure(error);
          logger.warn("email.gmail.retry", {
            researchId: context.researchId,
            ownerUid: context.ownerUid,
            requestId: context.requestId,
            attempt: attemptContext.attempt,
            maxAttempts: attemptContext.maxAttempts,
            delayMs: attemptContext.delayMs,
            reason:
              failure?.reason ??
              (error instanceof Error ? error.message : String(error))
          });
        }
      }
    );
  } catch (error) {
    const failure = extractGmailFailure(error);
    if (failure) {
      return failure;
    }

    const reason =
      error instanceof Error ? error.message : "Failed to send email with Gmail";

    logger.error("email.gmail.retry_unexpected", {
      researchId: context.researchId,
      ownerUid: context.ownerUid,
      requestId: context.requestId,
      reason
    });

    return {
      ok: false,
      reason,
      error
    };
  }
}

export async function sendResearchReportEmail(
  input: SendResearchReportInput
): Promise<SendResearchReportResult> {
  const env = getServerEnv();
  const subject = buildSubject(input.title);
  const body = buildBody(env.APP_BASE_URL, input.researchId, input.title);
  const demoMode = isDemoMode();

  const researchRepository = getResearchRepository();
  const userRepository = getUserRepository();

  await researchRepository.update(
    input.researchId,
    {
      report: {
        emailedTo: input.to,
        emailStatus: "queued",
        emailError: null
      }
    },
    { ownerUid: input.ownerUid }
  );

  const user = await userRepository.getById(input.ownerUid);
  const gmailTokens = user?.gmail_oauth;

  if (demoMode) {
    const preview = buildDemoEmailPreview({
      to: input.to,
      subject,
      body,
      filename: input.filename,
      pdfSize: input.pdfBuffer.byteLength
    });

    const messageId = `demo-email-${Math.random().toString(36).slice(2, 10)}`;

    await researchRepository.update(
      input.researchId,
      {
        report: {
          emailedTo: input.to,
          emailStatus: "sent",
          emailError: null
        }
      },
      { ownerUid: input.ownerUid }
    );

    logger.info("email.delivery.demo", {
      researchId: input.researchId,
      ownerUid: input.ownerUid,
      requestId: input.requestId,
      messageId
    });

    return {
      status: "sent",
      provider: "demo",
      messageId,
      preview
    };
  }

  let gmailAttempt: GmailSendResult | null = null;

  if (gmailTokens) {
    gmailAttempt = await sendGmailWithRetry(
      {
        to: input.to,
        subject,
        body,
        pdfBuffer: input.pdfBuffer,
        filename: input.filename,
        tokens: gmailTokens,
        from: input.to
      },
      {
        researchId: input.researchId,
        ownerUid: input.ownerUid,
        requestId: input.requestId
      }
    );

    if (gmailAttempt.ok) {
      if (gmailAttempt.tokens) {
        await userRepository.upsertGmailTokens(
          input.ownerUid,
          toEncryptedTokens(gmailAttempt.tokens)
        );
      }

      await researchRepository.update(
        input.researchId,
        {
          report: {
            emailedTo: input.to,
            emailStatus: "sent",
            emailError: null
          }
        },
        { ownerUid: input.ownerUid }
      );

      return {
        status: "sent",
        provider: "gmail",
        messageId: gmailAttempt.messageId ?? null,
        gmailAttempt: {
          ok: true
        }
      };
    }

    if (gmailAttempt.shouldInvalidateCredentials) {
      await userRepository.upsertGmailTokens(input.ownerUid, null);
    } else if (gmailAttempt.tokens) {
      await userRepository.upsertGmailTokens(
        input.ownerUid,
        toEncryptedTokens(gmailAttempt.tokens)
      );
    }
  }

  const sendgridResult = await sendWithSendgrid({
    to: input.to,
    subject,
    body,
    pdfBuffer: input.pdfBuffer,
    filename: input.filename
  });

  let status: SendResearchReportResult["status"];
  let provider: SendResearchReportResult["provider"];
  let messageId: string | null;
  let errorMessage: string | null = null;

  if (sendgridResult.ok) {
    status = "sent";
    provider = "sendgrid";
    messageId = sendgridResult.messageId;
  } else {
    status = "failed";
    provider = "sendgrid";
    messageId = null;

    const fallbackReason = truncateError(sendgridResult.reason);
    const gmailReason =
      gmailAttempt && !gmailAttempt.ok ? truncateError(gmailAttempt.reason) : null;

    errorMessage = [gmailReason, fallbackReason].filter(Boolean).join("; ").trim() || null;

    logger.error("email.delivery.failed", {
      researchId: input.researchId,
      ownerUid: input.ownerUid,
      requestId: input.requestId,
      gmailReason: gmailReason ?? undefined,
      sendgridReason: fallbackReason ?? undefined
    });
  }

  await researchRepository.update(
    input.researchId,
    {
      report: {
        emailedTo: input.to,
        emailStatus: status,
        emailError: status === "failed" ? errorMessage ?? "Email delivery failed" : null
      }
    },
    { ownerUid: input.ownerUid }
  );

  return {
    status,
    provider,
    messageId,
    errorMessage,
    gmailAttempt: gmailAttempt
      ? {
          ok: gmailAttempt.ok,
          reason: gmailAttempt.ok ? undefined : gmailAttempt.reason,
          shouldInvalidateCredentials: gmailAttempt.ok
            ? undefined
            : gmailAttempt.shouldInvalidateCredentials
        }
      : undefined
  };
}
