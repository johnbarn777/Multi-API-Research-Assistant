import { buildResearchPdf } from "@/lib/pdf/builder";
import { persistResearchPdf } from "@/lib/pdf/storage";
import { logger } from "@/lib/utils/logger";
import { isDemoMode } from "@/config/features";
import {
  sendResearchReportEmail,
  type SendResearchReportResult
} from "@/server/email/sendResearchReport";
import {
  getResearchRepository,
  InvalidResearchStateError,
  ResearchNotFoundError,
  type ResearchRepository
} from "@/server/repositories/researchRepository";
import type { ProviderResult } from "@/types/research";

interface FinalizeResearchInput {
  researchId: string;
  ownerUid: string;
  userEmail?: string | null;
  fallbackEmail?: string | null;
  requestId?: string;
  sendEmail?: boolean;
}

export interface FinalizeResearchResult {
  pdfBuffer: Buffer;
  pdfPath: string | null;
  storageStatus: "uploaded" | "skipped";
  openAi: ProviderResult | null;
  gemini: ProviderResult | null;
  filename: string;
  emailResult: SendResearchReportResult | null;
}

function isAllowedStatus(status: string): status is "completed" | "failed" {
  return status === "completed" || status === "failed";
}

function resolveCreatedAt(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    const dateValue = (value as { toDate: () => Date }).toDate();
    return dateValue.toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function slugifyTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? `${normalized}.pdf` : "report.pdf";
}

export async function finalizeResearch({
  researchId,
  ownerUid,
  userEmail,
  fallbackEmail,
  requestId,
  sendEmail
}: FinalizeResearchInput): Promise<FinalizeResearchResult> {
  const repository: ResearchRepository = getResearchRepository();

  const research = await repository.getById(researchId, { ownerUid });
  if (!research) {
    throw new ResearchNotFoundError(researchId);
  }

  if (!isAllowedStatus(research.status)) {
    throw new InvalidResearchStateError(
      "Research must finish provider runs before finalizing the report"
    );
  }

  const createdAtIso = resolveCreatedAt(research.createdAt);
  const normalizedUserEmail =
    typeof userEmail === "string" && userEmail.trim().length > 0 ? userEmail.trim() : "";
  const normalizedFallbackEmail =
    typeof fallbackEmail === "string" && fallbackEmail.trim().length > 0 ? fallbackEmail.trim() : "";
  const normalizedStoredEmail =
    typeof research.report?.emailedTo === "string" && research.report.emailedTo.trim().length > 0
      ? research.report.emailedTo.trim()
      : "";
  const demoMode = isDemoMode();
  const fallbackDemoEmail = demoMode ? `demo-user+${ownerUid}@example.com` : null;
  const resolvedEmail =
    normalizedUserEmail || normalizedFallbackEmail || normalizedStoredEmail || fallbackDemoEmail || null;
  const emailForReport =
    (resolvedEmail ?? normalizedFallbackEmail ?? normalizedStoredEmail) || "unknown@user";
  const shouldSendEmail = sendEmail !== false;

  logger.info("research.finalize.start", {
    researchId,
    ownerUid,
    requestId
  });

  const pdfBytes = await buildResearchPdf({
    title: research.title,
    userEmail: emailForReport,
    createdAt: createdAtIso,
    openAi: research.dr.result ?? null,
    gemini: research.gemini.result ?? null
  });

  const pdfBuffer = Buffer.from(pdfBytes);
  const filename = slugifyTitle(research.title);

  const storageResult = await persistResearchPdf({
    researchId,
    buffer: pdfBuffer,
    filename
  });

  await repository.update(
    researchId,
    {
      report: {
        ...research.report,
        pdfPath: storageResult.path ?? undefined
      }
    },
    { ownerUid }
  );

  logger.info("research.finalize.completed", {
    researchId,
    ownerUid,
    requestId,
    storageStatus: storageResult.status,
    pdfPath: storageResult.path
  });

  let emailResult: SendResearchReportResult | null = null;

  if (!shouldSendEmail) {
    logger.info("research.finalize.skip_email", {
      researchId,
      ownerUid,
      requestId
    });
  } else if (resolvedEmail) {
    try {
      emailResult = await sendResearchReportEmail({
        researchId,
        ownerUid,
        to: resolvedEmail,
        title: research.title,
        filename,
        pdfBuffer,
        requestId
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unexpected email delivery failure";

      logger.error("research.finalize.email_unexpected", {
        researchId,
        ownerUid,
        requestId,
        error: reason
      });

      await repository.update(
        researchId,
        {
          report: {
            emailedTo: resolvedEmail,
            emailStatus: "failed",
            emailError: reason
          }
        },
        { ownerUid }
      );

      emailResult = {
        status: "failed",
        provider: "none",
        messageId: null,
        errorMessage: reason
      };
    }
  } else if (shouldSendEmail) {
    const reason = "User email not available for delivery";
    await repository.update(
      researchId,
      {
        report: {
          emailStatus: "failed",
          emailError: reason
        }
      },
      { ownerUid }
    );

    emailResult = {
      status: "failed",
      provider: "none",
      messageId: null,
      errorMessage: reason
    };
  }

  return {
    pdfBuffer,
    pdfPath: storageResult.path ?? null,
    storageStatus: storageResult.status,
    openAi: research.dr.result ?? null,
    gemini: research.gemini.result ?? null,
    filename,
    emailResult
  };
}
