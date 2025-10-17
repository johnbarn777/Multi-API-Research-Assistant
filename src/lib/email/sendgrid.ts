import sgMail from "@sendgrid/mail";
import { getServerEnv } from "@/config/env";
import { logger } from "@/lib/utils/logger";

type SendgridParams = {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  filename: string;
  from?: string;
};

export type SendgridSuccess = {
  ok: true;
  messageId: string | null;
};

export type SendgridFailure = {
  ok: false;
  reason: string;
  error?: unknown;
};

export type SendgridResult = SendgridSuccess | SendgridFailure;

function extractErrorDetails(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object"
  ) {
    const response = error.response as {
      body?: { errors?: Array<{ message?: string }> };
      statusCode?: number;
    };
    const message =
      response.body?.errors?.map((item) => item.message).filter(Boolean).join("; ") ??
      "SendGrid API error";

    return {
      message,
      statusCode: response.statusCode
    };
  }

  if (error instanceof Error) {
    return { message: error.message, statusCode: undefined };
  }

  return { message: "Unknown SendGrid error", statusCode: undefined };
}

export async function sendWithSendgrid({
  to,
  subject,
  body,
  pdfBuffer,
  filename,
  from
}: SendgridParams): Promise<SendgridResult> {
  const env = getServerEnv();
  const apiKey = env.SENDGRID_API_KEY;
  const fromAddress = from ?? env.FROM_EMAIL;

  if (!apiKey) {
    return {
      ok: false,
      reason: "SENDGRID_API_KEY not configured"
    };
  }

  sgMail.setApiKey(apiKey);

  try {
    const [response] = await sgMail.send({
      to,
      from: fromAddress,
      subject,
      text: body,
      attachments: [
        {
          content: pdfBuffer.toString("base64"),
          type: "application/pdf",
          filename,
          disposition: "attachment"
        }
      ]
    });

    const header = response.headers["x-message-id"];
    const messageId = Array.isArray(header) ? header[0] ?? null : header ?? null;

    logger.info("email.sendgrid.sent", {
      to,
      messageId
    });

    return {
      ok: true,
      messageId
    };
  } catch (error) {
    const details = extractErrorDetails(error);
    logger.error("email.sendgrid.send_failed", {
      to,
      message: details.message,
      statusCode: details.statusCode
    });

    return {
      ok: false,
      reason: details.message,
      error
    };
  }
}
