import { getServerEnv } from "@/config/env";
import {
  sendWithGmail,
  sendWithSendgrid,
  type GmailSendResult,
  type GmailTokens
} from "@/lib/email";
import { encryptGmailToken } from "@/lib/security/crypto";
import { logger } from "@/lib/utils/logger";
import { getResearchRepository } from "@/server/repositories/researchRepository";
import { getUserRepository } from "@/server/repositories/userRepository";

export interface SendResearchReportInput {
  researchId: string;
  ownerUid: string;
  to: string;
  title: string;
  filename: string;
  pdfBuffer: Buffer;
}

export interface SendResearchReportResult {
  status: "sent" | "failed";
  provider: "gmail" | "sendgrid" | "none";
  messageId: string | null;
  errorMessage?: string | null;
  gmailAttempt?: {
    ok: boolean;
    reason?: string;
    shouldInvalidateCredentials?: boolean;
  };
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

function toEncryptedTokens(tokens?: GmailTokens | null): GmailTokens | null {
  if (!tokens) {
    return null;
  }

  const next: GmailTokens = {};

  if (tokens.access_token) {
    next.access_token = encryptGmailToken(tokens.access_token);
  }
  if (tokens.refresh_token) {
    next.refresh_token = encryptGmailToken(tokens.refresh_token);
  }
  if (typeof tokens.expiry_date === "number") {
    next.expiry_date = tokens.expiry_date;
  }
  if (tokens.scope) {
    next.scope = tokens.scope;
  }

  return next;
}

export async function sendResearchReportEmail(
  input: SendResearchReportInput
): Promise<SendResearchReportResult> {
  const env = getServerEnv();
  const subject = buildSubject(input.title);
  const body = buildBody(env.APP_BASE_URL, input.researchId, input.title);

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

  let gmailAttempt: GmailSendResult | null = null;

  if (gmailTokens) {
    gmailAttempt = await sendWithGmail({
      to: input.to,
      subject,
      body,
      pdfBuffer: input.pdfBuffer,
      filename: input.filename,
      tokens: gmailTokens,
      from: input.to
    });

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
